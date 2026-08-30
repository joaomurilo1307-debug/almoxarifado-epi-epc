// Migração pontual (30/08/2026, pedido do João: "no catálogo... mostra a
// bota, e embaixo no drill down abre e mostra quantos tem de cada tamanho").
//
// Objetivo: separar o TAMANHO do NOME em produtos que são o mesmo
// equipamento/modelo em vários tamanhos, usando o campo `tamanho` que já
// existe no schema (só não estava sendo usado). Depois disso, o catálogo
// agrupa por nome (agora limpo) e mostra os tamanhos como filhos.
//
// Auditoria feita ANTES de escrever este script (nada aqui é regex cega
// rodando sem checagem prévia):
//  - Toda família abaixo foi conferida uma a uma: mesmo C.A. (quando tem) e
//    mesmo modelo/fabricante — nunca "mesmo C.A." sozinho (ver o alerta em
//    merge-duplicates.ts: cor também compartilha C.A., e isso NÃO é motivo
//    pra juntar). Capacetes (CA498, cores) e óculos (5 grupos, cores) that
//    share C.A. mas variam por COR foram excluídos de propósito — não são
//    tamanho, não entram aqui.
//  - "LUVA ANTICORTE G - CA36606" vs "LUVA ANTICORTE M - CA34000" têm CA
//    DIFERENTE apesar do nome parecido — não é família, ficam como estão.
//  - "LUVA DE LATEX - CA13030" vs "LUVA DE SEGURANÇA DESCARTÁVEL 8X100 UND"
//    compartilham CA13030 mas são itens diferentes — não entram aqui.
//
// Duplicidade real encontrada (2 estilos de nome pro mesmo tamanho, vindos
// de importações diferentes — mesmo padrão do merge-duplicates.ts): a
// "CAMISA DE MALHA TAMANHO G/GG/M/P" (import ECC) é o mesmo item que já
// existe como "CAMISA DE MALHA G/GG/M/P" (import Geral/MRN) — confirmado
// que cada par está em CONTRATOS DIFERENTES (nunca colide no mesmo
// contrato). "TAMANHO EXG" não tem par (só existe no ECC) — não junta,
// só ganha tamanho="EXG".

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---- 1) Duplicidade real: funde a variante "TAMANHO X" na variante canônica ----
const MERGE_CAMISA_MALHA = [
  { manter: "CAMISA DE MALHA G", remover: "CAMISA DE MALHA TAMANHO G" },
  { manter: "CAMISA DE MALHA GG", remover: "CAMISA DE MALHA TAMANHO GG" },
  { manter: "CAMISA DE MALHA M", remover: "CAMISA DE MALHA TAMANHO M" },
  { manter: "CAMISA DE MALHA P", remover: "CAMISA DE MALHA TAMANHO P" },
];

