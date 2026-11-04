// Roda na subida do container, UMA ÚNICA VEZ depois que o catálogo único foi carregado: preenche a foto de referência dos itens que
// ainda não têm (não troca foto existente) e deixa todos os tamanhos do mesmo modelo com a mesma foto. Marca "_fotos_catalogo_preenchidas".
// Depois disso não roda mais — se alguém remover uma foto de propósito, ela não volta sozinha.

import { PrismaClient } from "@prisma/client";
import { preencherFotos } from "../src/lib/fotosReferencia";

async function main() {
  const prisma = new PrismaClient();
  try {
    const existe = async (t: string) => (await prisma.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE tablename = '${t}'`)).length > 0;
    if (await existe("_fotos_catalogo_preenchidas")) return console.log("[fotos] já preenchidas antes (marca _fotos_catalogo_preenchidas): nada a fazer.");
    if (!(await existe("_catalogo_carregado"))) return console.log("[fotos] o catálogo único ainda não foi carregado: nada a fazer agora.");

    const r = await preencherFotos(prisma);
    const [total, comFoto] = await Promise.all([prisma.epiProduto.count(), prisma.epiProduto.count({ where: { fotoUrl: { not: null } } })]);
    await prisma.$executeRawUnsafe(`CREATE TABLE "_fotos_catalogo_preenchidas" AS SELECT now() AS preenchido_em, ${r.atualizados}::int AS atualizados`);
    console.log(`[fotos] ${r.atualizados} item(ns) ganharam foto de referência; ${r.semMatch} sem foto parecida (ficam sem foto, nada é inventado). Catálogo: ${comFoto} de ${total} com foto.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[fotos] ERRO:", e);
  process.exitCode = 1;
});
