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

function poolDoCodigo(codigo: string): "ECC" | "GERAL" {
  return codigo === "ECC" ? "ECC" : "GERAL";
}

// Estoque atual de EPI/EPC nunca fica guardado direto no banco — é sempre recalculado
// a partir de estoqueInicial + soma de entradas - soma de saídas em EpiMovimentacao,
// pra nunca dessincronizar do histórico real (mesmo princípio da planilha Excel que
// deu origem a este módulo).
//
// João pediu (31/08/2026): parar de calcular "quantidade em uso" cruzando
// texto livre a cada requisição (frágil — já rendeu 2 rodadas de bug real)
// e em vez disso ler de uma tabela real, pré-computada e auditável:
// EpiColaboradorItem (colaborador X precisa do item Y, no tamanho Z) —
// gerada pelo endpoint /api/epi/admin/rebuild-colaborador-item a partir da
// ficha + da matriz "EPIs por Função". "Mínimo" deixa de ser um número
// importado congelado e vira SEMPRE o cálculo (quantidade em uso × %) —
// quando não há nenhum EpiColaboradorItem pra um produto+tamanho, não
// existe mínimo calculado (fica null, mostrado como "sem dado de uso" na
// tela, nunca um número inventado).
export async function listaEstoqueComCalculo(where: { contratoId?: string | null } = {}) {
  const [estoques, categoriaConfigs, itensNecessarios] = await Promise.all([
    prisma.epiEstoque.findMany({
      where,
      include: { produto: true, contrato: { select: { id: true, codigo: true, nome: true, percentualContingencia: true } } },
      orderBy: [{ produto: { nome: "asc" } }],
    }),
    prisma.epiCategoriaConfig.findMany(),
    prisma.epiColaboradorItem.findMany({
      include: { colaborador: { select: { situacao: true, contrato: { select: { codigo: true } } } } },
    }),
  ]);
  const categoriaPercentualMap = new Map(categoriaConfigs.map((c) => [c.categoria, c.percentualContingencia]));

  const movs = await prisma.epiMovimentacao.groupBy({
    by: ["produtoId", "contratoId", "tipo"],
    _sum: { quantidade: true },
  });

  // "Quantidade em uso" real, por produto+tamanho+pool — direto da tabela
  // EpiColaboradorItem, já filtrando quem foi desligado depois do último
  // rebuild (não precisa rodar o rebuild toda vez que alguém sai).
  const efetivoPorProduto = new Map<string, Map<string, Map<string, number>>>(); // nome -> pool -> tamanho("" se null) -> contagem
  for (const item of itensNecessarios) {
    if (item.colaborador.situacao !== "ATIVO") continue;
    const pool = poolDoCodigo(item.colaborador.contrato.codigo);
    const chaveTamanho = item.tamanho ?? "";
    if (!efetivoPorProduto.has(item.produtoNome)) efetivoPorProduto.set(item.produtoNome, new Map());
    const porPool = efetivoPorProduto.get(item.produtoNome)!;
    if (!porPool.has(pool)) porPool.set(pool, new Map());
    const porTamanho = porPool.get(pool)!;
    porTamanho.set(chaveTamanho, (porTamanho.get(chaveTamanho) ?? 0) + 1);
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
    const valorUnitario = e.produto.valorUnitario ?? null;
    const poolDoEstoque = e.contrato?.codigo === "ECC" ? "ECC" : "GERAL";
    const chaveTamanho = e.produto.tamanho ?? "";
    const efetivo = efetivoPorProduto.get(e.produto.nome)?.get(poolDoEstoque)?.get(chaveTamanho);
    const temDadoReal = efetivo !== undefined;

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

    // Mínimo = SEMPRE o cálculo (quantidade real em uso × %), nunca um
    // número importado congelado. Sem dado real de uso, não existe mínimo
    // — null, não um número inventado. `estoqueMinimo` (coluna antiga,
    // importada da planilha original) só serve de referência histórica
    // agora, não entra mais no status nem na necessidade de compra.
    const minimo = temDadoReal ? calcularMinimoSugerido(efetivo!, percentualEfetivo) : null;
    const necessidade = minimo !== null ? Math.max(0, Math.ceil(minimo - atual)) : 0;

    // Além de "abaixo do mínimo" (COMPRAR), avisa quando já está chegando
    // perto (dentro de 20% acima do mínimo) — "ATENCAO", pra não deixar
    // descobrir só quando já faltou. Sem mínimo calculado, não dá pra
    // avaliar — "SEM_DADO", não "OK" (OK seria afirmar algo que não sabemos).
    let status: "OK" | "ATENCAO" | "COMPRAR" | "SEM_DADO" = "SEM_DADO";
    if (minimo !== null) {
      if (atual < minimo) status = "COMPRAR";
      else if (minimo > 0 && atual < minimo * 1.2) status = "ATENCAO";
      else status = "OK";
    }

    return {
      id: e.id,
      produto: e.produto,
      contrato: e.contrato,
      estoqueInicial: e.estoqueInicial,
      entradas,
      saidas,
      estoqueAtual: atual,
      estoqueMinimoAntigo: e.estoqueMinimo, // histórico, importado — não usado no status/necessidade
      estoqueMinimo: minimo,
      efetivoConsiderado: efetivo ?? null,
      temDadoDeUso: temDadoReal,
      necessidade,
      status,
      valorUnitario,
      valorEmEstoque: valorUnitario !== null ? Math.max(0, atual) * valorUnitario : null,
      valorNecessidade: valorUnitario !== null ? necessidade * valorUnitario : null,
    };
  });
}
