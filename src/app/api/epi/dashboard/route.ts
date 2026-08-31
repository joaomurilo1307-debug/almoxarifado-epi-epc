import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listaEstoqueComCalculo } from "@/lib/epi";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [contratos, colaboradoresAtivos, estoque, ultimasMovimentacoes, saidaPorProduto, saidaPorContrato] = await Promise.all([
    prisma.epiContrato.findMany({ orderBy: { codigo: "asc" } }),
    prisma.epiColaborador.count({ where: { situacao: "ATIVO" } }),
    listaEstoqueComCalculo(),
    prisma.epiMovimentacao.findMany({
      orderBy: { data: "desc" },
      take: 8,
      include: {
        produto: { select: { nome: true, unidade: true } },
        contrato: { select: { codigo: true } },
        colaborador: { select: { nomeCompleto: true } },
      },
    }),
    // Itens mais usados — soma de tudo que já saiu de cada produto, do
    // histórico real de movimentação (não é estimativa).
    prisma.epiMovimentacao.groupBy({
      by: ["produtoId"],
      where: { tipo: "SAIDA" },
      _sum: { quantidade: true },
      orderBy: { _sum: { quantidade: "desc" } },
      take: 10,
    }),
    // Onde consome mais — mesma soma, agrupada por contrato em vez de produto.
    prisma.epiMovimentacao.groupBy({
      by: ["contratoId"],
      where: { tipo: "SAIDA" },
      _sum: { quantidade: true },
      orderBy: { _sum: { quantidade: "desc" } },
    }),
  ]);

  const produtoIdsUsados = saidaPorProduto.map((s) => s.produtoId);
  const produtosUsados = produtoIdsUsados.length
    ? await prisma.epiProduto.findMany({ where: { id: { in: produtoIdsUsados } }, select: { id: true, nome: true } })
    : [];
  const produtoNomeMap = new Map(produtosUsados.map((p) => [p.id, p.nome]));
  const maisUsados = saidaPorProduto
    .map((s) => ({ produto: produtoNomeMap.get(s.produtoId) ?? "?", quantidade: s._sum.quantidade ?? 0 }))
    .filter((m) => m.quantidade > 0);

  const contratoNomeMap = new Map(contratos.map((c) => [c.id, c.codigo]));
  const consumoPorContrato = saidaPorContrato
    .map((s) => ({ contrato: s.contratoId ? contratoNomeMap.get(s.contratoId) ?? "?" : "Geral", quantidade: s._sum.quantidade ?? 0 }))
    .filter((c) => c.quantidade > 0)
    .sort((a, b) => b.quantidade - a.quantidade);

  const abaixoMinimo = estoque.filter((e) => e.status === "COMPRAR");
  const emAtencao = estoque.filter((e) => e.status === "ATENCAO");
  const necessidadeTotal = estoque.reduce((acc, e) => acc + e.necessidade, 0);
  const valorEmEstoqueTotal = estoque.reduce((acc, e) => acc + (e.valorEmEstoque ?? 0), 0);
  const valorNecessidadeTotal = estoque.reduce((acc, e) => acc + (e.valorNecessidade ?? 0), 0);
  const itensComCusto = estoque.filter((e) => e.valorUnitario !== null).length;

  const porContrato = contratos.map((c) => {
    const itensContrato = estoque.filter((e) => e.contrato?.id === c.id);
    return {
      contrato: c,
      totalItens: itensContrato.length,
      abaixoMinimo: itensContrato.filter((e) => e.status === "COMPRAR").length,
    };
  });
  const itensGeral = estoque.filter((e) => !e.contrato);
  if (itensGeral.length > 0) {
    porContrato.push({
      contrato: { id: "geral", codigo: "Geral", nome: "Depósito central / ECC", ativo: true, percentualContingencia: 0, createdAt: new Date() },
      totalItens: itensGeral.length,
      abaixoMinimo: itensGeral.filter((e) => e.status === "COMPRAR").length,
    });
  }

  // Quebra por categoria de verdade: dentro de "Geral" (escritório, veicular,
  // alojamento, depósito) cada categoria vira sua própria linha, em vez de
  // ficar tudo escondido atrás de um "Geral" só. EPI/EPC/Fardamento continuam
  // como estavam (não têm sub-categoria hoje).
  const porCategoriaMap = new Map<string, { tipo: string; categoria: string | null; total: number; abaixoMinimo: number }>();
  for (const e of estoque) {
    const tipo = e.produto.tipo;
    const categoria = tipo === "GERAL" ? e.produto.categoria : null;
    const chave = categoria ?? tipo;
    if (!porCategoriaMap.has(chave)) porCategoriaMap.set(chave, { tipo, categoria, total: 0, abaixoMinimo: 0 });
    const bucket = porCategoriaMap.get(chave)!;
    bucket.total++;
    if (e.status === "COMPRAR") bucket.abaixoMinimo++;
  }
  const ORDEM_TIPO = ["EPI", "EPC", "FARDAMENTO", "GERAL"];
  const porCategoria = [...porCategoriaMap.values()].sort((a, b) => {
    const ordemA = ORDEM_TIPO.indexOf(a.tipo);
    const ordemB = ORDEM_TIPO.indexOf(b.tipo);
    if (ordemA !== ordemB) return ordemA - ordemB;
    return (a.categoria ?? "").localeCompare(b.categoria ?? "");
  });

  return NextResponse.json({
    totalContratos: contratos.length,
    colaboradoresAtivos,
    totalItensMonitorados: estoque.length,
    itensAbaixoMinimo: abaixoMinimo.length,
    necessidadeTotalCompra: necessidadeTotal,
    valorEmEstoqueTotal,
    valorNecessidadeTotal,
    itensComCusto,
    porContrato,
    porCategoria,
    maisUsados,
    consumoPorContrato,
    totalCriticos: abaixoMinimo.length,
    criticos: abaixoMinimo
      .sort((a, b) => b.necessidade - a.necessidade)
      .slice(0, 30)
      .map((e) => ({
        produto: e.produto.nome,
        tipo: e.produto.tipo,
        // Mesma regra do porCategoria acima: categoria só identifica a
        // prateleira dentro de "Geral" (Material de Escritório etc.) — pra
        // EPI agora existe uma categoria por parte do corpo (CABEÇA, MÃOS...,
        // usada no Catálogo), mas aqui ela mostraria ícone/rótulo errado
        // (a coluna espera tipo, não subcategoria de EPI).
        categoria: e.produto.tipo === "GERAL" ? e.produto.categoria : null,
        contrato: e.contrato?.codigo ?? "Geral",
        estoqueAtual: e.estoqueAtual,
        estoqueMinimo: e.estoqueMinimo,
        minimoSugerido: e.minimoSugerido,
        necessidade: e.necessidade,
        valorNecessidade: e.valorNecessidade,
      })),
    totalEmAtencao: emAtencao.length,
    emAtencao: emAtencao
      .sort((a, b) => a.estoqueAtual - a.estoqueMinimo - (b.estoqueAtual - b.estoqueMinimo))
      .slice(0, 15)
      .map((e) => ({
        produto: e.produto.nome,
        contrato: e.contrato?.codigo ?? "Geral",
        estoqueAtual: e.estoqueAtual,
        estoqueMinimo: e.estoqueMinimo,
      })),
    ultimasMovimentacoes,
  });
}
