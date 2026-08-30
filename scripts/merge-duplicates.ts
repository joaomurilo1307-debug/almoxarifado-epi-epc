// Merge pontual de itens duplicados no catálogo (30/08/2026, pedido direto do
// João: "deixe um só e some os valores, n faça isso de dexiar repetido com
// um codigo só").
//
// IMPORTANTE: isso NÃO é "mesmo CA = duplicado". Um C.A. (Certificado de
// Aprovação) certifica um MODELO, e o mesmo modelo vem em vários tamanhos —
// então "BOTA DE SEGURANÇA 42 MARLUVAS" e "BOTA DE SEGURANÇA 43 MARLUVAS"
// compartilham CA42374 legitimamente e são itens DIFERENTES (tamanhos
// diferentes). Rodei uma auditoria manual em todos os 16 grupos de CA
// repetido no catálogo e confirmei que só 4 pares são duplicidade real —
// mesmo CA E mesma cor/descrição, vindos de duas importações diferentes
// (MRN antiga vs controle ECC novo) descrevendo o mesmo item físico com
// nomes diferentes. Os outros 12 grupos são tamanhos diferentes de verdade
// e não são tocados aqui.
//
// Cada par abaixo foi conferido nome a nome, com estoque e contrato reais
// (ids fixos, não é busca automática por padrão de texto — evita casar
// errado). Mantém o nome no padrão já estabelecido no catálogo ("NOME - CA
// código"), com o C.A. explícito no nome.
//
// Os dois produtos de cada par têm estoque em CONTRATOS DIFERENTES (um no
// pool "Geral", outro no contrato ECC) — não há duas linhas de EpiEstoque
// pro mesmo contrato, então não existe conflito de chave única a resolver;
// as duas linhas de estoque são só re-apontadas pro produto que fica, cada
// uma mantendo sua quantidade real por contrato (nada é somado numa linha
// só porque não há necessidade — nenhum valor é perdido, e o total do item
// passa a ficar visível como pertencente a UM catálogo só, que era o pedido).
// Se algum par tivesse colidido no mesmo contrato, o valor teria sido somado
// ali (ver função abaixo, preparada pra isso).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PARES = [
  {
    manter: "cmtfaa2j900rr8qkacjhkmbf7", // LUVA ANTI-IMPACTO - CA44549 (Geral)
    remover: "cmtg0x7zf0054tbauwifmvi3l", // LUVA ANTI IMPACTO (ECC)
    motivo: "mesmo CA44549, mesma luva, nomes de duas importações diferentes",
  },
  {
    manter: "cmtfaa2h700qx8qka3wfdn30f", // CAPACETE BRANCO MSA - CA498 (Geral)
    remover: "cmtg0x7w3003jtbauitttcm08", // CAPACETE CLACE B BRANCO (ECC)
    motivo: "mesmo CA498, mesma cor (branco)",
  },
  {
    manter: "cmtfaa2hf00r08qkalq7w2q8x", // CAPACETE CINZA MSA - CA498 (Geral)
    remover: "cmtg0x7w8003mtbauvn3la2zf", // CAPACETE CLACE B CINZA (ECC)
    motivo: "mesmo CA498, mesma cor (cinza)",
  },
  {
    manter: "cmtfaa2hl00r38qkallss8k73", // CAPACETE LARANJA MSA - CA498 (Geral)
    remover: "cmtg0x7wh003stbauyxpru0k2", // CAPACETE CLASE B LARANJA (ECC)
    motivo: "mesmo CA498, mesma cor (laranja)",
  },
];

async function mergeUmPar(manterId: string, removerId: string, motivo: string) {
  const manter = await prisma.epiProduto.findUnique({ where: { id: manterId } });
  const remover = await prisma.epiProduto.findUnique({ where: { id: removerId } });
  if (!manter || !remover) {
    console.log(`  [pulado] produto não encontrado (manter=${!!manter} remover=${!!remover})`);
    return;
  }

  // Se o produto que fica não tem foto mas o que sai tem, aproveita a foto
  // antes de apagar (não perde a única foto boa que exista).
  if (!manter.fotoUrl && remover.fotoUrl) {
    await prisma.epiProduto.update({ where: { id: manterId }, data: { fotoUrl: remover.fotoUrl } });
  }

  const estoquesRemover = await prisma.epiEstoque.findMany({ where: { produtoId: removerId } });
  for (const est of estoquesRemover) {
    const existente = await prisma.epiEstoque.findFirst({
      where: { produtoId: manterId, contratoId: est.contratoId },
    });
    if (existente) {
      // Colisão real (mesmo contrato nos dois) — aí sim soma os valores.
      await prisma.epiEstoque.update({
        where: { id: existente.id },
        data: {
          estoqueInicial: existente.estoqueInicial + est.estoqueInicial,
          estoqueMinimo: existente.estoqueMinimo + est.estoqueMinimo,
        },
      });
      await prisma.epiEstoque.delete({ where: { id: est.id } });
    } else {
      // Contratos diferentes — só re-aponta, mantém a quantidade real de cada um.
      await prisma.epiEstoque.update({ where: { id: est.id }, data: { produtoId: manterId } });
    }
  }

  // Movimentações (se existir alguma) também são re-apontadas, pra não
  // perder histórico ao apagar o produto duplicado.
  await prisma.epiMovimentacao.updateMany({ where: { produtoId: removerId }, data: { produtoId: manterId } });

  await prisma.epiProduto.delete({ where: { id: removerId } });
  console.log(`  [ok] "${remover.nome}" -> mesclado em "${manter.nome}" (${motivo})`);
}

async function main() {
  console.log(`Mesclando ${PARES.length} pares de itens duplicados...`);
  for (const par of PARES) {
    await mergeUmPar(par.manter, par.remover, par.motivo);
  }
  console.log("Merge concluído.");
}

main()
  .catch((err) => {
    console.error("Erro no merge:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
