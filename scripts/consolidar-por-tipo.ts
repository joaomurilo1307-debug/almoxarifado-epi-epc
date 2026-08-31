// Correção de rumo pedida pelo João (31/08/2026) — mesma lógica de
// src/app/api/epi/admin/consolidar-tipos/route.ts, ver o contexto completo
// lá. Resumo: a Fase 5 separou tamanho do nome mas manteve marca/CA como
// dimensão do produto (errado). Conferido contra a planilha "INFORMAÇÕES
// GERAIS - MRN" (aba "EPIs Mínimos" + pivot "Informações mínimas", feita
// pelo Matheus): o controle real é por TIPO + TAMANHO, marca é metadado
// incidental, não dimensão de produto.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Regra = { nomeFinal: string; fontes: string[] };

const TAMANHO_EMBUTIDO: { nome: string; tamanho: string }[] = [
  { nome: "BOTA DE SEGURANÇA 40 BRACOL - CA37455", tamanho: "40" },
  { nome: "BOTA DE SEGURANÇA 41 (PROTEÇÃO DE METARARSO) - CA43959", tamanho: "41" },
  { nome: "BOTA DE SEGURANÇA 41 (PROTEÇÃO DE METATARSO) - CA37450", tamanho: "41" },
  { nome: "LUVA PU G KALIPSO - CA15272", tamanho: "G" },
  { nome: "LUVA PU G SAFETY - CA32038", tamanho: "G" },
  { nome: "LUVA PU G VOLK - CA30916", tamanho: "G" },
  { nome: "LUVA ANTICORTE G - CA36606", tamanho: "G" },
  { nome: "LUVA ANTICORTE M - CA34000", tamanho: "M" },
];

