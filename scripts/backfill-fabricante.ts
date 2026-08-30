// Parte 3 do pedido de 30/08/2026: cruzar os 33 itens do documento de
// referência "EPI.xlsx11.xlsx" (IT 2.2/8.12, com fabricante/modelo/CA/valor
// reais) contra o catálogo já existente. Feito nome a nome e CA a CA — nunca
// por adivinhação de texto.
//
// Resultado da conferência (rodada via SQL antes de escrever este script):
// - 14 itens do catálogo já existiam e têm o MESMO CA de um item do
//   documento → só falta o fabricante, que fica preenchido aqui.
// - 11 itens do documento NÃO existem no catálogo (nenhum produto com esse
//   CA) → são adicionados como itens novos, com o valor/fabricante reais do
//   documento e a foto de referência já extraída (não inventa nada — todas
//   essas fotos já foram extraídas do mesmo documento numa sessão anterior).
//   Estoque inicial fica em 0 porque não existe nenhuma contagem real
//   conhecida pra esses itens — fica pra alguém lançar a entrada real depois.
//
// Observação que ficou dos dados de origem, não é bug daqui: o documento usa
// o MESMO CA (28449) pra "Capa de chuva" (Brascamp) e "Colete salva-vidas"
// (Ativa) — dois itens fisicamente diferentes. Provável erro de digitação no
// documento original; mantive os dois exatamente como estão na fonte, sem
// tentar adivinhar qual CA está certo.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BACKFILL_POR_CA: { ca: string; fabricante: string }[] = [
  { ca: "42374", fabricante: "Marluvas Calçados de Segurança" },
  { ca: "28998", fabricante: "Hercules Equipamentos de Proteção Ltda." },
  { ca: "498", fabricante: "MSA" },
  { ca: "41818", fabricante: "Tecmater Sistemas e Equipamentos Florestais Ltda" },
  { ca: "42941", fabricante: "Volk do Brasil" },
  { ca: "11711", fabricante: "Luveq" },
  { ca: "12872", fabricante: "Ansell Brazil Ltda." },
  { ca: "36606", fabricante: "Volk do Brasil" },
  { ca: "12107", fabricante: "Ansell Brazil Ltda." },
  { ca: "19072", fabricante: "Honeywell Produtos de Segurança" },
  { ca: "27971", fabricante: "MSA" },
  { ca: "10578", fabricante: "KSN" },
  { ca: "46231", fabricante: "Sayro" },
  { ca: "36600", fabricante: "Sayro" },
];

