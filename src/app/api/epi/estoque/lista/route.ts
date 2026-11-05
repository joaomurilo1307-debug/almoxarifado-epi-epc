import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Estoque: uma linha por item do cadastro (código, tamanho, versão) e uma coluna por depósito/contrato que tem estoque.
// A quantidade é a contagem registrada (estoqueInicial): não há movimentação, entrada ou saída neste sistema novo.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const linhasEstoque = await prisma.epiEstoque.findMany({
    include: { produto: true, contrato: { select: { codigo: true, nome: true } } },
  });

  const depositos = new Map<string, { codigo: string; nome: string | null; unidades: number; itens: number }>();
  const porProduto = new Map<string, { produto: (typeof linhasEstoque)[number]["produto"]; quantidades: Record<string, number> }>();
  for (const e of linhasEstoque) {
    const dep = e.contrato?.codigo ?? "Geral";
    const d = depositos.get(dep) ?? { codigo: dep, nome: e.contrato?.nome ?? null, unidades: 0, itens: 0 };
    d.unidades += e.estoqueInicial;
    d.itens += 1;
    depositos.set(dep, d);
    const p = porProduto.get(e.produtoId) ?? { produto: e.produto, quantidades: {} };
    p.quantidades[dep] = (p.quantidades[dep] ?? 0) + e.estoqueInicial;
    porProduto.set(e.produtoId, p);
  }

  const linhas = [...porProduto.values()].map(({ produto: p, quantidades }) => ({
    produtoId: p.id,
    codigo: p.codigo,
    nome: p.nome,
    tamanho: p.tamanho,
    higienizado: p.higienizado,
    tipo: p.tipo,
    categoria: p.categoria,
    unidade: p.unidade,
    quantidades,
    total: Object.values(quantidades).reduce((n, q) => n + q, 0),
  }));

  return NextResponse.json({
    depositos: [...depositos.values()].sort((a, b) => (a.codigo === "Geral" ? -1 : b.codigo === "Geral" ? 1 : a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }))),
    linhas,
  });
}