// ---- 2) Famílias por C.A. — lista explícita, uma a uma, sem regex no CA ----
const RENOMEIO_EXPLICITO: { nome: string; novoNome: string; tamanho: string }[] = [
  // Bota de Segurança BRACOL - CA25687 (5 tamanhos)
  { nome: "BOTA DE SEGURANÇA 35 BRACOL - CA25687", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25687", tamanho: "35" },
  { nome: "BOTA DE SEGURANÇA 38 BRACOL - CA25687", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25687", tamanho: "38" },
  { nome: "BOTA DE SEGURANÇA 39 BRACOL - CA25687", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25687", tamanho: "39" },
  { nome: "BOTA DE SEGURANÇA 40 BRACOL - CA25687", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25687", tamanho: "40" },
  { nome: "BOTA DE SEGURANÇA 44 BRACOL - CA25687", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25687", tamanho: "44" },
  // Bota de Segurança MARLUVAS - CA42374 (9 tamanhos)
  { nome: "BOTA DE SEGURANÇA 35 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "35" },
  { nome: "BOTA DE SEGURANÇA 36 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "36" },
  { nome: "BOTA DE SEGURANÇA 37 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "37" },
  { nome: "BOTA DE SEGURANÇA 38 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "38" },
  { nome: "BOTA DE SEGURANÇA 39 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "39" },
  { nome: "BOTA DE SEGURANÇA 40 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "40" },
  { nome: "BOTA DE SEGURANÇA 41 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "41" },
  { nome: "BOTA DE SEGURANÇA 42 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "42" },
  { nome: "BOTA DE SEGURANÇA 43 MARLUVAS - CA42374", novoNome: "BOTA DE SEGURANÇA MARLUVAS - CA42374", tamanho: "43" },
  // Bota de Segurança BOMPEL - CA37671 (3 tamanhos)
  { nome: "BOTA DE SEGURANÇA 38 BOMPEL - CA37671", novoNome: "BOTA DE SEGURANÇA BOMPEL - CA37671", tamanho: "38" },
  { nome: "BOTA DE SEGURANÇA 40 BOMPEL - CA37671", novoNome: "BOTA DE SEGURANÇA BOMPEL - CA37671", tamanho: "40" },
  { nome: "BOTA DE SEGURANÇA 41 BOMPEL - CA37671", novoNome: "BOTA DE SEGURANÇA BOMPEL - CA37671", tamanho: "41" },
  // Bota de Segurança BRACOL - CA42165 (2 tamanhos)
  { nome: "BOTA DE SEGURANÇA 40 BRACOL - CA42165", novoNome: "BOTA DE SEGURANÇA BRACOL - CA42165", tamanho: "40" },
  { nome: "BOTA DE SEGURANÇA 44 BRACOL - CA42165", novoNome: "BOTA DE SEGURANÇA BRACOL - CA42165", tamanho: "44" },
  // Bota de Segurança BRACOL - CA25259 (2 tamanhos)
  { nome: "BOTA DE SEGURANÇA 42 BRACOL - CA25259", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25259", tamanho: "42" },
  { nome: "BOTA DE SEGURANÇA 43 BRACOL - CA25259", novoNome: "BOTA DE SEGURANÇA BRACOL - CA25259", tamanho: "43" },
  // Luva de Borracha - CA41918 (2 tamanhos)
  { nome: "LUVA DE BORRACHA G - CA41918", novoNome: "LUVA DE BORRACHA - CA41918", tamanho: "G" },
  { nome: "LUVA DE BORRACHA M - CA41918", novoNome: "LUVA DE BORRACHA - CA41918", tamanho: "M" },
  // Luva PU Danny - CA29014 (2 tamanhos)
  { nome: "LUVA PU G DANNY - CA29014", novoNome: "LUVA PU DANNY - CA29014", tamanho: "G" },
  { nome: "LUVA PU M DANNY - CA29014", novoNome: "LUVA PU DANNY - CA29014", tamanho: "M" },
  // Luva PU Delta - CA36365 (4 tamanhos)
  { nome: "LUVA PU P DELTA - CA36365", novoNome: "LUVA PU DELTA - CA36365", tamanho: "P" },
  { nome: "LUVA PU M DELTA - CA36365", novoNome: "LUVA PU DELTA - CA36365", tamanho: "M" },
  { nome: "LUVA PU G DELTA - CA36365", novoNome: "LUVA PU DELTA - CA36365", tamanho: "G" },
  { nome: "LUVA PU GG DELTA - CA36365", novoNome: "LUVA PU DELTA - CA36365", tamanho: "GG" },
  // Camisa de malha TAMANHO EXG — sem par, só ganha tamanho
  { nome: "CAMISA DE MALHA TAMANHO EXG", novoNome: "CAMISA DE MALHA", tamanho: "EXG" },
];

// ---- 3) Famílias por padrão de nome consistente (sem exceção, conferidas linha a linha) ----
type Regra = { descricao: string; match: RegExp; extrai: (m: RegExpMatchArray) => { novoNome: string; tamanho: string } };

const REGRAS: Regra[] = [
  {
    descricao: "Bota com cadarço bico composite (sem CA, MRN)",
    match: /^BOTA COM CADARÇO BICO COMPOSITE TAMANHO (\d{2})$/i,
    extrai: (m) => ({ novoNome: "BOTA COM CADARÇO BICO COMPOSITE", tamanho: m[1] }),
  },
  {
    descricao: "Bota sem cadarço bico composite (sem CA, MRN)",
    match: /^BOTA SEM CADARÇO BICO COMPOSITE TAMANHO (\d{2})$/i,
    extrai: (m) => ({ novoNome: "BOTA SEM CADARÇO BICO COMPOSITE", tamanho: m[1] }),
  },
  {
    descricao: "Calça uniforme (com ou sem higienizada)",
    match: /^CALÇA (\d{2})(\s*\(HIGIENIZADA\))?$/i,
    extrai: (m) => ({ novoNome: "CALÇA", tamanho: m[1] + (m[2] ? " (Higienizada)" : "") }),
  },
  {
    descricao: "Calça policoton leve",
    match: /^CALÇA POLICOTON LEVE TAMANHO (\d{2})$/i,
    extrai: (m) => ({ novoNome: "CALÇA POLICOTON LEVE", tamanho: m[1] }),
  },
  {
    descricao: "Camisa de malha (estilo padrão, com ou sem higienizada)",
    match: /^CAMISA DE MALHA (PP|P|M|GG|G|XG|XXG)(\s*\(HIGIENIZADA\))?$/i,
    extrai: (m) => ({ novoNome: "CAMISA DE MALHA", tamanho: m[1].toUpperCase() + (m[2] ? " (Higienizada)" : "") }),
  },
  {
    descricao: "Camisa jaleco (com ou sem higienizada)",
    match: /^CAMISA JALECO (PP|P|M|GG|G|XG|XXG)(\s*\(HIGIENIZADA\))?$/i,
    extrai: (m) => ({ novoNome: "CAMISA JALECO", tamanho: m[1].toUpperCase() + (m[2] ? " (Higienizada)" : "") }),
  },
  // Achados na segunda varredura (30/08/2026, pedido do João: "faltou os
  // blocos nos equipamentos, faltou separar") — três famílias que a primeira
  // auditoria não pegou porque o padrão de nome era diferente dos outros.
  // Cor continua sendo tratada como item diferente (verde ≠ laranja), só o
  // tamanho é que sai do nome.
  {
    descricao: "Colete verde",
    match: /^COLETE VERDE - (G|GG|M)$/i,
    extrai: (m) => ({ novoNome: "COLETE VERDE", tamanho: m[1].toUpperCase() }),
  },
  {
    descricao: "Colete laranja",
    match: /^COLETE LARANJA - (G|GG|M|P|PP|XG)$/i,
    extrai: (m) => ({ novoNome: "COLETE LARANJA", tamanho: m[1].toUpperCase() }),
  },
  {
    descricao: "Colete refletivo",
    match: /^COLETE REFLETIVO TAMANHO (G|GG|M|P|PP|XG)$/i,
    extrai: (m) => ({ novoNome: "COLETE REFLETIVO", tamanho: m[1].toUpperCase() }),
  },
  {
    descricao: "Jaleco policoton leve",
    match: /^JALECO POLICOTON LEVE TAMANHO (PP|P|M|GG|G|XG|EXG|XXG)$/i,
    extrai: (m) => ({ novoNome: "JALECO POLICOTON LEVE", tamanho: m[1].toUpperCase() }),
  },
];

async function repointEstoqueEMovimentacao(deId: string, paraId: string) {
  const estoquesDup = await prisma.epiEstoque.findMany({ where: { produtoId: deId } });
  for (const e of estoquesDup) {
    const existente = await prisma.epiEstoque.findFirst({ where: { produtoId: paraId, contratoId: e.contratoId } });
    if (existente) {
      await prisma.epiEstoque.update({
        where: { id: existente.id },
        data: { estoqueInicial: existente.estoqueInicial + e.estoqueInicial },
      });
      await prisma.epiEstoque.delete({ where: { id: e.id } });
    } else {
      await prisma.epiEstoque.update({ where: { id: e.id }, data: { produtoId: paraId } });
    }
  }
  await prisma.epiMovimentacao.updateMany({ where: { produtoId: deId }, data: { produtoId: paraId } });
}

async function main() {
  let mergeados = 0;
  for (const { manter, remover } of MERGE_CAMISA_MALHA) {
    const alvo = await prisma.epiProduto.findFirst({ where: { nome: manter } });
    const dup = await prisma.epiProduto.findFirst({ where: { nome: remover } });
    if (!alvo || !dup) {
      console.log(`[pular merge] "${remover}" -> "${manter}": não achou os dois lados (talvez já rodado antes)`);
      continue;
    }
    await repointEstoqueEMovimentacao(dup.id, alvo.id);
    await prisma.epiProduto.delete({ where: { id: dup.id } });
    console.log(`[merge] "${remover}" removido, estoque/movimentação repontados pra "${manter}"`);
    mergeados++;
  }

  let renomeados = 0;
  for (const { nome, novoNome, tamanho } of RENOMEIO_EXPLICITO) {
    const r = await prisma.epiProduto.updateMany({ where: { nome }, data: { nome: novoNome, tamanho } });
    if (r.count > 0) {
      console.log(`[rename explícito] "${nome}" -> nome="${novoNome}" tamanho="${tamanho}"`);
      renomeados += r.count;
    } else {
      console.log(`[pular rename] "${nome}": não encontrado (talvez já rodado antes)`);
    }
  }

  const produtos = await prisma.epiProduto.findMany();
  for (const p of produtos) {
    for (const regra of REGRAS) {
      const m = p.nome.match(regra.match);
      if (!m) continue;
      const { novoNome, tamanho } = regra.extrai(m);
      await prisma.epiProduto.update({ where: { id: p.id }, data: { nome: novoNome, tamanho } });
      console.log(`[${regra.descricao}] "${p.nome}" -> nome="${novoNome}" tamanho="${tamanho}"`);
      renomeados++;
      break;
    }
  }

  // Achado na revisão do dashboard: "CAMISA DE MALHA" tamanho EXG ficou tipo
  // EPI (herdou do import ECC) enquanto as outras 14 variantes da mesma peça
  // são FARDAMENTO — mesma peça de roupa, categoria tem que ser igual.
  const corrigidoTipo = await prisma.epiProduto.updateMany({
    where: { nome: "CAMISA DE MALHA", tamanho: "EXG", tipo: "EPI" },
    data: { tipo: "FARDAMENTO" },
  });
  if (corrigidoTipo.count > 0) console.log(`[correção de tipo] "CAMISA DE MALHA (EXG)": EPI -> FARDAMENTO`);

  console.log(`\nConcluído: ${mergeados} duplicidades reais fundidas, ${renomeados} produtos com tamanho separado do nome.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