const REGRAS: Regra[] = [
  {
    nomeFinal: "BOTA",
    fontes: [
      "BOTA COM CADARÇO BICO COMPOSITE",
      "BOTA SEM CADARÇO BICO COMPOSITE",
      "BOTA DE SEGURANÇA BRACOL - CA25687",
      "BOTA DE SEGURANÇA MARLUVAS - CA42374",
      "BOTA DE SEGURANÇA BOMPEL - CA37671",
      "BOTA DE SEGURANÇA BRACOL - CA42165",
      "BOTA DE SEGURANÇA BRACOL - CA25259",
      "BOTA DE SEGURANÇA 40 BRACOL - CA37455",
    ],
  },
  {
    nomeFinal: "BOTA COM PROTEÇÃO DE METATARSO",
    fontes: ["BOTA DE SEGURANÇA 41 (PROTEÇÃO DE METARARSO) - CA43959", "BOTA DE SEGURANÇA 41 (PROTEÇÃO DE METATARSO) - CA37450"],
  },
  {
    nomeFinal: "LUVA PU",
    fontes: ["LUVA PU DANNY - CA29014", "LUVA PU DELTA - CA36365", "LUVA PU G KALIPSO - CA15272", "LUVA PU G SAFETY - CA32038", "LUVA PU G VOLK - CA30916"],
  },
  { nomeFinal: "LUVA ANTICORTE", fontes: ["LUVA ANTICORTE - CA12872", "LUVA ANTICORTE G - CA36606", "LUVA ANTICORTE M - CA34000"] },
  { nomeFinal: "LUVA DE BORRACHA", fontes: ["LUVA DE BORRACHA - CA25313", "LUVA DE BORRACHA - CA41918", "LUVA DE BORRACHA - CA5774"] },
  { nomeFinal: "CAPA DE CHUVA", fontes: ["CAPA DE CHUVA", "CAPA DE CHUVA AMARELA", "Capa de chuva (Brascamp)"] },
  { nomeFinal: "CAPACETE AZUL", fontes: ["CAPACETE AZUL 3M - CA29638", "CAPACETE CLASE B AZUL"] },
  { nomeFinal: "TOUCA ÁRABE", fontes: ["TOUCA ÁRABE - CA28998", "TOUCA ÁRABE - CA39760", "TOUCA ÁRABE - CA44963", "TOUCA ÁRABE - CA49731"] },
  {
    nomeFinal: "PROTETOR AUDITIVO",
    fontes: ["PROTETOR AUDITIVO 3M - CA33835", "PROTETOR AUDITIVO LIBUS - CA37134", "PROTETOR AUDITIVO LIBUS - CA43350", "PROTETOR AUDITIVO MSA - CA27971"],
  },
  {
    nomeFinal: "PROTETOR RESPIRATÓRIO",
    fontes: [
      "PROTETOR RESPIRÁTORIO - CA10578",
      "PROTETOR RESPIRÁTORIO - CA38812",
      "PROTETOR RESPIRÁTORIO - CA38954",
      "PROTETOR RESPIRÁTORIO - CA5657",
      "PROTETOR RESPIRÁTORIO - CA7072",
    ],
  },
  { nomeFinal: "PERNEIRA", fontes: ["PERNEIRA - CA39624", "PERNEIRA - CA44234", "PERNEIRA - CA48785"] },
  { nomeFinal: "ÓCULOS DE PROTEÇÃO INCOLOR", fontes: ["ÓCULOS DE PROTEÇÃO INCOLOR - CA11268", "ÓCULOS DE PROTEÇÃO INCOLOR - CA14991"] },
  { nomeFinal: "LUVA DE PVC", fontes: ["LUVA DE PVC", "LUVA DE PVC - CA34570"] },
  { nomeFinal: "LUVA MISTA CANO LONGO", fontes: ["LUVA MISTA CANO LONGO - CA36845", "LUVA MISTA CANO LONGO - CA40319"] },
  { nomeFinal: "LUVA NITRILICA", fontes: ["LUVA NITRILICA", "LUVA NITRILICA - CA25280"] },
  { nomeFinal: "MANGOTE", fontes: ["MANGOTE - CA12107", "MANGOTE - CA41029"] },
  { nomeFinal: "ÓCULOS DE PROTEÇÃO ESCURO", fontes: ["ÓCULOS DE PROTEÇÃO ESCURO - CA11268", "ÓCULOS DE PROTEÇÃO ESCURO - CA20716"] },
  { nomeFinal: "LUVA VAQUETA", fontes: ["LUVA VAQUETA", "LUVA DE VAQUETA - CA11711"] },
  {
    nomeFinal: "PERNEIRA COM PROTEÇÃO DE JOELHO",
    fontes: ["PERNEIRA DE BEDIM COM JOELHEIRA - TECMATER", "PERNEIRA DE BEDIM JOELHEIRA", "Perneira com proteção nos joelhos (Sthil)"],
  },
  { nomeFinal: "ÓCULOS INCOLOR COM BANDA ELÁSTICA", fontes: ["OCULOS BANDA ELASTICA INCOLOR", "ÓCULOS DE PROTEÇÃO INCOLOR COM BANDA ELASTICA - CA39190"] },
  { nomeFinal: "ÓCULOS ESCURO COM BANDA ELÁSTICA", fontes: ["OCULOS BANDA ELASTICA PRETO", "ÓCULOS DE PROTEÇÃO ESCURO COM BANDA ELASTICA - CA39190"] },

  // Terceira leva (31/08/2026) — ver comentário completo em
  // src/app/api/epi/admin/consolidar-tipos/route.ts (fonte da verdade).
  { nomeFinal: "PROTETOR AUDITIVO", fontes: ["PROTETOR AUDITIVO", "ABAFADOR DE RUIDOS TP CONCHA ACOPLAR"] },
  { nomeFinal: "AVENTAL DE PVC", fontes: ["AVENTAL DE PVC", "AVENTAL - CA11793"] },
  { nomeFinal: "LUVA ANTICORTE", fontes: ["LUVA ANTICORTE", "LUVA AGENTES MECANICOS", "LUVA PU CUT ANTI CORTE"] },
  {
    nomeFinal: "ÓCULOS DE PROTEÇÃO INCOLOR",
    fontes: ["ÓCULOS DE PROTEÇÃO INCOLOR", "OCULOS DE SEGURANÇA ANTIRRISCO INCOLOR", "Óculos de segurança convencional (claro ou escuro)"],
  },
  { nomeFinal: "ÓCULOS DE PROTEÇÃO ESCURO", fontes: ["ÓCULOS DE PROTEÇÃO ESCURO", "OCULOS DE SEGURANÇA ANTIRRISCO CINZA"] },
  {
    nomeFinal: "ÓCULOS DE AMPLA VISÃO INCOLOR",
    fontes: [
      "ÓCULOS DE PROTEÇÃO INCOLOR AMPLA VISÃO - CA12572",
      "ÓCULOS DE PROTEÇÃO INCOLOR DE SOBREPOSIÇÃO - CA16462",
      "OCULOS SEGURANÇA SOBREPOR",
      "ÓCULOS DE PROTEÇÃO INCOLOR DE SOBREPOSIÇÃO E BANDA ELASTICA - CA19072",
    ],
  },
  {
    nomeFinal: "ÓCULOS DE AMPLA VISÃO ESCURO",
    fontes: ["ÓCULOS DE PROTEÇÃO ESCURO AMPLA VISÃO - CA9722", "ÓCULOS DE PROTEÇÃO ESCURO DE SOBREPOSIÇÃO - CA16462"],
  },
  {
    nomeFinal: "ÓCULOS INCOLOR COM BANDA ELÁSTICA",
    fontes: ["ÓCULOS INCOLOR COM BANDA ELÁSTICA", "Óculos de segurança com banda elástica (claro ou escuro)"],
  },
  { nomeFinal: "CALÇA", fontes: ["CALÇA", "CALÇA POLICOTON LEVE"] },
  { nomeFinal: "CAMISA JALECO", fontes: ["CAMISA JALECO", "JALECO POLICOTON LEVE"] },
  { nomeFinal: "COLETE REFLETIVO", fontes: ["COLETE REFLETIVO", "COLETE LARANJA", "COLETE VERDE"] },
  { nomeFinal: "BLUSÃO DE OPERADOR DE MOTOSSERRA", fontes: ["BLUSÃO DE OPERADOR - CA46231"] },
  { nomeFinal: "CALÇA DE OPERADOR DE MOTOSSERRA", fontes: ["CALÇA DE OPERADOR - CA36600"] },
  { nomeFinal: "CAPACETE BRANCO", fontes: ["CAPACETE BRANCO MSA - CA498"] },
  { nomeFinal: "CAPACETE CINZA", fontes: ["CAPACETE CINZA MSA - CA498"] },
  { nomeFinal: "CAPACETE LARANJA", fontes: ["CAPACETE LARANJA MSA - CA498"] },
  { nomeFinal: "CARNEIRA", fontes: ["Carneira para capacete"] },
  { nomeFinal: "BOTA DE PVC", fontes: ["Bota de segurança impermeável"] },
  { nomeFinal: "LUVA DE OPERADOR DE MOTOSSERRA", fontes: ["Luva motosserrista vaqueta"] },
  { nomeFinal: "LUVA ANTI-TÉRMICA", fontes: ["Luva térmica"] },
  { nomeFinal: "LUVA DE LÁTEX", fontes: ["Luva impermeável (Solvex)"] },
  { nomeFinal: "LUVA DE LÁTEX DESCARTÁVEL", fontes: ["LUVA DE LATEX - CA13030"] },
  { nomeFinal: "LUVA ANTI-IMPACTO", fontes: ["LUVA ANTI-IMPACTO - CA44549"] },
  { nomeFinal: "LUVA DE RASPA CANO LONGO", fontes: ["LUVA DE RASPA CANO LOGO - CA40320"] },
  { nomeFinal: "LUVA DE SEGURANÇA DESCARTÁVEL 8X100 UND", fontes: ["LUVA DE SEGURANÇA DESCATAVEL 8X100 UND"] },
  { nomeFinal: "LUVA MISTA", fontes: ["LUVA MISTA - CA52131"] },
  { nomeFinal: "LUVA DE VAQUETA", fontes: ["LUVA VAQUETA"] },
  { nomeFinal: "PERNEIRA DE BIDIM", fontes: ["PERNEIRA"] },
  { nomeFinal: "PROTETOR FACIAL DE ACRÍLICO", fontes: ["PROTETOR FACIAL DE ACRILICO - CA311814"] },
  { nomeFinal: "COLETE SALVA-VIDAS", fontes: ["Colete salva-vidas (Homolog. Marinha nº 062/2012)"] },
  { nomeFinal: "KIT MOTOSSERRISTA UNIFORME", fontes: ["KIT MOTOSSERRISTA UNIFOEME"] },
  { nomeFinal: "TOUCA ÁRABE COM ABA", fontes: ["TOUCA ARABE COM ABA"] },
  { nomeFinal: "TOUCA ÁRABE SEM ABA", fontes: ["TOUCA ARABE SEM ABA"] },
  { nomeFinal: "BOTA", fontes: ["Coturno Preta Bico De Aço Laranja 60C32MTAMEX Cadarço"] },
];

