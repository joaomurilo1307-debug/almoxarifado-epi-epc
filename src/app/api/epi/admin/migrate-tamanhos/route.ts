import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Mesma lógica de scripts/migrate-tamanhos.ts, exposta via HTTP autenticado
// (console web da Hostinger inacessível pra automação nesta sessão — ver
// fix-ca-colete/route.ts). Idempotente: pode rodar de novo sem duplicar
// efeito. Ver o script pro contexto completo da auditoria de cada família.

const MERGE_CAMISA_MALHA = [
  { manter: "CAMISA DE MALHA G", remover: "CAMISA DE MALHA TAMANHO G" },
  { manter: "CAMISA DE MALHA GG", remover: "CAMISA DE MALHA TAMANHO GG" },
  { manter: "CAMISA DE MALHA M", remover: "CAMISA DE MALHA TAMANHO M" },
  { manter: "CAMISA DE MALHA P", remover: "CAMISA DE MALHA TAMANHO P" },
];

const RENOMEIO_EXPLICITO: { nome: string; novoNome: string; tamanho: string }[] = [
  { nome: "BOTA DE SEGURANÇA 35 BRACOL - CA25687", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25687", tamanho: "35" },
  { nome: "BOTA DE SEGURANÇA 38 BRACOL - CA25687", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25687", tamanho: "38" },
  { nome: "BOTA DE SEGURANÇA 39 BRACOL - CA25687", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25687", tamanho: "39" },
  { nome: "BOTA DE SEGURANÇA 40 BRACOL - CA25687", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25687", tamanho: "40" },
  { nome: "BOTA DE SEGURANÇA 44 BRACOL - CA25687", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25687", tamanho: "44" },
  { nome: "BOTA DE SEGURANÇA 35 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "35" },
  { nome: "BOTA DE SEGURANÇA 36 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "36" },
  { nome: "BOTA DE SEGURANÇA 37 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "37" },
  { nome: "BOTA DE SEGURANÇA 38 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "38" },
  { nome: "BOTA DE SEGURANÇA 39 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "39" },
  { nome: "BOTA DE SEGURANÇA 40 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "40" },
  { nome: "BOTA DE SEGURANÇA 41 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "41" },
  { nome: "BOTA DE SEGURANÇA 42 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "42" },
  { nome: "BOTA DE SEGURANÇA 43 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "43" },
  { nome: "BOTA DE SEGURANÇA 38 BOMPEL - CA37671", novoNome: "BOTA DE SEGURANÇA BOMPEL - CA37671", tamanho: "38" },
  { nome: "BOTA DE SEGURANÇA 40 BOMPEL - CA37671", novoNome: "BOTA DE SEGURANÇA BOMPEL - CA37671", tamanho: "40" },
  { nome: "BOTA DE SEGURANÇA 41 BOMPEL - CA37671", novoNome: "BOTA DE SEGURANÇA BOMPEL - CA37671", tamanho: "41" },
  { nome: "BOTA DE SEGURANÇA 40 BRACOL - CA42165", novoNome: "BOTA DE SEGURANÇA BRACOL - CA42165", tamanho: "40" },
  { nome: "BOTA DE SEGURANÇA 44 BRACOL - CA42165", novoNome: "BOTA DE SEGURANÇA BRACOL - CA42165", tamanho: "44" },
  { nome: "BOTA DE SEGURANÇA 42 BRACOL - CA25259", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25259", tamanho: "42" },
  { nome: "BOTA DE SEGURANÇA 43 BRACOL - CA25259", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25259", tamanho: "43" },
  { nome: "LUVA DE BORRACHA G - CA41918", novoNome: "LUVA DE BORRACHA - CA41918", tamanho: "G" },
  { nome: "LUVA DE BORRACHA M - CA41918", novoNome: "LUVA DE BORRACHA - CA41918", tamanho: "M" },
  { nome: "LUVA PU G DANNY - CA29014", novoNome: "LUVA PU DANNY - CA29014", tamanho: "G" },
  { nome: "LUVA PU M DANNY - CA29014", novoNome: "LUVA PU DANNY - CA29014", tamanho: "M" },
  { nome: "LUVA PU P DELTA - CA36365", novoNome: "LUVA PU DELTA - CA36365", tamanho: "P" },
  { nome: "LUVA PU M DELTA - CA36365", novoNome: "LUVA PU DELTA - CA36365", tamanho: "M" },
  { nome: "LUVA PU G DELTA - CA36365", novoNome: "LUVA PU DELTA - CA36365", tamanho: "G" },
  { nome: "LUVA PU GG DELTA - CA36365", novoNome: "LUVA PU DELTA - CA36365", tamanho: "GG" },
  { nome: "CAMISA DE MALHA TAMANHO EXG", novoNome: "CAMISA DE MALHA", tamanho: "EXG" },
];

type Regra = { descricao: string; match: RegExp; extrai: (m: RegExpMatchArray) => { novoNome: string; tamanho: string } };

const REGRAS: Regra[] = [
  {
    descricao: "Bota com cadarço bico composite",
    match: /^BOTA COM CADARÇO BICO COMPOSITE TAMANHO (\d{2})$/i,
    extrai: (m) => ({ novoNome: "BOTA COM CADARÇO BICO COMPOSITE", tamanho: m[1] }),
  },
  {
    descricao: "Bota sem cadarço bico composite",
    match: /^BOTA SEM CADARÇO BICO COMPOSITE TAMANHO (\d{2})$/i,
    extrai: (m) => ({ novoNome: "BOTA SEM CADARÇO BICO COMPOSITE", tamanho: m[1] }),
  },
  {
    descricao: "Calça uniforme",
    match: /^CALÇA (\d{2})(\s*\(HIGIENIZADA\))?$/i,
    extrai: (m) => ({ novoNome: "CALÇA", tamanho: m[1] + (m[2] ? " (Higienizada)" : "") }),
  },
  {
    descricao: "Calça policoton leve",
    match: /^CALÇA POLICOTON LEVE TAMANHO (\d{2})$/i,
    extrai: (m) => ({ novoNome: "CALÇA POLICOTON LEVE", tamanho: m[1] }),
  },
  {
    descricao: "Camisa de malha",
    match: /^CAMISA DE MALHA (PP|P|M|GG|G|XG|XXG)(\s*\(HIGIENIZADA\))?$/i,
    extrai: (m) => ({ novoNome: "CAMISA DE MALHA", tamanho: m[1].toUpperCase() + (m[2] ? " (Higienizada)" : "") }),
  },
  {
    descricao: "Camisa jaleco",
    match: /^CAMISA JALECO (PP|P|M|GG|G|XG|XXG)(\s*\(HIGIENIZADA\))?$/i,
    extrai: (m) => ({ novoNome: "CAMISA JALECO", tamanho: m[1].toUpperCase() + (m[2] ? " (Higienizada)" : "") }),
  },
];

async function repointEstoqueEMovimentacao(deId: string, paraId: string) {
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

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const log: string[] = [];

  for (const { manter, remover } of MERGE_CAMISA_MALHA) {
    const alvo = await prisma.epiProduto.findFirst({ where: { nome: manter } });
    const dup = await prisma.epiProduto.findFirst({ where: { nome: remover } });
    if (!alvo || !dup) {
      log.push(`[pular merge] "${remover}" -> "${manter}": não achou os dois lados`);
      continue;
    }
    await repointEstoqueEMovimentacao(dup.id, alvo.id);
    await prisma.epiProduto.delete({ where: { id: dup.id } });
    log.push(`[merge] "${remover}" removido -> "${manter}"`);
  }

  for (const { nome, novoNome, tamanho } of RENOMEIO_EXPLICITO) {
    const r = await prisma.epiProduto.updateMany({ where: { nome }, data: { nome: novoNome, tamanho } });
    log.push(r.count > 0 ? `[rename] "${nome}" -> "${novoNome}" (${tamanho})` : `[pular] "${nome}": não encontrado`);
  }

  const produtos = await prisma.epiProduto.findMany();
  for (const p of produtos) {
    for (const regra of REGRAS) {
      const m = p.nome.match(regra.match);
      if (!m) continue;
      const { novoNome, tamanho } = regra.extrai(m);
      await prisma.epiProduto.update({ where: { id: p.id }, data: { nome: novoNome, tamanho } });
      log.push(`[${regra.descricao}] "${p.nome}" -> "${novoNome}" (${tamanho})`);
      break;
    }
  }

  return NextResponse.json({ ok: true, totalLinhas: log.length, log });
}
