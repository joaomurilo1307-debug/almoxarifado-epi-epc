import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Mapeamento manual (não algorítmico, de propósito) de cada item do
// catálogo pra sua linha correspondente na aba "EPI - OP 3" (planilha
// EPI.xlsx11.xlsx) — o documento oficial da empresa com descrição técnica
// real, fabricante e modelo. Essa aba foi escrita pra um kit específico
// (Biólogos de campo), mas os ITENS físicos (bota, capacete, luva...) são
// os mesmos usados em outros contratos/funções — por isso o mapeamento
// cobre qualquer item do catálogo que bata, não só os da função de origem.
//
// Só entrou aqui item com correspondência clara por palavra-chave na
// própria descrição/nome do documento (ex.: "protetor de metatarso" pra
// BOTA COM PROTEÇÃO DE METATARSO, "BIDIM" pro modelo da PERNEIRA DE
// BIDIM) — item sem correspondência textual óbvia (ex.: LUVA ANTICORTE,
// MACACÃO APICULTOR) ficou de fora, pra não inventar/forçar associação.
const MAPA: { nome: string; tipo: string; descricao: string; fabricante: string }[] = [
  { nome: "BOTA", tipo: "EPI", fabricante: "Marluvas Calcados de Segurança",
    descricao: "Bota de segurança com proteção mecânica, confeccionada em couro, colarinho e lingueta soft acolchoados com forração Air Comfort transpirável, fechamento em cadarço, sem componentes metálicos (Atende à NR 10) com biqueira de composite leve e ultra-resistente. Palmilha de montagem resistente à perfuração, que cobre 100% da planta dos pés e solado isolante em PU bidensidade injetado diretamente no cabedal. (Ref. EPI-OP3: Bota de Segurança Marluvas 50B29 CPAP SRV, CA 42374)" },
  { nome: "BOTA COM PROTEÇÃO DE METATARSO", tipo: "EPI", fabricante: "Marluvas Calcados de Segurança",
    descricao: "Calçado de segurança resistente ao corte por motosserra tipo bota, fechamento em cadarço, confeccionado em couro curtido ao cromo, forro da gáspea em não tecido, forro lateral em tecido, palmilha de montagem em não tecido montada pelo sistema strobel, palmilha interna removível, biqueira de aço, protetor de metatarso, solado de borracha com entressola em poliuretano injetado diretamente no cabedal, resistente à absorção de energia na região do salto, ao contato do solado com o calor de até 300ºC, ao óleo combustível e ao corte por motosserra. (Ref. EPI-OP3: Marluvas 60C32 MT MEX, CA 37533)" },
  { nome: "TOUCA ÁRABE", tipo: "EPI", fabricante: "HERCULES EQUIPAMENTOS DE PROTECAO LTDA.",
    descricao: "Capuz de segurança confeccionado em tecido composto por viscose, lã e poliamida, com ou sem ajuste em elástico na parte frontal e traseira, com fechamento frontal através de velcro. (Ref. EPI-OP3: HJ230/HJ230E, CA 28998)" },
  { nome: "CAPACETE BRANCO", tipo: "EPI", fabricante: "MSA",
    descricao: "Capacete de segurança com aba frontal, carneira com ajuste fácil, jugular e catraca. (Ref. EPI-OP3: Capacete aba frontal MSA com jugular e catraca, CA 498 — mesmo modelo físico nas 4 cores, muda só a cor da casca)" },
  { nome: "CAPACETE AZUL", tipo: "EPI", fabricante: "MSA",
    descricao: "Capacete de segurança com aba frontal, carneira com ajuste fácil, jugular e catraca. (Ref. EPI-OP3: Capacete aba frontal MSA com jugular e catraca, CA 498 — mesmo modelo físico nas 4 cores, muda só a cor da casca)" },
  { nome: "CAPACETE LARANJA", tipo: "EPI", fabricante: "MSA",
    descricao: "Capacete de segurança com aba frontal, carneira com ajuste fácil, jugular e catraca. (Ref. EPI-OP3: Capacete aba frontal MSA com jugular e catraca, CA 498 — mesmo modelo físico nas 4 cores, muda só a cor da casca)" },
  { nome: "CAPACETE CINZA", tipo: "EPI", fabricante: "MSA",
    descricao: "Capacete de segurança com aba frontal, carneira com ajuste fácil, jugular e catraca. (Ref. EPI-OP3: Capacete aba frontal MSA com jugular e catraca, CA 498 — mesmo modelo físico nas 4 cores, muda só a cor da casca)" },
  { nome: "CARNEIRA", tipo: "EPI", fabricante: "MSA",
    descricao: "Suspensão Push-Key (tipo deslizante), composta por cinta/fita dupla em poliamida, carneira em PEAD de baixa densidade e testeira absorvedora de suor em laminado de PVC atóxico revestida com espuma multiperfurada de poliuretano. (Ref. EPI-OP3: Carneira com suspensão Push Key e Jugular MSA)" },
  { nome: "JUGULAR PARA CAPACETE", tipo: "EPI", fabricante: "MSA",
    descricao: "Jugular em tecido com dois ganchos nas extremidades e ajuste para adaptação no rosto do usuário. (Ref. EPI-OP3: Jugular Tecido Capacete MSA, mod. 297604)" },
  { nome: "PERNEIRA COM PROTEÇÃO DE JOELHO", tipo: "EPI", fabricante: "TECMATER SISTEMAS E EQUIPAMENTOS FLORESTAIS LTDA",
    descricao: "Perneira de segurança confeccionada em material sintético, com fechamento por costuras de solda eletrônica e fechos plásticos, com três talas de polipropileno frontais para proteção. (Ref. EPI-OP3: Perneira Sthil, CA 30956)" },
  { nome: "PERNEIRA DE BIDIM", tipo: "EPI", fabricante: "TECMATER SISTEMAS E EQUIPAMENTOS FLORESTAIS LTDA",
    descricao: "Perneira de segurança confeccionada em duas camadas de laminados de PVC (bidim), com hastes de aço revestidas em material polimérico embutidas na parte frontal, proteção no metatarso e joelho, partes unidas por solda eletrônica e costura, com velcro para ajuste e fechamento. (Ref. EPI-OP3: Perneira Proteção Total Talas Aço com Velcro, CA 41818)" },
  { nome: "LUVA DE OPERADOR DE MOTOSSERRA", tipo: "EPI", fabricante: "TECMATER SISTEMAS E EQUIPAMENTOS FLORESTAIS LTDA",
    descricao: "Luva de segurança confeccionada em vaqueta na palma, tecido de poliéster no dorso e punho, reforço em vaqueta nas pontas dos dedos e na palma, elástico no dorso para ajuste, velcro no punho para ajuste e fechamento (mão direita três dedos, mão esquerda dois dedos). (Ref. EPI-OP3: Luva Couro Vaqueta/Nylon Op. Motosserra Tecmater, CA 12876)" },
  { nome: "LUVA ANTI-IMPACTO", tipo: "EPI", fabricante: "VOLK DO BRASIL",
    descricao: "Luva de segurança confeccionada em fibras sintéticas e HPPE, 13 gauge, com banho nitrílico tipo Sandy na região palmar e ponta dos dedos, reforço nitrílico entre os dedos polegar e indicador, protetores de impacto TPR na região dorsal, punho com fibras elásticas. (Ref. EPI-OP3: Impacto Cut R2, CA 42941)" },
  { nome: "LUVA DE VAQUETA", tipo: "EPI", fabricante: "Luveq",
    descricao: "Luva de vaqueta total, punho 7 cm. (Ref. EPI-OP3: Luva Vaqueta Luveq, CA 11711)" },
  { nome: "LUVA ANTI-TÉRMICA", tipo: "EPI", fabricante: "VOLK DO BRASIL",
    descricao: "Luva de segurança confeccionada em fibras sintéticas HPPE (polietileno) 13 gauge, revestida em nitrila tipo sandy (areia) na palma e ponta dos dedos, punho com fibras elásticas — proteção contra agentes térmicos, mecânicos e cortantes. (Ref. EPI-OP3: Luva Cut Oil, CA 36606)" },
  { nome: "LUVA DE LÁTEX", tipo: "EPI", fabricante: "ANSELL BRAZIL LTDA.",
    descricao: "Luva de segurança confeccionada em látex de borracha natural, banhada em policloropreno (neoprene) na palma e dorso, flocada internamente com algodão, palma texturizada tipo losango, punho com acabamento picotado. (Ref. EPI-OP3: AlphaTec® 87-224, CA 12872)" },
  { nome: "LUVA NITRILICA", tipo: "EPI", fabricante: "DVT COMERCIO",
    descricao: "Luva de segurança confeccionada em náilon com banho nitrílico total, banho nitrílico espumoso antiderrapante na palma, face palmar dos dedos e pontas dos dedos. (Ref. EPI-OP3: 'Luva térmica' MaxiDry Total DVT, CA 32640 — cadastrada como térmica no documento de origem, mas a descrição é de luva nitrílica)" },
  { nome: "MANGOTE", tipo: "EPI", fabricante: "ANSELL BRAZIL LTDA.",
    descricao: "Mangote de segurança confeccionado em fio de para-aramida, com abertura para o dedo polegar, comprimento 46 cm, sem forração interna — proteção do braço e antebraço contra agentes abrasivos, escoriantes, cortantes, perfurantes e térmicos. (Ref. EPI-OP3: HyFlex® 70-118, CA 12107)" },
  { nome: "ÓCULOS DE AMPLA VISÃO INCOLOR", tipo: "EPI", fabricante: "HONEYWELL PRODUTOS DE SEGURANCA",
    descricao: "Óculos de segurança modelo ampla visão, armação em polipropileno rígido recoberto com borracha macia, sistema de ventilação indireta, tirante em tecido elástico, visor em policarbonato incolor, cobre toda a região em torno dos olhos. (Ref. EPI-OP3: Honeywell Uvex Stealth incolor, CA 19072)" },
  { nome: "ÓCULOS DE AMPLA VISÃO ESCURO", tipo: "EPI", fabricante: "HONEYWELL PRODUTOS DE SEGURANCA",
    descricao: "Óculos de segurança modelo ampla visão, armação em polipropileno rígido recoberto com borracha macia, sistema de ventilação indireta, tirante em neoprene, visor em policarbonato cinza, cobre toda a região em torno dos olhos. (Ref. EPI-OP3: Honeywell Uvex Stealth cinza, CA 19072)" },
  { nome: "ÓCULOS DE PROTEÇÃO INCOLOR", tipo: "EPI", fabricante: "OTLA COMERCIO DE EQUIPAMENTOS DE PROTECAO INDIVIDUAL E DE SISTEMAS OPTICOS LTDA",
    descricao: "Óculos de segurança convencional, armação e visor em policarbonato incolor numa única peça, hastes tipo espátula com apoio nasal em borracha maleável. (Ref. EPI-OP3: mod. 506U (variações), CA 36698)" },
  { nome: "ÓCULOS DE PROTEÇÃO ESCURO", tipo: "EPI", fabricante: "OTLA COMERCIO DE EQUIPAMENTOS DE PROTECAO INDIVIDUAL E DE SISTEMAS OPTICOS LTDA",
    descricao: "Óculos de segurança convencional, armação e visor em policarbonato verde escuro/espelhado numa única peça, hastes tipo espátula com apoio nasal em borracha maleável. (Ref. EPI-OP3: mod. 506U (variações), CA 36698)" },
  { nome: "ÓCULOS INCOLOR COM BANDA ELÁSTICA", tipo: "EPI", fabricante: "OTLA COMERCIO DE EQUIPAMENTOS DE PROTECAO INDIVIDUAL E DE SISTEMAS OPTICOS LTDA",
    descricao: "Óculos de segurança com armação convencional em grilamide, ponte e meia haste com elástico, lentes em policarbonato/resina CR-39 incolor, peça interna em policarbonato com borracha. (Ref. EPI-OP3: CA 37807)" },
  { nome: "ÓCULOS ESCURO COM BANDA ELÁSTICA", tipo: "EPI", fabricante: "OTLA COMERCIO DE EQUIPAMENTOS DE PROTECAO INDIVIDUAL E DE SISTEMAS OPTICOS LTDA",
    descricao: "Óculos de segurança com armação convencional em grilamide, ponte e meia haste com elástico, lentes em policarbonato/resina CR-39 cinza, peça interna em policarbonato com borracha. (Ref. EPI-OP3: CA 37807)" },
  { nome: "PROTETOR AUDITIVO", tipo: "EPI", fabricante: "MSA",
    descricao: "Abafador auditivo acoplável ao capacete, leve e sem partes metálicas expostas, hastes com ajuste de altura para melhor conforto. (Ref. EPI-OP3: Kit Abafador MSA XLS, CA 27971)" },
  { nome: "PROTETOR RESPIRATÓRIO", tipo: "EPI", fabricante: "KSN",
    descricao: "Respirador purificador de ar tipo peça semifacial filtrante para partículas PFF2, classe S, 4 camadas (fibra sintética externa, camada estrutural, camada filtrante eletrostática, camada interna de contato facial), tirantes elásticos, tira metálica de ajuste nasal e válvula de exalação. (Ref. EPI-OP3: Respirador descartável PFF2 com válvula, CA 10578)" },
  { nome: "PROTETOR SOLAR COM REPELENTE", tipo: "EPI", fabricante: "SUNLAU",
    descricao: "Loção para proteger a pele da radiação ultravioleta do sol, com repelente de insetos, FPS 50/60. (Ref. EPI-OP3: Sunlau 120g/120ml)" },
  { nome: "COLETE REFLETIVO", tipo: "EPI", fabricante: "Plastcor",
    descricao: "Colete refletivo classe 2, cor laranja, com 1 bolso. (Ref. EPI-OP3: Plastcor)" },
  { nome: "CAPA DE CHUVA", tipo: "EPI", fabricante: "BRASCAMP EQUIPAMENTOS DE PROTEÇÃO",
    descricao: "Capa de segurança confeccionada em tecido de poliéster plastificado com PVC numa das faces, capuz conjugado, mangas longas, fechamento frontal por botões de pressão, costura por solda eletrônica. (Ref. EPI-OP3: Brascamp)" },
  { nome: "COLETE SALVA-VIDAS", tipo: "EPI", fabricante: "Ativa",
    descricao: "Colete salva-vidas para navegação em águas abrigadas (rios, represas, lagos, beira-mar), homologado pela Marinha do Brasil nº 062/2012. (Ref. EPI-OP3: Colete de Caiaque III Ativa, CA 28449)" },
  { nome: "BLUSÃO DE OPERADOR DE MOTOSSERRA", tipo: "EPI", fabricante: "Sayro",
    descricao: "Blusão/jaqueta de segurança para operador de motosserra, confeccionado em poliéster, com 10 camadas internas em tela de poliéster de alta tenacidade nos ombros e braços, fechamento frontal em zíper. (Ref. EPI-OP3: BOP 100 - 10 Camadas, CA 46231)" },
  { nome: "CALÇA DE OPERADOR DE MOTOSSERRA", tipo: "EPI", fabricante: "Sayro",
    descricao: "Calça de segurança tipo A (230º) para proteção contra agentes mecânicos de motosserra, 100% poliéster, 10 camadas de tecido (1 externa + 8 internas de tela de poliéster de alta tenacidade + 1 forro interno), sem faixa retrorrefletiva. (Ref. EPI-OP3: Calça motosserrista Tipo A - 230º, CA 36600)" },
  { nome: "CAMISA DE MALHA", tipo: "FARDAMENTO", fabricante: "CRN DINIZ",
    descricao: "Camisa polo em malha piquet. (Ref. EPI-OP3: Camisa Malha Piquet, CRN Diniz)" },
];

// Popula descricao e fabricante a partir da referência oficial EPI-OP3 —
// só quando o campo ainda está vazio (nunca sobrescreve dado já cadastrado
// manualmente ou vindo da importação original).
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let linhasAtualizadas = 0;
  const resultado: { nome: string; linhas: number }[] = [];

  for (const item of MAPA) {
    const r = await prisma.epiProduto.updateMany({
      where: { nome: item.nome, tipo: item.tipo as any, descricao: null },
      data: { descricao: item.descricao },
    });
    await prisma.epiProduto.updateMany({
      where: { nome: item.nome, tipo: item.tipo as any, fabricante: null },
      data: { fabricante: item.fabricante },
    });
    linhasAtualizadas += r.count;
    resultado.push({ nome: item.nome, linhas: r.count });
  }

  return NextResponse.json({ ok: true, itensNoMapa: MAPA.length, linhasAtualizadas, detalhe: resultado });
}
