import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PADROES_FUNCAO,
  NOME_POR_CATEGORIA_UNICA,
  normFuncaoTexto,
  bateComPadrao,
  normFuncaoNome,
  funcaoColaboradorBateComRegra,
} from "@/lib/epiFuncaoMatch";

// "BOTA COM PROTEÇÃO DE METATARSO" é o único item com elegibilidade por
// função MAS tamanho por ficha (mesmo campo da bota comum) — todo o resto
// batido por função não tem tamanho (capacete, luva, colete...).
const NOME_METATARSO = "BOTA COM PROTEÇÃO DE METATARSO";

// Reconstrói do zero a tabela EpiColaboradorItem (colaborador -> item que
// precisa -> tamanho) a partir de 2 fontes, exatamente como pedido pelo João
// (31/08/2026): a ficha de cadastro (tamanhoBota/Calça/Camisa, universal,
// sem depender de função) e a matriz "EPIs por Função" (EpiFuncaoRegra,
// cruzada por palavra-chave — mesmas regras já testadas linha a linha em
// lib/epiFuncaoMatch.ts). Roda por completo (delete + insere de novo) toda
// vez, pra nunca ficar com lixo de colaborador desligado ou função que
// mudou — é barato (poucos milhares de linhas) e sempre reflete o estado
// atual, sem precisar diffar.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [colaboradores, regras] = await Promise.all([
    prisma.epiColaborador.findMany({
      where: { situacao: "ATIVO" },
      select: { id: true, funcao: true, tamanhoBota: true, tamanhoCalca: true, tamanhoCamisa: true },
    }),
    prisma.epiFuncaoRegra.findMany({ select: { funcao: true, categoria: true, descricao: true } }),
  ]);

  // Agrupa as regras por função normalizada — a regra vale pra função,
  // independente de qual contrato trouxe a linha na planilha original (2
  // contratos com a mesma função reusam a mesma regra).
  const regrasPorFuncao = new Map<string, { categoria: string; linhas: string[] }[]>();
  for (const r of regras) {
    const chave = normFuncaoNome(r.funcao);
    const linhas = r.descricao
      .split("\n")
      .map((l) => normFuncaoTexto(l))
      .filter(Boolean);
    if (!regrasPorFuncao.has(chave)) regrasPorFuncao.set(chave, []);
    regrasPorFuncao.get(chave)!.push({ categoria: r.categoria, linhas });
  }
  const funcoesRegraNorm = [...regrasPorFuncao.keys()];

  // Mapa em vez de array — evita linha duplicada (colaborador+item) quando
  // 2 grupos de regra da mesma função citam o mesmo item, o que violaria o
  // @@unique([colaboradorId, produtoNome]).
  const mapaItens = new Map<
    string,
    { colaboradorId: string; produtoNome: string; tamanho: string | null; origem: "FICHA" | "FUNCAO" }
  >();
  function add(colaboradorId: string, produtoNome: string, tamanho: string | null, origem: "FICHA" | "FUNCAO") {
    mapaItens.set(`${colaboradorId}|${produtoNome}`, { colaboradorId, produtoNome, tamanho, origem });
  }

  for (const c of colaboradores) {
    // FICHA — universal, direto dos campos de tamanho da ficha, sem
    // depender de função. Todo colaborador ativo com o campo preenchido usa
    // o item, no tamanho da própria ficha.
    if (c.tamanhoBota != null) add(c.id, "BOTA", String(c.tamanhoBota), "FICHA");
    if (c.tamanhoCalca != null) add(c.id, "CALÇA", String(c.tamanhoCalca), "FICHA");
    if (c.tamanhoCamisa) {
      add(c.id, "CAMISA DE MALHA", c.tamanhoCamisa, "FICHA");
      add(c.id, "CAMISA JALECO", c.tamanhoCamisa, "FICHA");
    }

    // FUNÇÃO — cruza a função do colaborador (normalizada, tolerando
    // sufixo de nível) com as regras da matriz "EPIs por Função"; cada
    // linha da descrição bate contra os padrões de palavra-chave.
    const funcaoColabNorm = normFuncaoNome(c.funcao);
    const funcaoBatida = funcoesRegraNorm.find((fr) => funcaoColaboradorBateComRegra(funcaoColabNorm, fr));
    if (!funcaoBatida) continue;

    for (const grupo of regrasPorFuncao.get(funcaoBatida)!) {
      // Categoria com item único (Audição/Respiratório/Braços) — não
      // precisa de palavra-chave, só confirma que a categoria tem conteúdo.
      const nomeUnico = NOME_POR_CATEGORIA_UNICA[grupo.categoria];
      if (nomeUnico && grupo.linhas.length > 0) add(c.id, nomeUnico, null, "FUNCAO");

      // Categorias com múltiplos itens — cruza por palavra-chave, linha a
      // linha (uma regra pode listar vários itens, um por linha).
      for (const [nomeItem, padroes] of Object.entries(PADROES_FUNCAO)) {
        if (!grupo.linhas.some((l) => bateComPadrao(padroes, l))) continue;
        if (nomeItem === NOME_METATARSO) {
          // Caso especial: elegibilidade vem da função, tamanho vem da
          // ficha (mesmo campo da bota comum). Sem tamanhoBota na ficha não
          // dá pra saber que par comprar — não conta.
          if (c.tamanhoBota != null) add(c.id, nomeItem, String(c.tamanhoBota), "FUNCAO");
        } else {
          add(c.id, nomeItem, null, "FUNCAO");
        }
      }
    }
  }

  const linhas = [...mapaItens.values()];

  await prisma.$transaction([prisma.epiColaboradorItem.deleteMany({}), prisma.epiColaboradorItem.createMany({ data: linhas })]);

  return NextResponse.json({
    ok: true,
    totalColaboradoresAtivos: colaboradores.length,
    totalLinhasGeradas: linhas.length,
    origemFicha: linhas.filter((l) => l.origem === "FICHA").length,
    origemFuncao: linhas.filter((l) => l.origem === "FUNCAO").length,
  });
}
