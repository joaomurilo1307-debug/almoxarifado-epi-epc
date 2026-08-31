import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Correção de rumo pedida pelo João (31/08/2026): a Fase 5 separou tamanho
// do nome, mas continuou tratando CADA MARCA/CA como um produto diferente
// (ex.: "BOTA DE SEGURANÇA MARLUVAS - CA42374" e "...BRACOL - CA25687" como
// dois produtos). Errado — conferido na planilha "INFORMAÇÕES GERAIS - MRN"
// (aba "EPIs Mínimos" e a pivot "Informações mínimas", feita pelo Matheus):
// o controle é por TIPO + TAMANHO, sem marca — "BOTA" é uma linha só,
// "BOTA COM PROTEÇÃO DE METATARSO" é outra, ponto. Marca/CA não define o
// produto, é só metadado incidental (o que tiver disponível na hora da
// compra) — por isso zera aqui, não porque a informação não importe nunca.
//
// Regra usada pra decidir o que funde: nome idêntico ou nome que só muda
// por marca/CA/cor-de-fabricante — mesma coisa física, fabricante
// intercambiável. NÃO fundido: quando o nome carrega uma diferença de
// DESENHO real (cor de capacete/colete = hierarquia; classe de respirador;
// cadarço de touca sem confirmação equivalente à da bota) — aí fica
// separado até confirmar.

type Regra = { nomeFinal: string; fontes: string[] };

// Pré-ajuste: alguns itens (principalmente das botas/luvas isoladas, que
// nunca colidiram com outro item da mesma marca na Fase 5) ainda têm o
// tamanho embutido só no nome, sem o campo `tamanho` preenchido. Extrai
// antes de agrupar por tipo.
const TAMANHO_EMBUTIDO: { nome: string; tamanho: string }[] = [
  { nome: "BOTA DE SEGURANÇA 40 BRACOL - CA37455", tamanho: "40" },
  { nome: "BOTA DE SEGURANÇA 41 (PROTEÇÃO DE METARARSO) - CA43959", tamanho: "41" },
  { nome: "BOTA DE SEGURANÇA 41 (PROTEÇÃO DE METATARSO) - CA37450", tamanho: "41" },
  { nome: "LUVA PU G KALIPSO - CA15272", tamanho: "G" },
  { nome: "LUVA PU G SAFETY - CA32038", tamanho: "G" },
  { nome: "LUVA PU G VOLK - CA30916", tamanho: "G" },
  { nome: "LUVA ANTICORTE G - CA36606", tamanho: "G" },
  { nome: "LUVA ANTICORTE M - CA34000", tamanho: "M" },
];

