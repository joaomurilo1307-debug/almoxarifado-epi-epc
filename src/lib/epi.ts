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

// Pra EPI sem tamanho na ficha (capacete, colete, luva, óculos...), não tem
// campo direto pra contar — mas a matriz "Regras por função" (EpiFuncaoRegra,
// importada da aba "EPIs por Função") diz, por contrato, qual função usa
// qual EPI, em texto livre. Cruza por palavra-chave (testado linha a linha
// contra as 249 regras reais antes de subir) pra contar quantos
// colaboradores ATIVOS de fato precisam daquele item — mesma ideia do
// tamanho de bota/calça/camisa, só que via função em vez de campo direto.
// Cada padrão é "tem que conter todas as palavras de `inclui` e nenhuma de
// `exclui`" numa mesma linha da descrição (uma regra pode listar vários
// itens, um por linha — por isso o cruzamento é linha a linha, não na
// descrição inteira, senão "óculos incolor" e "óculos escuro" na mesma
// regra se misturariam). Item sem padrão aqui (acessório avulso, ou
// realmente sem regra de função — capa de chuva, protetor solar, macacão
// apicultor não estão na planilha de função) cai no efetivo geral do pool.
type PadraoFuncao = { inclui: string[]; exclui?: string[] };
const PADROES_FUNCAO: Record<string, PadraoFuncao[]> = {
  BALACLAVA: [{ inclui: ["balaclava"] }],
  "CAPACETE BRANCO": [{ inclui: ["capacete branco"] }],
  "CAPACETE AZUL": [{ inclui: ["capacete azul"] }],
  "CAPACETE LARANJA": [{ inclui: ["capacete laranja"] }],
  "CAPACETE CINZA": [{ inclui: ["capacete cinza"] }],
  CARNEIRA: [{ inclui: ["carneira"] }],
  "JUGULAR PARA CAPACETE": [{ inclui: ["jugular"] }],
  "TOUCA ÁRABE": [{ inclui: ["touca arabe"] }],
  "PROTETOR FACIAL TELADO": [{ inclui: ["protetor facial telado"] }],
  "ÓCULOS DE PROTEÇÃO INCOLOR": [{ inclui: ["oculos icolor"] }, { inclui: ["incolor"], exclui: ["banda elastica", "ampla visao", "sobrepor"] }],
  "ÓCULOS DE PROTEÇÃO ESCURO": [
    { inclui: ["oculos escuro"], exclui: ["banda elastica", "ampla visao", "sobrepor"] },
    { inclui: ["cinza"], exclui: ["banda elastica", "ampla visao", "sobrepor", "incolor"] },
  ],
  "ÓCULOS INCOLOR COM BANDA ELÁSTICA": [{ inclui: ["incolor", "banda elastica"] }],
  "ÓCULOS ESCURO COM BANDA ELÁSTICA": [{ inclui: ["cinza", "banda elastica"] }, { inclui: ["escuro", "banda elastica"] }],
  "COLETE REFLETIVO": [{ inclui: ["colete refletivo"] }],
  "COLETE SALVA-VIDAS": [{ inclui: ["colete salva"] }],
  "BLUSÃO DE OPERADOR DE MOTOSSERRA": [{ inclui: ["blusao de op"] }, { inclui: ["blusao operador"] }],
  "AVENTAL DE PVC": [{ inclui: ["avental"] }],
  "LUVA ANTICORTE": [{ inclui: ["anti corte"] }, { inclui: ["anticorte"] }],
  "LUVA DE OPERADOR DE MOTOSSERRA": [{ inclui: ["operador de motosserra"], exclui: ["calca", "blusao", "bota"] }],
  "LUVA DE LÁTEX": [{ inclui: ["latex"], exclui: ["descartaveis", "procedimento"] }],
  "LUVA DE LÁTEX DESCARTÁVEL": [{ inclui: ["latex", "descartaveis"] }, { inclui: ["latex", "procedimento"] }],
  "LUVA NITRILICA": [{ inclui: ["nitrilica"] }],
  "LUVA PU": [{ inclui: ["luva pu"] }],
  "LUVA DE VAQUETA": [{ inclui: ["vaqueta"], exclui: ["punho em raspa"] }],
  "LUVA DE RASPA CANO LONGO": [{ inclui: ["raspa cano longo"] }],
  "LUVA ANTI-IMPACTO": [{ inclui: ["impacto"] }], // fonte real: "luva anti - impacto - 5.774" (hífen com espaço nos dois lados)
  "LUVA ANTI-TÉRMICA": [{ inclui: ["agentes termicos"] }],
  "PERNEIRA COM PROTEÇÃO DE JOELHO": [{ inclui: ["protecao de joelho"] }],
  "PERNEIRA DE BIDIM": [{ inclui: ["perneira"], exclui: ["protecao de joelho"] }],
  "CALÇA DE OPERADOR DE MOTOSSERRA": [{ inclui: ["calca", "motosserra"] }],
  BOTA: [{ inclui: ["bota"], exclui: ["protecao de metatars"] }, { inclui: ["botina"], exclui: ["protecao de metatars"] }],
  "BOTA COM PROTEÇÃO DE METATARSO": [{ inclui: ["protecao de metatars"] }],
};
// AUDIÇÃO, RESPIRATORIO e BRAÇOS só têm 1 item canônico cada na planilha de
// função (conferido nas 249 regras) — não precisa de palavra-chave, a
// categoria da regra já basta.
const NOME_POR_CATEGORIA_UNICA: Record<string, string> = {
  "EPI - AUDIÇÃO": "PROTETOR AUDITIVO",
  "EPI - RESPIRATORIO": "PROTETOR RESPIRATÓRIO",
  "EPI - BRAÇOS": "MANGOTE",
};

function normFuncaoTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function bateComPadrao(padroes: PadraoFuncao[], linhaNormalizada: string): boolean {
  return padroes.some((p) => p.inclui.every((s) => linhaNormalizada.includes(s)) && !(p.exclui ?? []).some((s) => linhaNormalizada.includes(s)));
}

// A fun\u00e7\u00e3o na ficha do colaborador tem sufixo de n\u00edvel ("AUXILIAR DE CAMPO
// I, II E III") que a regra de EPI n\u00e3o tem ("AUXILIAR DE CAMPO") \u2014 comparar
// string exata zerava a contagem pra quase todo mundo (t\u00e9cnico de campo,
// bi\u00f3logo, veterin\u00e1rio, analista ambiental...). Conferido nas 21 fun\u00e7\u00f5es
// reais da ficha x 19 da regra: 8 s\u00f3 bateram depois de tirar acento e o
// sufixo de n\u00edvel; 2 t\u00eam erro de digita\u00e7\u00e3o/abrevia\u00e7\u00e3o na planilha de
// origem em si ("M\u00c9D. VETERINARIO", "AUXILIAR DE LABORA\u00d3RIO" sem o T) \u2014
// corrigidas via alias pontual, n\u00e3o uma regra geral (evita casar coisa que
// n\u00e3o devia).
const ALIAS_FUNCAO: Record<string, string> = {
  "MED VETERINARIO": "MEDICO VETERINARIO",
  "AUXILIAR DE LABORAORIO": "AUXILIAR DE LABORATORIO",
};
function normFuncaoNome(s: string): string {
  const base = s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
  return ALIAS_FUNCAO[base] ?? base;
}
// A fun\u00e7\u00e3o da regra ("AUXILIAR DE CAMPO") \u00e9 a base \u2014 a da ficha
// ("AUXILIAR DE CAMPO I, II E III", "COORDENADOR DE CONTRATOS") s\u00f3 pode
// ser igual, ter s\u00f3 um "S" de plural a mais, ou continuar com espa\u00e7o/v\u00edrgula
// (o sufixo de n\u00edvel) \u2014 nunca uma palavra diferente colada sem separador.
function funcaoColaboradorBateComRegra(funcaoColabNorm: string, funcaoRegraNorm: string): boolean {
  if (funcaoColabNorm === funcaoRegraNorm || funcaoColabNorm === funcaoRegraNorm + "S") return true;
  return funcaoColabNorm.startsWith(funcaoRegraNorm + " ") || funcaoColabNorm.startsWith(funcaoRegraNorm + ",");
}

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
    select: { tamanhoBota: true, tamanhoCalca: true, tamanhoCamisa: true, funcao: true, contratoId: true, contrato: { select: { codigo: true } } },
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

  // Efetivo por função (pra EPI sem tamanho na ficha): cruza cada regra
  // função→EPI (linha a linha, ver PADROES_FUNCAO acima) e soma quem tem
  // aquela função ativa, por pool. Uma regra é por contrato específico, mas
  // a soma final agrupa por pool (mesma limitação do estoque real).
  const funcaoRegras = await prisma.epiFuncaoRegra.findMany({ select: { contratoId: true, funcao: true, categoria: true, descricao: true } });
  // pares = "contratoId::funçãoNormalizada(da REGRA, forma base)" — a
  // comparação com a função da ficha (que tem o sufixo de nível) acontece
  // depois, via funcaoColaboradorBateComRegra, não por igualdade de string.
  const paresPorNome = new Map<string, Set<string>>();
  for (const [nome, padroes] of Object.entries(PADROES_FUNCAO)) {
    const pares = new Set<string>();
    for (const r of funcaoRegras) {
      const linhas = r.descricao.split(/\r?\n/).map(normFuncaoTexto);
      if (linhas.some((l) => bateComPadrao(padroes, l))) pares.add(`${r.contratoId}::${normFuncaoNome(r.funcao)}`);
    }
    if (pares.size > 0) paresPorNome.set(nome, pares);
  }
  for (const [categoriaRegra, nome] of Object.entries(NOME_POR_CATEGORIA_UNICA)) {
    const pares = new Set<string>();
    for (const r of funcaoRegras) if (r.categoria === categoriaRegra) pares.add(`${r.contratoId}::${normFuncaoNome(r.funcao)}`);
    if (pares.size > 0) paresPorNome.set(nome, pares);
  }
  const efetivoPorFuncao = new Map<string, { ECC: number; GERAL: number }>(); // nome do produto -> contagem por pool
  for (const [nome, pares] of paresPorNome) {
    const contagem = { ECC: 0, GERAL: 0 };
    const paresArr = [...pares].map((p) => {
      const i = p.indexOf("::");
      return { contratoId: p.slice(0, i), funcaoNorm: p.slice(i + 2) };
    });
    for (const c of colaboradoresAtivos) {
      const funcaoColabNorm = normFuncaoNome(c.funcao);
      const bate = paresArr.some((p) => p.contratoId === c.contratoId && funcaoColaboradorBateComRegra(funcaoColabNorm, p.funcaoNorm));
      if (bate) contagem[poolDoCodigo(c.contrato.codigo) as "ECC" | "GERAL"]++;
    }
    efetivoPorFuncao.set(nome, contagem);
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
    // Sem tamanho na ficha: tenta a contagem por função (quem realmente usa
    // esse EPI, pela matriz "Regras por função") antes de cair no efetivo
    // geral do pool inteiro — mesmo raciocínio do tamanho, só que pra item
    // sem variação de tamanho (capacete, colete, luva sem numeração etc.).
    const efetivoFuncao = !baseadoEmTamanho ? efetivoPorFuncao.get(e.produto.nome) : undefined;
    const baseadoEmFuncao = efetivoFuncao !== undefined;
    const efetivo = baseadoEmTamanho
      ? efetivoPorTamanho[campoTamanho!].get(poolDoEstoque)?.get(e.produto.tamanho!) ?? 0
      : baseadoEmFuncao
        ? efetivoFuncao![poolDoEstoque as "ECC" | "GERAL"]
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
      sugestaoBaseadaEmFuncao: baseadoEmFuncao,
      necessidade,
      status,
      valorUnitario,
      valorEmEstoque: valorUnitario !== null ? Math.max(0, atual) * valorUnitario : null,
      valorNecessidade: valorUnitario !== null ? necessidade * valorUnitario : null,
    };
  });
}