const UNIDADE_PADRAO: { nome: string; unidade: string }[] = [
  { nome: "BOTA", unidade: "PAR(ES)" },
  { nome: "BOTA COM PROTEÇÃO DE METATARSO", unidade: "PAR(ES)" },
];

// Ver comentário completo em route.ts (fonte da verdade).
const TIPOS_FALTANTES = ["BALACLAVA", "PROTETOR FACIAL TELADO", "MACACÃO APICULTOR", "PROTETOR SOLAR"];

async function repoint(deId: string, paraId: string) {
  const estoquesDup = await prisma.epiEstoque.findMany({ where: { produtoId: deId } });
  for (const e of estoquesDup) {
    const existente = await prisma.epiEstoque.findFirst({ where: { produtoId: paraId, contratoId: e.contratoId } });
    if (existente) {
      await prisma.epiEstoque.update({ where: { id: existente.id }, data: { estoqueInicial: existente.estoqueInicial + e.estoqueInicial } });
      await prisma.epiEstoque.delete({ where: { id: e.id } });
    } else {
      await prisma.epiEstoque.update({ where: { id: e.id }, data: { produtoId: paraId } });
    }
  }
  await prisma.epiMovimentacao.updateMany({ where: { produtoId: deId }, data: { produtoId: paraId } });
}

