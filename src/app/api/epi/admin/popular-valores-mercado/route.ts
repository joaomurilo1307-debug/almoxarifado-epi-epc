import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Preenche EpiProduto.valorUnitario com uma estimativa de mercado, SOMENTE
// onde ainda está null — nunca sobrescreve um valor já cadastrado manualmente
// (pedido do João, 24/09/2026, pra viabilizar a aba "Estoque Mínimo" com
// custo estimado no pedido de compra). São valores de referência de mercado
// brasileiro pra EPI/EPC/fardamento/material de escritório, não cotação
// oficial de fornecedor — continuam editáveis a qualquer momento pelo
// Catálogo (clique em cima do valor → "definir").
// Idempotente: rodar de novo não tem efeito, porque só toca em quem
// continua null.
const REGRAS: [RegExp, number][] = [
  [/PROTETOR RESPIR[AÁ]T[OÓ]RIO/, 12],
  [/^CAPACE\b/, 48], // typo real do cadastro: "CAPACE ..." em vez de "CAPACETE ..."
  [/APONTADOR/, 3],

  [/CAPACETE/, 48],
  [/CARNEIRA/, 42],
  [/JUGULAR/, 12],
  [/BALACLAVA/, 15],
  [/TOUCA ÁRABE|TOUCA ARABE/, 18],
  [/CHAPEU DE PALHA|CHAPÉU DE PALHA/, 20],

  [/ÓCULOS|OCULOS/, 14],
  [/PROTETOR FACIAL DE ACR[IÍ]LICO/, 45],
  [/PROTETOR FACIAL TELADO/, 55],
  [/ADAPTADOR.*VISEIRA/, 25],

  [/PROTETOR AUDITIVO/, 8],

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

  [/BOTA.*METATARSO/, 190],
  [/BOTA DE SEGURAN[CÇ]A LONGA/, 160],
  [/BOTA DE SEGURAN[CÇ]A/, 130],
  [/BOTA COM PROTE[CÇ][AÃ]O DE METATARSO/, 190],
  [/BOTA/, 126.76],
  [/CAL[CÇ]A DE OPERADOR DE MOTOSSERRA/, 220],
  [/CAL[CÇ]A DE OPERADOR/, 140],
  [/CAL[CÇ]A/, 65],

  [/PROTETOR SOLAR COM REPELENTE/, 35],
  [/PROTETOR SOLAR/, 25],
  [/REPELENTE/, 18],
  [/FITA P\/DEMARCA[CÇ][AÃ]O/, 15],
  [/BAINHA COURO/, 30],

  [/CONE DE SINALIZA[CÇ][AÃ]O/, 45],

  [/TOALHA DE BANHO/, 30],
  [/TOALHA DE ROSTO/, 15],
  [/LEN[CÇ]OL SOLTEIRO COM ELASTICO/, 40],
  [/LEN[CÇ]OL SOLTEIRO SEM ELASTICO/, 30],
  [/FRONHA/, 15],
  [/MANTA SOLTEIRO/, 45],

  [/PNEU FORZA/, 850],
  [/TAPETE/, 60],

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

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const produtos = await prisma.epiProduto.findMany({ where: { valorUnitario: null } });

  const atualizacoes: { id: string; valorUnitario: number }[] = [];
  const semMatch: string[] = [];
  for (const p of produtos) {
    const preco = precoDe(p.nome);
    if (preco === null) semMatch.push(p.nome);
    else atualizacoes.push({ id: p.id, valorUnitario: preco });
  }

  await prisma.$transaction(
    atualizacoes.map((a) => prisma.epiProduto.update({ where: { id: a.id }, data: { valorUnitario: a.valorUnitario } }))
  );

  return NextResponse.json({
    ok: true,
    semPrecoAntes: produtos.length,
    atualizados: atualizacoes.length,
    semMatch,
  });
}
