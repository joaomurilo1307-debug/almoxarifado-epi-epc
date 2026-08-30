import { prisma } from "@/lib/prisma";

// Prisma nao aceita `null` direto dentro do objeto de where composto de um
// @@unique quando um dos campos e opcional (o tipo gerado exige o escalar, nao
// aceita `| null` ali) — mesmo o banco permitindo. Por isso, pra qualquer
// upsert onde contratoId/tamanho pode ser nulo (deposito geral, produto sem
// tamanho), fazemos find-then-create/update manual em vez de `.upsert()`.

export async function upsertEpiEstoque(
  produtoId: string,
  contratoId: string | null,
  data: { estoqueInicial: number; estoqueMinimo: number }
) {
  const existente = await prisma.epiEstoque.findFirst({ where: { produtoId, contratoId } });
  if (existente) {
    return prisma.epiEstoque.update({ where: { id: existente.id }, data });
  }
  return prisma.epiEstoque.create({ data: { produtoId, contratoId, ...data } });
}

export async function upsertEpiProdutoPorNome(
  nome: string,
  tamanho: string | null,
  create: { tipo?: "EPI" | "EPC" | "FARDAMENTO" | "GERAL"; categoria?: string | null; ca?: string | null; unidade?: string },
  update: { ca?: string; unidade?: string; categoria?: string | null }
) {
  const existente = await prisma.epiProduto.findFirst({ where: { nome, tamanho } });
  if (existente) {
    return prisma.epiProduto.update({ where: { id: existente.id }, data: update });
  }
  return prisma.epiProduto.create({ data: { nome, tamanho, ...create } });
}

// Estoque mínimo nunca fica fracionado — se o cálculo (efetivo x %) pedir 0.2
// unidade, ainda precisa de 1 unidade real pra cobrir; por isso sempre
// arredonda pra cima (mesma regra da planilha que deu origem a este módulo).
export function calcularMinimoSugerido(efetivo: number, percentual: number): number {
  if (efetivo <= 0) return 0;
  return Math.max(0, Math.ceil(efetivo * percentual));
}

// Estoque atual de EPI/EPC nunca fica guardado direto no banco — é sempre recalculado
// a partir de estoqueInicial + soma de entradas - soma de saídas em EpiMovimentacao,
// pra nunca dessincronizar do histórico real (mesmo princípio da planilha Excel que
// deu origem a este módulo).
export async function listaEstoqueComCalculo(where: { contratoId?: string | null } = {}) {
  const estoques = await prisma.epiEstoque.findMany({
    where,
    include: { produto: true, contrato: { select: { id: true, codigo: true, nome: true, percentualContingencia: true } } },
    orderBy: [{ produto: { nome: "asc" } }],
  });

  const movs = await prisma.epiMovimentacao.groupBy({
    by: ["produtoId", "contratoId", "tipo"],
    _sum: { quantidade: true },
  });

  // Efetivo (colaboradores ativos) por contrato, pra sugerir o mínimo a
  // partir do % — base real, sem inventar cruzamento fino por função: usa o
  // efetivo total do contrato (mesmo conceito do "Efetivo Total" do
  // dashboard), não uma contagem de quem exatamente usa aquele item.
  const efetivoPorContrato = await prisma.epiColaborador.groupBy({
    by: ["contratoId"],
    where: { situacao: "ATIVO" },
    _count: { _all: true },
  });
  const efetivoMap = new Map(efetivoPorContrato.map((e) => [e.contratoId, e._count._all]));
  const efetivoTotal = efetivoPorContrato.reduce((soma, e) => soma + e._count._all, 0);

  function movFor(produtoId: string, contratoId: string | null) {
    let entradas = 0;
    let saidas = 0;
    for (const m of movs) {
      if (m.produtoId !== produtoId) continue;
      if ((m.contratoId ?? null) !== (contratoId ?? null)) continue;
      if (m.tipo === "ENTRADA") entradas += m._sum.quantidade ?? 0;
      else saidas += m._sum.quantidade ?? 0;
    }
    return { entradas, saidas };
  }

  return estoques.map((e) => {
    const { entradas, saidas } = movFor(e.produtoId, e.contratoId);
    const atual = e.estoqueInicial + entradas - saidas;
    const necessidade = Math.max(0, Math.ceil(e.estoqueMinimo - atual));
    const valorUnitario = e.produto.valorUnitario ?? null;
    const efetivo = e.contratoId ? efetivoMap.get(e.contratoId) ?? 0 : efetivoTotal;
    const percentualEfetivo = e.produto.percentualContingencia ?? e.contrato?.percentualContingencia ?? 0.1;
    return {
      id: e.id,
      produto: e.produto,
      contrato: e.contrato,
      estoqueInicial: e.estoqueInicial,
      entradas,
      saidas,
      estoqueAtual: atual,
      estoqueMinimo: e.estoqueMinimo,
      minimoSugerido: calcularMinimoSugerido(efetivo, percentualEfetivo),
      necessidade,
      status: atual < e.estoqueMinimo ? ("COMPRAR" as const) : ("OK" as const),
      valorUnitario,
      valorEmEstoque: valorUnitario !== null ? Math.max(0, atual) * valorUnitario : null,
      valorNecessidade: valorUnitario !== null ? necessidade * valorUnitario : null,
    };
  });
}
