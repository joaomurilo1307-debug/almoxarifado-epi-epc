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
  create: {
    tipo?: "EPI" | "EPC" | "FARDAMENTO" | "GERAL";
    categoria?: string | null;
    ca?: string | null;
    fabricante?: string | null;
    unidade?: string;
  },
  update: { ca?: string; unidade?: string; categoria?: string | null; fabricante?: string | null }
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

// Produtos cujo tamanho bate com um campo de verdade da ficha de cadastro
// do colaborador — pra esses, "quantas pessoas usam esse tamanho" é dado
// real (contagem direta), não estimativa. João apontou (31/08/2026, correto):
// a sugestão de mínimo estava usando o efetivo TOTAL do pool pra qualquer
// tamanho de qualquer produto (ex.: BOTA 42 e BOTA 35 recebiam a mesma
// sugestão, baseada em "todo mundo", não em quem calça 42 ou 35 de
// verdade). Luva, óculos, colete etc. não têm campo próprio de tamanho na
// ficha — continuam usando o efetivo geral do pool como aproximação.
const CAMPO_TAMANHO_POR_NOME: Record<string, "tamanhoBota" | "tamanhoCalca" | "tamanhoCamisa"> = {
  BOTA: "tamanhoBota",
  "BOTA COM PROTEÇÃO DE METATARSO": "tamanhoBota",
  CALÇA: "tamanhoCalca",
  "CAMISA DE MALHA": "tamanhoCamisa",
  "CAMISA JALECO": "tamanhoCamisa",
};

// Estoque atual de EPI/EPC nunca fica guardado direto no banco — é sempre recalculado
// a partir de estoqueInicial + soma de entradas - soma de saídas em EpiMovimentacao,
// pra nunca dessincronizar do histórico real (mesmo princípio da planilha Excel que
// deu origem a este módulo).
export async function listaEstoqueComCalculo(where: { contratoId?: string | null } = {}) {
  const [estoques, categoriaConfigs] = await Promise.all([
    prisma.epiEstoque.findMany({
      where,
      include: { produto: true, contrato: { select: { id: true, codigo: true, nome: true, percentualContingencia: true } } },
      orderBy: [{ produto: { nome: "asc" } }],
    }),
    prisma.epiCategoriaConfig.findMany(),
  ]);
  const categoriaPercentualMap = new Map(categoriaConfigs.map((c) => [c.categoria, c.percentualContingencia]));

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

  // O estoque de verdade só existe em 2 "pools" hoje (ver Estoque/Catálogo):
  // ECC (contrato próprio) e Geral — depósito central que atende os 5
  // contratos numerados de uma vez (eles não têm EpiEstoque próprio, sempre
  // aparecem com "0 itens"). Por isso a contagem por tamanho também soma
  // por pool, não por contrato numerado isolado — não dá pra ser mais fino
  // que o próprio estoque permite.
  const colaboradoresAtivos = await prisma.epiColaborador.findMany({
    where: { situacao: "ATIVO" },
    select: { tamanhoBota: true, tamanhoCalca: true, tamanhoCamisa: true, contrato: { select: { codigo: true } } },
  });
  const poolDoCodigo = (codigo: string) => (codigo === "ECC" ? "ECC" : "GERAL");
  const efetivoPorTamanho: Record<"tamanhoBota" | "tamanhoCalca" | "tamanhoCamisa", Map<string, Map<string, number>>> = {
    tamanhoBota: new Map(),
    tamanhoCalca: new Map(),
    tamanhoCamisa: new Map(),
  };
  for (const c of colaboradoresAtivos) {
    const pool = poolDoCodigo(c.contrato.codigo);
    for (const campo of ["tamanhoBota", "tamanhoCalca", "tamanhoCamisa"] as const) {
      const valor = c[campo];
      if (valor === null) continue;
      const porPool = efetivoPorTamanho[campo];
      if (!porPool.has(pool)) porPool.set(pool, new Map());
      const porTamanho = porPool.get(pool)!;
      const chave = String(valor);
      porTamanho.set(chave, (porTamanho.get(chave) ?? 0) + 1);
    }
  }

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
    // BOTA/CALÇA/CAMISA: efetivo real de quem usa ESSE tamanho (ficha de
    // cadastro), não o efetivo genérico do pool inteiro — sem isso, tamanho
    // raro (ex.: bota 34, 1 pessoa) e tamanho comum (ex.: bota 39, 24
    // pessoas) recebiam a mesma sugestão de mínimo, o que não faz sentido.
    const campoTamanho = CAMPO_TAMANHO_POR_NOME[e.produto.nome];
    const poolDoEstoque = e.contrato?.codigo === "ECC" ? "ECC" : "GERAL";
    const baseadoEmTamanho = Boolean(campoTamanho && e.produto.tamanho);
    const efetivo = baseadoEmTamanho
      ? efetivoPorTamanho[campoTamanho!].get(poolDoEstoque)?.get(e.produto.tamanho!) ?? 0
      : e.contratoId
        ? efetivoMap.get(e.contratoId) ?? 0
        : efetivoTotal;
    // Resolução em 3 níveis, do mais específico pro mais genérico: % do
    // próprio produto > % da categoria (Material de Escritório, etc.) > %
    // do contrato > 10% de fallback. `categoria` só vale como chave pra
    // GERAL (as 4 prateleiras) — em EPI ela virou a subcategoria por parte
    // do corpo (CABEÇA, MÃOS...) usada no Catálogo, dimensão diferente da
    // config de % "por categoria" da aba Métricas (que só conhece
    // EPI/EPC/FARDAMENTO + as 4 de Geral). Sem essa guarda, todo item EPI
    // deixaria de bater com a config "EPI" e cairia sempre no % do contrato.
    const categoriaChave = (e.produto.tipo === "GERAL" ? e.produto.categoria : null) ?? e.produto.tipo;
    const percentualEfetivo =
      e.produto.percentualContingencia ??
      categoriaPercentualMap.get(categoriaChave) ??
      e.contrato?.percentualContingencia ??
      0.1;
    // Além de "abaixo do mínimo" (COMPRAR), avisa quando já está chegando
    // perto (dentro de 20% acima do mínimo) — "ATENCAO", pra não deixar
    // descobrir só quando já faltou.
    let status: "OK" | "ATENCAO" | "COMPRAR" = "OK";
    if (atual < e.estoqueMinimo) status = "COMPRAR";
    else if (e.estoqueMinimo > 0 && atual < e.estoqueMinimo * 1.2) status = "ATENCAO";
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
      efetivoConsiderado: efetivo,
      sugestaoBaseadaEmTamanho: baseadoEmTamanho,
      necessidade,
      status,
      valorUnitario,
      valorEmEstoque: valorUnitario !== null ? Math.max(0, atual) * valorUnitario : null,
      valorNecessidade: valorUnitario !== null ? necessidade * valorUnitario : null,
    };
  });
}
