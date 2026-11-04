// Roda na subida do container: carrega o catálogo único (440 códigos) UMA ÚNICA VEZ.
// Faz exatamente o que o botão "Recriar catálogo do zero" faz (cópia _bkp_cat_* das tabelas, apaga movimentações/estoque/itens,
// grava os itens do catálogo, mantém preço/foto de item de mesmo nome). Depois de gravar com sucesso cria a tabela-marca
// "_catalogo_carregado": enquanto ela existir, este script não faz mais nada (itens cadastrados depois nunca são apagados).
// Se falhar, a marca não é criada e a tentativa se repete na próxima subida (cada tentativa guarda a própria cópia).

import { PrismaClient } from "@prisma/client";
import { ITENS_CATALOGO, recriarCatalogo, validarCatalogo } from "../src/lib/catalogoBase";

async function main() {
  const prisma = new PrismaClient();
  try {
    const marca = await prisma.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE tablename = '_catalogo_carregado'`);
    if (marca.length > 0) return console.log("[catalogo] catálogo já foi carregado antes (marca _catalogo_carregado): nada a fazer.");

    const problemas = validarCatalogo();
    if (problemas.length) return console.error(`[catalogo] lista do catálogo com problema, NADA foi gravado: ${problemas.slice(0, 5).join("; ")}`);

    const [produtos, estoques, movs] = await Promise.all([prisma.epiProduto.count(), prisma.epiEstoque.count(), prisma.epiMovimentacao.count()]);
    console.log(`[catalogo] antes: ${produtos} itens, ${estoques} linhas de estoque, ${movs} movimentações. Carregando ${ITENS_CATALOGO.length} itens do catálogo...`);

    const r = await recriarCatalogo(prisma);
    await prisma.$executeRawUnsafe(`CREATE TABLE "_catalogo_carregado" AS SELECT now() AS carregado_em, ${r.carregados}::int AS itens`);
    console.log(`[catalogo] CARREGADO: ${r.carregados} itens. Apagado: ${r.apagados.produtos} itens, ${r.apagados.estoques} linhas de estoque, ${r.apagados.movimentacoes} movimentações.`);
    console.log(`[catalogo] preço mantido em ${r.aproveitados.valorUnitario} itens, foto em ${r.aproveitados.foto}. Cópias de segurança: ${r.backups.join(", ")}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[catalogo] ERRO:", e);
  process.exitCode = 1;
});
