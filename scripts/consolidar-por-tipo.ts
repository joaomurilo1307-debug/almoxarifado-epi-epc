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
];

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
      for (const dup of resto) {
        await repoint(dup.id, manter.id);
        await prisma.epiProduto.delete({ where: { id: dup.id } });
      }
      await prisma.epiProduto.update({ where: { id: manter.id }, data: { nome: regra.nomeFinal, ca: null, fabricante: null } });
      console.log(`[${regra.nomeFinal}] tamanho="${tamanho || "—"}": ${itens.length} fonte(s) -> 1 produto`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
