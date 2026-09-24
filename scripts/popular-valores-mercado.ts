// Migração pontual (24/09/2026) — João pediu valores de mercado nos produtos
// pra viabilizar a aba "Estoque Mínimo" (pedido de compra por contrato) sem
// custo estimado vazio. Preenche `EpiProduto.valorUnitario` SOMENTE onde
// ainda está null (nunca sobrescreve um valor já cadastrado manualmente) —
// só 6 itens já tinham preço real antes desta migração.
//
// São estimativas de mercado brasileiro pra EPI/EPC/fardamento/material de
// escritório, pensadas pra dar um ponto de partida realista — não são cotação
// oficial de fornecedor. Cada produto continua editável a qualquer momento
// pelo Catálogo (clique em cima do valor → "definir"), como já era antes.
//
// Rodar UMA VEZ via `npx tsx scripts/popular-valores-mercado.ts` dentro do
// container (mesmo padrão de scripts/migrate-fase2.ts). Idempotente: roda de
// novo sem efeito, porque só toca em quem ainda está null.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REGRAS: [RegExp, number][] = [
  // Typos reais do cadastro (regras mais específicas primeiro)
  [/PROTETOR RESPIR[AÁ]T[OÓ]RIO/, 12],
  [/^CAPACE\b/, 48], // "CAPACE AZUL ROYAL..." -> typo de CAPACETE
  [/APONTADOR/, 3],

  // Cabeça
  [/CAPACETE/, 48],
  [/CARNEIRA/, 42],
  [/JUGULAR/, 12],
  [/BALACLAVA/, 15],
  [/TOUCA ÁRABE|TOUCA ARABE/, 18],
  [/CHAPEU DE PALHA|CHAPÉU DE PALHA/, 20],

  // Olhos/face
  [/ÓCULOS|OCULOS/, 14],
  [/PROTETOR FACIAL DE ACR[IÍ]LICO/, 45],
  [/PROTETOR FACIAL TELADO/, 55],
  [/ADAPTADOR.*VISEIRA/, 25],

  // Audição / respiratório
  [/PROTETOR AUDITIVO/, 8],

  // Mãos - luvas
  [/LUVA ANTI-IMPACTO/, 55],
  [/LUVA ANTI-T[EÉ]RMICA/, 90.23],
  [/LUVA ANTICORTE/, 45],
  [/LUVA DE BORRACHA/, 18],
  [/LUVA DE L[AÁ]TEX DESCART[AÁ]VEL/, 0.9],
  [/LUVA DE L[AÁ]TEX/, 42],
  [/LUVA DE OPERADOR DE MOTOSSERRA/, 70],
  [/LUVA DE PVC/, 15],
  [/LUVA DE RASPA/, 22],
  [/LUVA DE SEGURAN[CÇ]A DESCART[AÁ]VEL/, 0.9],
  [/LUVA DE VAQUETA/, 28],
  [/LUVA MISTA/, 20],
  [/LUVA NITR[IÍ]LICA/, 1.2],
  [/LUVA PU/, 12],
  [/LUVA T[AÁ]TIL/, 25],
  [/PRESILHAS PARA LUVAS|CLIP PORTA LUVAS/, 8],

  // Braços / pernas / tronco
  [/MANGOTE/, 30],
  [/PERNEIRA COM PROTE[CÇ][AÃ]O DE JOELHO/, 60],
  [/PERNEIRA DE BIDIM/, 35],
  [/PERNEIRA/, 45],
  [/AVENTAL DE PVC/, 40],
  [/AVENTAL/, 45],
  [/COLETE SALVA-VIDAS/, 55],
  [/COLETE REFLETIVO|COLETE LARANJA|COLETE VERDE/, 35],
  [/BLUS[AÃ]O DE OPERADOR/, 120],
  [/CAMISA JALECO/, 55],
  [/CAMISA DE MALHA/, 40],
  [/CAP[AA] DE CHUVA|CAPA\./, 60],
  [/MACAC[AÃ]O APICULTOR/, 180],
  [/KIT MOTOSSERRISTA/, 350],

  // Pés
  [/BOTA.*METATARSO/, 190],
  [/BOTA DE SEGURAN[CÇ]A LONGA/, 160],
  [/BOTA DE SEGURAN[CÇ]A/, 130],
  [/BOTA COM PROTE[CÇ][AÃ]O DE METATARSO/, 190],
  [/BOTA/, 126.76],
  [/CAL[CÇ]A DE OPERADOR DE MOTOSSERRA/, 220],
  [/CAL[CÇ]A DE OPERADOR/, 140],
  [/CAL[CÇ]A/, 65],

  // Outros EPI
  [/PROTETOR SOLAR COM REPELENTE/, 35],
  [/PROTETOR SOLAR/, 25],
  [/REPELENTE/, 18],
  [/FITA P\/DEMARCA[CÇ][AÃ]O/, 15],
  [/BAINHA COURO/, 30],

  // EPC / sinalização
  [/CONE DE SINALIZA[CÇ][AÃ]O/, 45],

  // Insumos alojamento
  [/TOALHA DE BANHO/, 30],
  [/TOALHA DE ROSTO/, 15],
  [/LEN[CÇ]OL SOLTEIRO COM ELASTICO/, 40],
  [/LEN[CÇ]OL SOLTEIRO SEM ELASTICO/, 30],
  [/FRONHA/, 15],
  [/MANTA SOLTEIRO/, 45],

  // Itens veicular
  [/PNEU FORZA/, 850],
  [/TAPETE/, 60],

  // Material de escritório
  [/CANETA BIC/, 1.5],
  [/BORRACHA BRANCA/, 1.8],
  [/BLOCOS ADESIVOS/, 6],
  [/CLIPS TOP N[ºO°] ?2/, 4.5],
  [/CLIPS TOP N[ºO°] ?3/, 5],
  [/COLA BAST[AÃ]O/, 7],
  [/CORRETIVO L[IÍ]QUIDO/, 6],
  [/FITA ADESIVA CRISTAL/, 5],
  [/FITA CORRETIVA/, 8],
  [/MARCADOR TEXTO/, 4],
  [/GRAMPEADOR METAL/, 25],
  [/GRAMPOS GALVANIZADOS|GRAMPOS ROCAMA/, 35],
  [/CAPA PARA ENCADERNA[CÇ][AÃ]O/, 3],
  [/ESPIRAL PLASTICO/, 15],
  [/PLASTICO PARA PLASTIFICA[CÇ][AÃ]O/, 2],
  [/PASTA SANFONADA/, 25],
  [/PRANCHETA/, 20],
  [/CRACHA VERT/, 6],
  [/MAUSE USB|MOUSE/, 30],
  [/MOUSEPAD/, 20],
  [/TECLADO COM FIO/, 45],
  [/PAPEL SENNINHA A4/, 25],
  [/PILHA 2AA|PILHA 2AAA/, 8],
  [/ROTULADOR ELETRONICO/, 180],
  [/TESOURA DE ESCRITORIO/, 12],
];

function precoDe(nome: string): number | null {
  const up = nome.toUpperCase();
  for (const [re, preco] of REGRAS) if (re.test(up)) return preco;
  return null;
}

async function main() {
  const produtos = await prisma.epiProduto.findMany({ where: { valorUnitario: null } });

  let atualizados = 0;
  const semMatch: string[] = [];

  for (const p of produtos) {
    const preco = precoDe(p.nome);
    if (preco === null) {
      semMatch.push(p.nome);
      continue;
    }
    await prisma.epiProduto.update({ where: { id: p.id }, data: { valorUnitario: preco } });
    atualizados++;
  }

  console.log(`Produtos sem preço antes: ${produtos.length}`);
  console.log(`Atualizados agora: ${atualizados}`);
  console.log(`Sem correspondência (ficaram null, precisam de preço manual): ${semMatch.length}`);
  if (semMatch.length) {
    console.log(semMatch.map((n) => ` - ${n}`).join("\n"));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
