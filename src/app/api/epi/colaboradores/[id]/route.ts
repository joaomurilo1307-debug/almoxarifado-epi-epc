import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { reconstruirItensNecessarios } from "@/lib/epiRebuild";

const patchSchema = z.object({
  nomeCompleto: z.string().min(1).optional(),
  funcao: z.string().min(1).optional(),
  situacao: z.string().optional(),
  contratoId: z.string().optional(),
  tamanhoBota: z.number().int().nullable().optional(),
  tamanhoCamisa: z.string().nullable().optional(),
  tamanhoCalca: z.number().int().nullable().optional(),
  cpf: z.string().nullable().optional(),
  rg: z.string().nullable().optional(),
  nascimento: z.string().nullable().optional(),
  admissao: z.string().nullable().optional(),
  moradia: z.string().nullable().optional(),
  endereco: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { nascimento, admissao, ...resto } = parsed.data;
  let colaborador;
  try {
    colaborador = await prisma.epiColaborador.update({
      where: { id: params.id },
      data: {
        ...resto,
        ...(nascimento !== undefined ? { nascimento: nascimento ? new Date(nascimento) : null } : {}),
        ...(admissao !== undefined ? { admissao: admissao ? new Date(admissao) : null } : {}),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Já existe um colaborador com esse nome nesse contrato." }, { status: 409 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return NextResponse.json({ error: "Colaborador não encontrado" }, { status: 404 });
    throw e;
  }
  // Função, situação (ativo/inativo) ou tamanho mudou: o que ele usa muda, então o mínimo do estoque também.
  if (["funcao", "situacao", "tamanhoBota", "tamanhoCalca", "tamanhoCamisa"].some((c) => c in resto)) await reconstruirItensNecessarios();
  return NextResponse.json(colaborador);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  await prisma.epiColaborador.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
