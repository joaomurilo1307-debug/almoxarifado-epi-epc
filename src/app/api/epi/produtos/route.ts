import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { codigoNovoProduto } from "@/lib/catalogoBase";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  const produtos = await prisma.epiProduto.findMany({
    where: q ? { nome: { contains: q, mode: "insensitive" } } : {},
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(produtos);
}

const createSchema = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["EPI", "EPC", "FARDAMENTO", "GERAL"]).default("EPI"),
  categoria: z.string().nullable().optional(),
  ca: z.string().nullable().optional(),
  fabricante: z.string().nullable().optional(),
  tamanho: z.string().nullable().optional(),
  higienizado: z.boolean().optional(),
  unidade: z.string().default("UNID"),
  // Código que agrupa esse item com os de outras marcas que cobrem a mesma função/tipo (ex.: CNS-PES-TIPOB
  // pra toda botina tipo B) — combinado com tamanho, é o que o cálculo de mínimo (lib/epi.ts) usa pra somar
  // estoque entre marcas em vez de pedir cada uma separado.
  skuCns: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const dados = { ...parsed.data, tamanho: parsed.data.tamanho?.trim() || null, skuCns: parsed.data.skuCns?.trim() || null };
  // o banco não barra repetido quando o tamanho é vazio (NULL), então confere aqui
  const jaExiste = await prisma.epiProduto.findFirst({ where: { nome: dados.nome, tamanho: dados.tamanho, higienizado: dados.higienizado ?? false }, select: { id: true } });
  if (jaExiste) return NextResponse.json({ error: "Esse item já existe no catálogo (mesmo nome, tamanho e higienizada)." }, { status: 409 });
  const codigo = await codigoNovoProduto(prisma, dados);
  try {
    const produto = await prisma.epiProduto.create({ data: { ...dados, codigo } });
    return NextResponse.json(produto, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Esse item já existe no catálogo (mesmo nome, tamanho e higienizada)." }, { status: 409 });
    throw e;
  }
}
