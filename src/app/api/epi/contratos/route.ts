import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const contratos = await prisma.epiContrato.findMany({
    orderBy: { codigo: "asc" },
    include: { _count: { select: { colaboradores: true } } },
  });
  return NextResponse.json(contratos);
}

const createSchema = z.object({
  codigo: z.string().trim().min(1, "Informe o código do contrato").max(30),
  nome: z.string().trim().max(120).nullable().optional(),
  percentualContingencia: z.number().min(0).max(1).optional(),
});

// Contrato novo = centro de custo novo. Com ele cadastrado, os colaboradores dele entram no cálculo do pedido sozinhos:
// código só com números (MRN) é abastecido pelo ECC; ECC, Sede, AGA e qualquer outro código, pelo Geral.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { codigo, nome, percentualContingencia } = parsed.data;
  const existente = await prisma.epiContrato.findFirst({ where: { codigo: { equals: codigo, mode: "insensitive" } } });
  if (existente) return NextResponse.json({ error: `Já existe o contrato ${existente.codigo}.` }, { status: 409 });

  const contrato = await prisma.epiContrato.create({
    data: { codigo, nome: nome || null, ...(percentualContingencia !== undefined ? { percentualContingencia } : {}) },
  });
  return NextResponse.json(contrato, { status: 201 });
}
