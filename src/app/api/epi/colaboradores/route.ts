import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { reconstruirItensNecessarios } from "@/lib/epiRebuild";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contratoId = searchParams.get("contratoId") || undefined;
  const q = searchParams.get("q")?.trim();

  const colaboradores = await prisma.epiColaborador.findMany({
    where: {
      ...(contratoId ? { contratoId } : {}),
      ...(q
        ? {
            OR: [
              { nomeCompleto: { contains: q, mode: "insensitive" } },
              { funcao: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { contrato: { select: { id: true, codigo: true, nome: true } } },
    orderBy: { nomeCompleto: "asc" },
  });
  return NextResponse.json(colaboradores);
}

const createSchema = z.object({
  nomeCompleto: z.string().min(1),
  contratoId: z.string().min(1),
  funcao: z.string().min(1),
  situacao: z.string().optional(),
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

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { nascimento, admissao, ...resto } = parsed.data;
  const contrato = await prisma.epiContrato.findUnique({ where: { id: resto.contratoId }, select: { id: true } });
  if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  let colaborador;
  try {
    colaborador = await prisma.epiColaborador.create({
      data: {
        ...resto,
        nomeCompleto: resto.nomeCompleto.trim(),
        funcao: resto.funcao.trim(),
        nascimento: nascimento ? new Date(nascimento) : null,
        admissao: admissao ? new Date(admissao) : null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Já existe um colaborador com esse nome nesse contrato." }, { status: 409 });
    }
    throw e;
  }
  // O mínimo do estoque nasce do uso real (quem usa o quê). Colaborador novo tem que entrar na conta na hora.
  const recalculo = await reconstruirItensNecessarios();
  return NextResponse.json({ ...colaborador, recalculo }, { status: 201 });
}
