// Roda na subida do container. Duas cargas, cada uma com MARCA durável (tabela EpiMarca, que está no schema e por isso o `prisma db push`
// não apaga) e com travas de estado — nunca roda duas vezes e nunca apaga estoque que já exista:
//
//  1) catálogo único (src/lib/data/catalogoItens.json): só substitui o catálogo se a marca "catalogo" for diferente da versão do arquivo E
//     não houver movimentação E (não houver estoque OU o estoque for exatamente o que esta mesma carga gravou, sem ninguém ter mexido:
//     mesma quantidade de linhas e de unidades da marca "estoque_ecc"). Cópia das tabelas no esquema "bkp" antes. Qualquer outro caso: NÃO mexe e avisa.
//  2) estoque do ECC (src/lib/data/estoqueEcc20261104.json): só grava se a marca "estoque_ecc" for diferente E o catálogo carregado for o da
//     versão atual E o contrato ECC existir E o ECC ainda não tiver nenhuma linha de estoque. Estoque inicial = contagem do inventário.

import { PrismaClient } from "@prisma/client";
import estoqueEcc from "../src/lib/data/estoqueEcc20261104.json";
import { ITENS_CATALOGO, VERSAO_CATALOGO, recriarCatalogo, validarCatalogo } from "../src/lib/catalogoBase";
import { preencherFotos } from "../src/lib/fotosReferencia";

const VERSAO_ESTOQUE = estoqueEcc.versao;
// A marca "estoque_ecc" guarda "versão|linhas|unidades" do que foi gravado. A primeira versão (2026-11-04) gravou só a versão: 145 linhas, 1151 un.
const ESTOQUE_LEGADO: Record<string, { linhas: number; unidades: number }> = { "2026-11-04": { linhas: 145, unidades: 1151 } };
function lerMarcaEstoque(v: string | null) {
  if (!v) return null;
  const [versao, l, u] = v.split("|");
  if (l && u) return { versao, linhas: Number(l), unidades: Number(u) };
  return { versao, ...(ESTOQUE_LEGADO[versao] ?? { linhas: -1, unidades: -1 }) };
}

async function marca(prisma: PrismaClient, chave: string) {
  return (await prisma.epiMarca.findUnique({ where: { chave } }))?.valor ?? null;
}
async function gravaMarca(prisma: PrismaClient, chave: string, valor: string) {
  await prisma.epiMarca.upsert({ where: { chave }, create: { chave, valor }, update: { valor } });
}

// o estoque que existe agora é exatamente o que a carga automática gravou (mesmas linhas e unidades) e ninguém mexeu?
async function estoqueIntocado(prisma: PrismaClient, linhasAgora: number) {
  const m = lerMarcaEstoque(await marca(prisma, "estoque_ecc"));
  if (!m || m.linhas !== linhasAgora) return false;
  const soma = await prisma.epiEstoque.aggregate({ _sum: { estoqueInicial: true } });
  return soma._sum.estoqueInicial === m.unidades;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    // ---------------------------------------------------------------- 1) catálogo
    if ((await marca(prisma, "catalogo")) === VERSAO_CATALOGO) {
      console.log(`[base] catálogo ${VERSAO_CATALOGO} já carregado: nada a fazer.`);
    } else {
      const problemas = validarCatalogo();
      const [estoques, movs, produtos] = await Promise.all([prisma.epiEstoque.count(), prisma.epiMovimentacao.count(), prisma.epiProduto.count()]);
      if (problemas.length) {
        console.error(`[base] lista do catálogo com problema, NADA gravado: ${problemas.slice(0, 5).join("; ")}`);
      } else if (movs > 0 || (estoques > 0 && !(await estoqueIntocado(prisma, estoques)))) {
        console.log(`[base] catálogo ${VERSAO_CATALOGO} NÃO carregado: já existe movimentação (${movs}) ou estoque que não é o da carga automática (${estoques} linhas). Nada foi apagado; use o botão "Recriar catálogo" se quiser trocar.`);
      } else {
        console.log(`[base] catálogo: antes ${produtos} itens (sem estoque nem movimentação). Carregando ${ITENS_CATALOGO.length} itens da versão ${VERSAO_CATALOGO}...`);
        const r = await recriarCatalogo(prisma);
        const f = await preencherFotos(prisma);
        await gravaMarca(prisma, "catalogo", VERSAO_CATALOGO);
        await prisma.epiMarca.deleteMany({ where: { chave: "estoque_ecc" } }); // o estoque foi apagado junto: será regravado abaixo com o mapeamento novo
        console.log(`[base] catálogo CARREGADO: ${r.carregados} itens (apagou ${r.apagados.produtos} itens antigos). Preço mantido em ${r.aproveitados.valorUnitario}, foto herdada em ${r.aproveitados.foto}, +${f.atualizados} fotos de referência (${f.semMatch} sem foto). Cópias: ${r.backups.join(", ")}`);
      }
    }

    // ---------------------------------------------------------------- 2) estoque do ECC
    if (lerMarcaEstoque(await marca(prisma, "estoque_ecc"))?.versao === VERSAO_ESTOQUE) return console.log(`[base] estoque ECC ${VERSAO_ESTOQUE} já carregado: nada a fazer.`);
    if ((await marca(prisma, "catalogo")) !== VERSAO_CATALOGO) return console.log("[base] estoque ECC não carregado: o catálogo da versão atual ainda não está carregado.");
    const ecc = await prisma.epiContrato.findFirst({ where: { codigo: "ECC" } });
    if (!ecc) return console.error('[base] estoque ECC não carregado: o contrato "ECC" não existe no sistema.');
    const jaTem = await prisma.epiEstoque.count({ where: { contratoId: ecc.id } });
    if (jaTem > 0) return console.log(`[base] estoque ECC não carregado: o ECC já tem ${jaTem} linhas de estoque (não mexi).`);

    const produtos = await prisma.epiProduto.findMany({ where: { codigo: { not: null } }, select: { id: true, codigo: true } });
    const idPorCodigo = new Map(produtos.map((p) => [p.codigo!, p.id]));
    const faltando = estoqueEcc.itens.filter((i) => !idPorCodigo.has(i.codigo));
    if (faltando.length) return console.error(`[base] estoque ECC NÃO carregado: ${faltando.length} códigos do inventário não existem no catálogo (ex.: ${faltando.slice(0, 3).map((i) => i.codigo).join(", ")}).`);

    await prisma.epiEstoque.createMany({ data: estoqueEcc.itens.map((i) => ({ contratoId: ecc.id, produtoId: idPorCodigo.get(i.codigo)!, estoqueInicial: i.quantidade })) });
    const total = (await prisma.epiEstoque.aggregate({ where: { contratoId: ecc.id }, _sum: { estoqueInicial: true }, _count: true }));
    const esperado = estoqueEcc.itens.reduce((n, i) => n + i.quantidade, 0);
    if (total._sum.estoqueInicial !== esperado || total._count !== estoqueEcc.itens.length) {
      return console.error(`[base] estoque ECC gravado mas NÃO confere: ${total._count} linhas / ${total._sum.estoqueInicial} un. (esperado ${estoqueEcc.itens.length} / ${esperado}). Marca não gravada.`);
    }
    await gravaMarca(prisma, "estoque_ecc", `${VERSAO_ESTOQUE}|${total._count}|${total._sum.estoqueInicial}`);
    console.log(`[base] estoque ECC CARREGADO (inventário de ${estoqueEcc.data}): ${total._count} linhas, ${total._sum.estoqueInicial} unidades.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[base] ERRO:", e);
  process.exitCode = 1;
});