async function main() {
  for (const { nome, tamanho } of TAMANHO_EMBUTIDO) {
    const r = await prisma.epiProduto.updateMany({ where: { nome, tamanho: null }, data: { tamanho } });
    if (r.count > 0) console.log(`[tamanho embutido] "${nome}" -> tamanho="${tamanho}"`);
  }

  for (const regra of REGRAS) {
    const produtos = await prisma.epiProduto.findMany({ where: { nome: { in: regra.fontes } } });
    if (produtos.length === 0) {
      console.log(`[pular] "${regra.nomeFinal}": nenhuma fonte encontrada`);
      continue;
    }
    const porTamanho = new Map<string, typeof produtos>();
    for (const p of produtos) {
      const chave = p.tamanho ?? "";
      if (!porTamanho.has(chave)) porTamanho.set(chave, []);
      porTamanho.get(chave)!.push(p);
    }
    for (const [tamanho, itens] of porTamanho) {
      const [manter, ...resto] = itens;
      if (resto.length === 0 && manter.nome === regra.nomeFinal && manter.ca === null && manter.fabricante === null) continue;
      for (const dup of resto) {
        await repoint(dup.id, manter.id);
        await prisma.epiProduto.delete({ where: { id: dup.id } });
      }
      await prisma.epiProduto.update({ where: { id: manter.id }, data: { nome: regra.nomeFinal, ca: null, fabricante: null } });
      console.log(`[${regra.nomeFinal}] tamanho="${tamanho || "—"}": ${itens.length} fonte(s) -> 1 produto`);
    }
  }

  for (const { nome, unidade } of UNIDADE_PADRAO) {
    const r = await prisma.epiProduto.updateMany({ where: { nome, unidade: { not: unidade } }, data: { unidade } });
    if (r.count > 0) console.log(`[unidade] "${nome}": ${r.count} linha(s) -> "${unidade}"`);
  }

  for (const nome of TIPOS_FALTANTES) {
    const existente = await prisma.epiProduto.findFirst({ where: { nome, tipo: "EPI" } });
    if (existente) {
      console.log(`[tipo faltante] "${nome}": já existe, não recriado`);
      continue;
    }
    const produto = await prisma.epiProduto.create({ data: { nome, tipo: "EPI", unidade: "UNID" } });
    await prisma.epiEstoque.create({ data: { produtoId: produto.id, contratoId: null, estoqueInicial: 0, estoqueMinimo: 0 } });
    console.log(`[tipo faltante] "${nome}": criado (estoque 0, sem CA/fabricante)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