const REGRAS: Regra[] = [
  {
    nomeFinal: "BOTA",
    fontes: [
      "BOTA COM CADARÇO BICO COMPOSITE",
      "BOTA SEM CADARÇO BICO COMPOSITE",
      "BOTA DE SEGURANÇA BRACOL - CA25687",
      "BOTA DE SEGURANÇA MARLUVAS - CA42374",
      "BOTA DE SEGURANÇA BOMPEL - CA37671",
      "BOTA DE SEGURANÇA BRACOL - CA42165",
      "BOTA DE SEGURANÇA BRACOL - CA25259",
      "BOTA DE SEGURANÇA 40 BRACOL - CA37455",
    ],
  },
  {
    nomeFinal: "BOTA COM PROTEÇÃO DE METATARSO",
    fontes: ["BOTA DE SEGURANÇA 41 (PROTEÇÃO DE METARARSO) - CA43959", "BOTA DE SEGURANÇA 41 (PROTEÇÃO DE METATARSO) - CA37450"],
  },
  {
    nomeFinal: "LUVA PU",
    fontes: ["LUVA PU DANNY - CA29014", "LUVA PU DELTA - CA36365", "LUVA PU G KALIPSO - CA15272", "LUVA PU G SAFETY - CA32038", "LUVA PU G VOLK - CA30916"],
  },
  {
    nomeFinal: "LUVA ANTICORTE",
    fontes: ["LUVA ANTICORTE - CA12872", "LUVA ANTICORTE G - CA36606", "LUVA ANTICORTE M - CA34000"],
  },
  {
    nomeFinal: "LUVA DE BORRACHA",
    fontes: ["LUVA DE BORRACHA - CA25313", "LUVA DE BORRACHA - CA41918", "LUVA DE BORRACHA - CA5774"],
  },
  {
    nomeFinal: "CAPA DE CHUVA",
    fontes: ["CAPA DE CHUVA", "CAPA DE CHUVA AMARELA", "Capa de chuva (Brascamp)"],
  },
  {
    nomeFinal: "CAPACETE AZUL",
    fontes: ["CAPACETE AZUL 3M - CA29638", "CAPACETE CLASE B AZUL"],
  },
  {
    nomeFinal: "TOUCA ÁRABE",
    fontes: ["TOUCA ÁRABE - CA28998", "TOUCA ÁRABE - CA39760", "TOUCA ÁRABE - CA44963", "TOUCA ÁRABE - CA49731"],
  },
  {
    nomeFinal: "PROTETOR AUDITIVO",
    fontes: ["PROTETOR AUDITIVO 3M - CA33835", "PROTETOR AUDITIVO LIBUS - CA37134", "PROTETOR AUDITIVO LIBUS - CA43350", "PROTETOR AUDITIVO MSA - CA27971"],
  },
  {
    nomeFinal: "PROTETOR RESPIRATÓRIO",
    fontes: [
      "PROTETOR RESPIRÁTORIO - CA10578",
      "PROTETOR RESPIRÁTORIO - CA38812",
      "PROTETOR RESPIRÁTORIO - CA38954",
      "PROTETOR RESPIRÁTORIO - CA5657",
      "PROTETOR RESPIRÁTORIO - CA7072",
    ],
  },
  {
    nomeFinal: "PERNEIRA",
    fontes: ["PERNEIRA - CA39624", "PERNEIRA - CA44234", "PERNEIRA - CA48785"],
  },
  {
    nomeFinal: "ÓCULOS DE PROTEÇÃO INCOLOR",
    fontes: ["ÓCULOS DE PROTEÇÃO INCOLOR - CA11268", "ÓCULOS DE PROTEÇÃO INCOLOR - CA14991"],
  },
  // Segunda leva (31/08/2026) — achados comparando com a aba "EPIs por
  // Função" da mesma planilha: o MESMO EPI (mesmo nome de função) aparece
  // com CA diferente em CADA CONTRATO (ex.: "Protetor auditivo tipo concha"
  // é CA37132 no contrato 3687 e CA27971 nos outros) — confirma de vez que
  // CA varia por contrato/época de compra, nunca devia ter sido usado pra
  // separar produto.
  {
    nomeFinal: "LUVA DE PVC",
    fontes: ["LUVA DE PVC", "LUVA DE PVC - CA34570"],
  },
  {
    nomeFinal: "LUVA MISTA CANO LONGO",
    fontes: ["LUVA MISTA CANO LONGO - CA36845", "LUVA MISTA CANO LONGO - CA40319"],
  },
  {
    nomeFinal: "LUVA NITRILICA",
    fontes: ["LUVA NITRILICA", "LUVA NITRILICA - CA25280"],
  },
  {
    nomeFinal: "MANGOTE",
    fontes: ["MANGOTE - CA12107", "MANGOTE - CA41029"],
  },
  {
    nomeFinal: "ÓCULOS DE PROTEÇÃO ESCURO",
    fontes: ["ÓCULOS DE PROTEÇÃO ESCURO - CA11268", "ÓCULOS DE PROTEÇÃO ESCURO - CA20716"],
  },
  {
    nomeFinal: "LUVA VAQUETA",
    fontes: ["LUVA VAQUETA", "LUVA DE VAQUETA - CA11711"],
  },
  {
    // Confirmado na aba "EPIs por Função": "Perneira com proteção de
    // joelhos" é CA41818 (bate com a TECMATER do catálogo) — as outras 2
    // descrevem a mesma proteção de joelho com nome/marca diferente.
    // Distinto da "PERNEIRA" simples (essa já fundida antes, CA19667/27348
    // na planilha — sem proteção de joelho).
    nomeFinal: "PERNEIRA COM PROTEÇÃO DE JOELHO",
    fontes: ["PERNEIRA DE BEDIM COM JOELHEIRA - TECMATER", "PERNEIRA DE BEDIM JOELHEIRA", "Perneira com proteção nos joelhos (Sthil)"],
  },
  {
    // "OCULOS BANDA ELASTICA INCOLOR/PRETO" (import MRN antigo, CA28436) e
    // "ÓCULOS DE PROTEÇÃO .../COM BANDA ELASTICA - CA39190" (import ECC
    // novo) descrevem o mesmo tipo de óculos (banda elástica + cor) — dois
    // CAs diferentes de dois lotes de compra diferentes, mesma peça.
    nomeFinal: "ÓCULOS INCOLOR COM BANDA ELÁSTICA",
    fontes: ["OCULOS BANDA ELASTICA INCOLOR", "ÓCULOS DE PROTEÇÃO INCOLOR COM BANDA ELASTICA - CA39190"],
  },
  {
    nomeFinal: "ÓCULOS ESCURO COM BANDA ELÁSTICA",
    fontes: ["OCULOS BANDA ELASTICA PRETO", "ÓCULOS DE PROTEÇÃO ESCURO COM BANDA ELASTICA - CA39190"],
  },

  // Terceira leva (31/08/2026) — João pediu pra cruzar com cuidado 3 fontes:
  // aba "EPI - OP 3" (catálogo com foto/modelo/fabricante), aba "EPIs
  // Mínimos" (lista canônica de ~35 tipos, feita pelo Matheus) e aba "EPIs
  // por Função" (CA realmente distribuído por função/contrato). Achado 1:
  // várias linhas do banco eram nome-sentença batendo 1:1 com a descrição
  // da OP-3 ("Óculos de segurança convencional (claro ou escuro)", "Bota de
  // segurança impermeável" etc.) — import acidental da planilha de
  // referência (fotos) como se fosse produto de estoque real; confirmado
  // que têm estoque=0 E mínimo=0 em TODOS os contratos, ou seja, nunca
  // foram de fato produto rastreado, só ruído. Achado 2: as duas convenções
  // de nome dos dois lotes de importação (MRN antiga x controle ECC novo)
  // continuavam sem se cruzar pra vários tipos (óculos, luvas, uniforme).
  {
    nomeFinal: "PROTETOR AUDITIVO",
    fontes: ["PROTETOR AUDITIVO", "ABAFADOR DE RUIDOS TP CONCHA ACOPLAR"],
  },
  {
    nomeFinal: "AVENTAL DE PVC",
    fontes: ["AVENTAL DE PVC", "AVENTAL - CA11793"],
  },
  {
    // "LUVA AGENTES MECANICOS" e "LUVA PU CUT ANTI CORTE" descrevem a mesma
    // luva anti-corte (CA36606 Volk "Cut Oil" já fundida antes) com nome de
    // import diferente.
    nomeFinal: "LUVA ANTICORTE",
    fontes: ["LUVA ANTICORTE", "LUVA AGENTES MECANICOS", "LUVA PU CUT ANTI CORTE"],
  },
  {
    // "Óculos de segurança convencional (claro ou escuro)" é a linha-
    // sentença da OP-3 (CA36698, um CA só cobre as 2 cores) — zero estoque,
    // dobra em cima do que já existe separado por cor.
    nomeFinal: "ÓCULOS DE PROTEÇÃO INCOLOR",
    fontes: ["ÓCULOS DE PROTEÇÃO INCOLOR", "OCULOS DE SEGURANÇA ANTIRRISCO INCOLOR", "Óculos de segurança convencional (claro ou escuro)"],
  },
  {
    nomeFinal: "ÓCULOS DE PROTEÇÃO ESCURO",
    fontes: ["ÓCULOS DE PROTEÇÃO ESCURO", "OCULOS DE SEGURANÇA ANTIRRISCO CINZA"],
  },
  {
    // "Ampla visão" / "de sobreposição" = mesmo desenho (óculos que veste
    // por cima, tipo sobrepor) em nomes diferentes dos dois lotes; CA muda
    // por marca/lote, não por modelo.
    nomeFinal: "ÓCULOS DE AMPLA VISÃO INCOLOR",
    fontes: [
      "ÓCULOS DE PROTEÇÃO INCOLOR AMPLA VISÃO - CA12572",
      "ÓCULOS DE PROTEÇÃO INCOLOR DE SOBREPOSIÇÃO - CA16462",
      "OCULOS SEGURANÇA SOBREPOR",
      "ÓCULOS DE PROTEÇÃO INCOLOR DE SOBREPOSIÇÃO E BANDA ELASTICA - CA19072",
    ],
  },
  {
    nomeFinal: "ÓCULOS DE AMPLA VISÃO ESCURO",
    fontes: ["ÓCULOS DE PROTEÇÃO ESCURO AMPLA VISÃO - CA9722", "ÓCULOS DE PROTEÇÃO ESCURO DE SOBREPOSIÇÃO - CA16462"],
  },
  {
    nomeFinal: "ÓCULOS INCOLOR COM BANDA ELÁSTICA",
    fontes: ["ÓCULOS INCOLOR COM BANDA ELÁSTICA", "Óculos de segurança com banda elástica (claro ou escuro)"],
  },
  {
    // "CALÇA POLICOTON LEVE" é a mesma calça de uniforme (uma das 3 peças
    // padrão), só nomeada pelo tecido no import ECC em vez de "CALÇA" like
    // no import MRN. Idem jaleco e colete abaixo.
    nomeFinal: "CALÇA",
    fontes: ["CALÇA", "CALÇA POLICOTON LEVE"],
  },
  {
    nomeFinal: "CAMISA JALECO",
    fontes: ["CAMISA JALECO", "JALECO POLICOTON LEVE"],
  },
  {
    // "EPIs por Função" descreve o colete sempre como "refletivo verde OU
    // laranja" — cor é variação de lote, não modelo diferente; confirma que
    // "COLETE LARANJA"/"COLETE VERDE" (import sem a palavra "refletivo" no
    // nome) são a mesma peça de "COLETE REFLETIVO".
    nomeFinal: "COLETE REFLETIVO",
    fontes: ["COLETE REFLETIVO", "COLETE LARANJA", "COLETE VERDE"],
  },

  // Renomeações puras (produto único, sem duplicata de verdade) — só tira
  // marca/CA do nome pra bater com o nome canônico da planilha EPIs
  // Mínimos, ou corrige nome-sentença que veio direto da OP-3 (mesmo
  // produto real, só com o nome errado).
  { nomeFinal: "BLUSÃO DE OPERADOR DE MOTOSSERRA", fontes: ["BLUSÃO DE OPERADOR - CA46231"] },
  { nomeFinal: "CALÇA DE OPERADOR DE MOTOSSERRA", fontes: ["CALÇA DE OPERADOR - CA36600"] },
  { nomeFinal: "CAPACETE BRANCO", fontes: ["CAPACETE BRANCO MSA - CA498"] },
  { nomeFinal: "CAPACETE CINZA", fontes: ["CAPACETE CINZA MSA - CA498"] },
  { nomeFinal: "CAPACETE LARANJA", fontes: ["CAPACETE LARANJA MSA - CA498"] },
  { nomeFinal: "CARNEIRA", fontes: ["Carneira para capacete"] },
  // Ghost da OP-3 (CA34233, categoria "PVC" na planilha) promovido a tipo
  // canônico real — "BOTA DE PVC" não tinha NENHUMA linha no catálogo.
  { nomeFinal: "BOTA DE PVC", fontes: ["Bota de segurança impermeável"] },
  // Idem: "LUVA DE OP. DE MOTOSSERRA" e "LUVA ANTI-TERMICA" da planilha
  // EPIs Mínimos não tinham linha nenhuma — só existiam como ghost OP-3.
  { nomeFinal: "LUVA DE OPERADOR DE MOTOSSERRA", fontes: ["Luva motosserrista vaqueta"] },
  { nomeFinal: "LUVA ANTI-TÉRMICA", fontes: ["Luva térmica"] },
  // "Luva impermeável (Solvex)" = luva de látex reutilizável (categoria
  // Latex na OP-3, CA12598/12872 — CA muda por lote) -> tipo canônico
  // "LUVA DE LÁTEX" do Matheus, que também não tinha linha nenhuma.
  { nomeFinal: "LUVA DE LÁTEX", fontes: ["Luva impermeável (Solvex)"] },
  // "LUVA DE LATEX - CA13030": aba "EPIs por Função" chama esse CA
  // explicitamente de "luvas de procedimento descartáveis látex" (uso
  // veterinário/laboratório) — produto diferente da luva de látex de
  // trabalho pesado acima, mantido separado, só renomeado pra não
  // confundir com o tipo genérico.
  { nomeFinal: "LUVA DE LÁTEX DESCARTÁVEL", fontes: ["LUVA DE LATEX - CA13030"] },
  { nomeFinal: "LUVA ANTI-IMPACTO", fontes: ["LUVA ANTI-IMPACTO - CA44549"] },
  { nomeFinal: "LUVA DE RASPA CANO LONGO", fontes: ["LUVA DE RASPA CANO LOGO - CA40320"] }, // corrige erro de digitação "LOGO"->"LONGO"
  { nomeFinal: "LUVA DE SEGURANÇA DESCARTÁVEL 8X100 UND", fontes: ["LUVA DE SEGURANÇA DESCATAVEL 8X100 UND"] }, // corrige "DESCATAVEL"
  { nomeFinal: "LUVA MISTA", fontes: ["LUVA MISTA - CA52131"] },
  { nomeFinal: "LUVA DE VAQUETA", fontes: ["LUVA VAQUETA"] },
  { nomeFinal: "PERNEIRA DE BIDIM", fontes: ["PERNEIRA"] },
  { nomeFinal: "PROTETOR FACIAL DE ACRÍLICO", fontes: ["PROTETOR FACIAL DE ACRILICO - CA311814"] },
  { nomeFinal: "COLETE SALVA-VIDAS", fontes: ["Colete salva-vidas (Homolog. Marinha nº 062/2012)"] },
  { nomeFinal: "KIT MOTOSSERRISTA UNIFORME", fontes: ["KIT MOTOSSERRISTA UNIFOEME"] }, // corrige "UNIFOEME"
  { nomeFinal: "TOUCA ÁRABE COM ABA", fontes: ["TOUCA ARABE COM ABA"] },
  { nomeFinal: "TOUCA ÁRABE SEM ABA", fontes: ["TOUCA ARABE SEM ABA"] },
  // Modelo de bota alternativo (coturno cadarçado, CA37533 Marluvas) sem
  // nenhum estoque real — mesma função de "BOTA", só nome/marca diferente.
  { nomeFinal: "BOTA", fontes: ["Coturno Preta Bico De Aço Laranja 60C32MTAMEX Cadarço"] },
];

