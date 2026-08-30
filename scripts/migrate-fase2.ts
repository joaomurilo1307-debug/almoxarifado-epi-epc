// Migração pontual (fase 2 — % por produto, categorias novas, correção do
// arredondamento). Rodar UMA VEZ via `npx tsx scripts/migrate-fase2.ts` dentro
// do container já com o schema novo aplicado (prisma db push já rodou no
// entrypoint). Idempotente: pode rodar de novo sem duplicar nada (usa upsert
// por nome+tamanho igual ao import normal, e o fix de arredondamento não
// muda um valor que já está inteiro).
//
// O que faz, em ordem:
// 1. Arredonda pra cima todo estoqueMinimo existente que ainda está fracionado
//    (bug real: import antigo gravou o valor decimal cru da planilha em vez
//    de arredondar — ex.: 11.6 devia ter virado 12).
// 2. Recategoriza os itens de fardamento que estavam importados como tipo EPI
//    (camisa, calça, jaleco) para tipo FARDAMENTO — o catálogo tinha ZERO
//    itens de fardamento antes disso, apesar de eles existirem no estoque.
// 3. Importa os itens reais do controle "CONTROLE DE EPIs ECC.xlsx" que ainda
//    não estavam no catálogo: mais EPIs específicos do contrato ECC, e as 4
//    categorias novas (Depósito Geral, Material de Escritório, Itens
//    Veicular, Insumos Alojamento), todos amarrados ao contrato ECC.

import { PrismaClient } from "@prisma/client";
import eccExtra from "./data/ecc-extra.json";

const prisma = new PrismaClient();

// Copiado de src/lib/epi.ts em vez de importado — este script roda com `tsx`
// fora do Next.js, que não resolve o alias de path "@/..." usado lá dentro
// (src/lib/epi.ts importa "@/lib/prisma"). Mesma lógica exata, sem alias.
async function upsertEpiEstoque(produtoId: string, contratoId: string | null, data: { estoqueInicial: number; estoqueMinimo: number }) {
  const existente = await prisma.epiEstoque.findFirst({ where: { produtoId, contratoId } });
  if (existente) return prisma.epiEstoque.update({ where: { id: existente.id }, data });
  return prisma.epiEstoque.create({ data: { produtoId, contratoId, ...data } });
}

async function upsertEpiProdutoPorNome(
  nome: string,
  tamanho: string | null,
  create: { tipo?: "EPI" | "EPC" | "FARDAMENTO" | "GERAL"; categoria?: string | null; ca?: string | null; unidade?: string },
  update: { ca?: string; unidade?: string; categoria?: string | null }
) {
  const existente = await prisma.epiProduto.findFirst({ where: { nome, tamanho } });
  if (existente) return prisma.epiProduto.update({ where: { id: existente.id }, data: update });
  return prisma.epiProduto.create({ data: { nome, tamanho, ...create } });
}

type EccItem = {
  nome: string;
  ca: string | null;
  estoqueInicial: number;
  estoqueAtual: number;
  estoqueMinimo: number;
  categoria: string;
};

async function fixArredondamento() {
  const estoques = await prisma.epiEstoque.findMany({ select: { id: true, estoqueMinimo: true } });
  let corrigidos = 0;
  for (const e of estoques) {
    const arredondado = Math.max(0, Math.ceil(e.estoqueMinimo));
    if (arredondado !== e.estoqueMinimo) {
      await prisma.epiEstoque.update({ where: { id: e.id }, data: { estoqueMinimo: arredondado } });
      corrigidos++;
    }
  }
  console.log(`[1/3] estoqueMinimo arredondado pra cima em ${corrigidos} de ${estoques.length} registros.`);
}

async function recategorizarFardamento() {
  // Padrões dos itens de uniforme que hoje estão com tipo=EPI (import antigo
  // não distinguia fardamento). Usa nome real, não inventa itens novos aqui.
  const padroes = [/^CAMISA DE MALHA/i, /^CAL[ÇC]A POLICOTON/i, /^JALECO POLICOTON/i];
  const candidatos = await prisma.epiProduto.findMany({ where: { tipo: "EPI" } });
  let recategorizados = 0;
  for (const p of candidatos) {
    if (padroes.some((re) => re.test(p.nome))) {
      await prisma.epiProduto.update({ where: { id: p.id }, data: { tipo: "FARDAMENTO" } });
      recategorizados++;
    }
  }
  console.log(`[2/3] ${recategorizados} itens recategorizados de EPI para FARDAMENTO (camisa/calça/jaleco de uniforme).`);
}

async function importarExtraECC() {
  const data = eccExtra as { epis: EccItem[]; deposito: EccItem[]; escritorio: EccItem[]; veicular: EccItem[]; alojamento: EccItem[] };

  const contratoECC = await prisma.epiContrato.upsert({
    where: { codigo: "ECC" },
    update: {},
    create: { codigo: "ECC" },
  });

  const grupos: { items: EccItem[]; tipo: "EPI" | "GERAL" }[] = [
    { items: data.epis, tipo: "EPI" },
    { items: data.deposito, tipo: "GERAL" },
    { items: data.escritorio, tipo: "GERAL" },
    { items: data.veicular, tipo: "GERAL" },
    { items: data.alojamento, tipo: "GERAL" },
  ];

  let importados = 0;
  for (const grupo of grupos) {
    for (const item of grupo.items) {
      const produto = await upsertEpiProdutoPorNome(
        item.nome,
        null,
        { tipo: grupo.tipo, categoria: grupo.tipo === "GERAL" ? item.categoria : null, ca: item.ca, unidade: "UNID" },
        { ca: item.ca ?? undefined, categoria: grupo.tipo === "GERAL" ? item.categoria : undefined }
      );
      // ESTOQUE ATUAL da planilha = a contagem física real de agora, então
      // vira o estoqueInicial (baseline) do nosso controle, sem nenhuma
      // movimentação retroativa inventada.
      await upsertEpiEstoque(produto.id, contratoECC.id, {
        estoqueInicial: item.estoqueAtual,
        estoqueMinimo: Math.max(0, Math.ceil(item.estoqueMinimo)),
      });
      importados++;
    }
  }
  console.log(`[3/3] ${importados} itens importados/atualizados do controle ECC (contrato ${contratoECC.codigo}).`);
}

async function main() {
  await fixArredondamento();
  await recategorizarFardamento();
  await importarExtraECC();
  console.log("Migração fase 2 concluída.");
}

main()
  .catch((err) => {
    console.error("Erro na migração:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