const NOVOS_ITENS: {
  nome: string;
  ca: string | null;
  fabricante: string;
  valorUnitario: number;
  fotoUrl: string;
}[] = [
  {
    nome: "Coturno Preta Bico De Aço Laranja 60C32MTAMEX Cadarço",
    ca: "37533",
    fabricante: "Marluvas Calçados de Segurança",
    valorUnitario: 375.99,
    fotoUrl: "/epi-fotos/008_Coturno_Preta_Bico_De_A_o_Laranja_60C32MTAMEX_Cada.png",
  },
  {
    nome: "Bota de segurança impermeável",
    ca: "34233",
    fabricante: "BSB Produtora de Equipamentos de Proteção Individual S.A.",
    valorUnitario: 126.76,
    fotoUrl: "/epi-fotos/009_Bota_de_seguran_a_imperme_vel.png",
  },
  {
    nome: "Perneira com proteção nos joelhos (Sthil)",
    ca: "30956",
    fabricante: "Tecmater Sistemas e Equipamentos Florestais Ltda",
    valorUnitario: 20.17,
    fotoUrl: "/epi-fotos/014_Perneira_com_prote_o_nos_joelhos.png",
  },
  {
    nome: "Luva motosserrista vaqueta",
    ca: "12876",
    fabricante: "Tecmater Sistemas e Equipamentos Florestais Ltda",
    valorUnitario: 70,
    fotoUrl: "/epi-fotos/016_Luva_motosserrista_vaqueta.png",
  },
  {
    nome: "Luva térmica",
    ca: "32640",
    fabricante: "DVT Comércio",
    valorUnitario: 90.23,
    fotoUrl: "/epi-fotos/019_Luva_termica.png",
  },
  {
    nome: "Luva impermeável (Solvex)",
    ca: "12598",
    fabricante: "Ansell Brazil Ltda.",
    valorUnitario: 42,
    fotoUrl: "/epi-fotos/021_Luva_imperme_vel.png",
  },
  {
    nome: "Óculos de segurança convencional (claro ou escuro)",
    ca: "36698",
    fabricante: "OTLA Comércio de Equipamentos de Proteção Individual e de Sistemas Ópticos Ltda",
    valorUnitario: 45.12,
    fotoUrl: "/epi-fotos/025__culos_de_seguran_a_convenciona_claro_ou_escuro_.png",
  },
  {
    nome: "Óculos de segurança com banda elástica (claro ou escuro)",
    ca: "37807",
    fabricante: "OTLA Comércio de Equipamentos de Proteção Individual e de Sistemas Ópticos Ltda",
    valorUnitario: 109.28,
    fotoUrl: "/epi-fotos/026__culos_de_seguran_a_com_banda_el_stica_claro_ou_es.png",
  },
  {
    nome: "Capa de chuva (Brascamp)",
    ca: "28449",
    fabricante: "Brascamp Equipamentos de Proteção",
    valorUnitario: 14.23,
    fotoUrl: "/epi-fotos/031_Capa_de_chuva.png",
  },
  {
    nome: "Colete salva-vidas",
    ca: "28449",
    fabricante: "Ativa",
    valorUnitario: 55,
    fotoUrl: "/epi-fotos/032_Colete_salva_vidas.png",
  },
  {
    nome: "Carneira para capacete",
    ca: null,
    fabricante: "MSA",
    valorUnitario: 41.74,
    fotoUrl: "/epi-fotos/012_Carneira.png",
  },
];

async function backfillFabricante() {
  let atualizados = 0;
  for (const { ca, fabricante } of BACKFILL_POR_CA) {
    const r = await prisma.epiProduto.updateMany({ where: { ca, fabricante: null }, data: { fabricante } });
    atualizados += r.count;
  }
  // Jugular não tem CA no documento — casamento por nome (item inequívoco:
  // só existe um jugular no catálogo).
  const jugular = await prisma.epiProduto.updateMany({
    where: { nome: { contains: "JUGULAR", mode: "insensitive" }, fabricante: null },
    data: { fabricante: "MSA" },
  });
  atualizados += jugular.count;
  console.log(`[1/2] fabricante preenchido em ${atualizados} itens já existentes (mesmo CA do documento de referência).`);
}

async function adicionarItensFaltantes() {
  let criados = 0;
  for (const item of NOVOS_ITENS) {
    const existente = await prisma.epiProduto.findFirst({ where: { nome: item.nome, tamanho: null } });
    if (existente) continue; // idempotente — não duplica se já rodou antes
    const produto = await prisma.epiProduto.create({
      data: {
        nome: item.nome,
        tipo: "EPI",
        ca: item.ca,
        fabricante: item.fabricante,
        valorUnitario: item.valorUnitario,
        fotoUrl: item.fotoUrl,
      },
    });
    // Estoque criado a 0 — não existe contagem real conhecida pra esses
    // itens ainda; fica visível na aba Estoque pra alguém lançar a entrada
    // real quando tiver o número, em vez de ficar invisível fora da lista.
    await prisma.epiEstoque.create({
      data: { produtoId: produto.id, contratoId: null, estoqueInicial: 0, estoqueMinimo: 0 },
    });
    criados++;
  }
  console.log(`[2/2] ${criados} itens novos adicionados ao catálogo (do documento de referência, ainda não catalogados).`);
}

async function main() {
  await backfillFabricante();
  await adicionarItensFaltantes();
  console.log("Concluído.");
}

main()
  .catch((err) => {
    console.error("Erro:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