// Ajuste de unidade — bota é sempre contada em pares, mas ficou UNID em
// alguns tamanhos por causa de duas importações diferentes usando unidade
// diferente antes da fusão.
const UNIDADE_PADRAO: { nome: string; unidade: string }[] = [
  { nome: "BOTA", unidade: "PAR(ES)" },
  { nome: "BOTA COM PROTEÇÃO DE METATARSO", unidade: "PAR(ES)" },
];

// Tipos que existem na aba "EPIs Mínimos" (planilha do Matheus) mas não
// tinham NENHUMA linha no catálogo — nem fantasma, nem com nome errado.
// João pediu pra cadastrar mesmo assim, com estoque 0 (sem inventar
// quantidade/CA/fabricante — só o tipo, que é dado real da planilha de
// referência), pra bater 100% com a lista canônica dele. Fica no pool
// "Geral" (contratoId null, mesmo pool de "Depósito central/ECC" do
// resto do catálogo) até entrar estoque de verdade.
const TIPOS_FALTANTES = ["BALACLAVA", "PROTETOR FACIAL TELADO", "MACACÃO APICULTOR", "PROTETOR SOLAR"];

async function repoint(deId: string, paraId: string) {
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

  for (const { nome, tamanho } of TAMANHO_EMBUTIDO) {
    const r = await prisma.epiProduto.updateMany({ where: { nome, tamanho: null }, data: { tamanho } });
    if (r.count > 0) log.push(`[tamanho embutido] "${nome}" -> tamanho="${tamanho}"`);
  }

  for (const regra of REGRAS) {
    const produtos = await prisma.epiProduto.findMany({ where: { nome: { in: regra.fontes } } });
    if (produtos.length === 0) {
      log.push(`[pular] "${regra.nomeFinal}": nenhuma fonte encontrada (já rodado antes?)`);
      continue;
    }

    const porTamanho = new Map<string, typeof produtos>();
    for (const p of produtos) {
      const chave = p.tamanho ?? "";
      if (!porTamanho.has(chave)) porTamanho.set(chave, []);
      porTamanho.get(chave)!.push(p);
    }

    for (const [tamanho, itens] of porTamanho) {
      const [manter, ...resto] = itens;
      // Já processado antes (sobrou só 1, já sem CA/fabricante, já com o
      // nome final)? Não repete — evita ficar "fundindo" a mesma linha com
      // ela mesma toda vez que alguém roda de novo.
      if (resto.length === 0 && manter.nome === regra.nomeFinal && manter.ca === null && manter.fabricante === null) continue;
      for (const dup of resto) {
        await repoint(dup.id, manter.id);
        await prisma.epiProduto.delete({ where: { id: dup.id } });
      }
      await prisma.epiProduto.update({ where: { id: manter.id }, data: { nome: regra.nomeFinal, ca: null, fabricante: null } });
      log.push(`[${regra.nomeFinal}] tamanho="${tamanho || "—"}": ${itens.length} fonte(s) -> 1 produto (CA/fabricante zerados)`);
    }
  }

  for (const { nome, unidade } of UNIDADE_PADRAO) {
    const r = await prisma.epiProduto.updateMany({ where: { nome, unidade: { not: unidade } }, data: { unidade } });
    if (r.count > 0) log.push(`[unidade] "${nome}": ${r.count} linha(s) -> "${unidade}"`);
  }

  for (const nome of TIPOS_FALTANTES) {
    const existente = await prisma.epiProduto.findFirst({ where: { nome, tipo: "EPI" } });
    if (existente) {
      log.push(`[tipo faltante] "${nome}": já existe, não recriado`);
      continue;
    }
    const produto = await prisma.epiProduto.create({
      data: { nome, tipo: "EPI", unidade: "UNID" },
    });
    await prisma.epiEstoque.create({
      data: { produtoId: produto.id, contratoId: null, estoqueInicial: 0, estoqueMinimo: 0 },
    });
    log.push(`[tipo faltante] "${nome}": criado (estoque 0, sem CA/fabricante)`);
  }

  // João pediu (31/08/2026): "higienizada" é flag do lote (como marca/CA),
  // não um tamanho ou tipo diferente. Estava embutida como texto dentro de
  // `tamanho` (ex.: "G (Higienizada)"), dobrando a lista de tamanhos de
  // CALÇA/CAMISA DE MALHA/CAMISA JALECO. Varre TODO produto com esse texto
  // (não só os 3 já vistos) — extrai pro campo `higienizado` de verdade,
  // limpa o tamanho. Sem merge/repoint: cada linha já é o produto de
  // verdade, só corrige os 2 campos nela mesma.
  const comHigienizadaNoNome = await prisma.epiProduto.findMany({
    where: { tamanho: { contains: "Higienizada", mode: "insensitive" } },
  });
  for (const p of comHigienizadaNoNome) {
    const tamanhoLimpo = (p.tamanho ?? "").replace(/\s*\(Higienizada\)\s*$/i, "").trim() || null;
    await prisma.epiProduto.update({ where: { id: p.id }, data: { tamanho: tamanhoLimpo, higienizado: true } });
    log.push(`[higienizada -> flag] "${p.nome}" tamanho "${p.tamanho}" -> tamanho="${tamanhoLimpo}", higienizado=true`);
  }

  return NextResponse.json({ ok: true, totalLinhas: log.length, log });
}
