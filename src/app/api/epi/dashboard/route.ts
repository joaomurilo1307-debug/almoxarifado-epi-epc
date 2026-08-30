import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listaEstoqueComCalculo } from "@/lib/epi";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [contratos, colaboradoresAtivos, estoque, ultimasMovimentacoes] = await Promise.all([
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
  ]);

  const abaixoMinimo = estoque.filter((e) => e.status === "COMPRAR");
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
    totalCriticos: abaixoMinimo.length,
    criticos: abaixoMinimo
      .sort((a, b) => b.necessidade - a.necessidade)
      .slice(0, 30)
      .map((e) => ({
        produto: e.produto.nome,
        tipo: e.produto.tipo,
        categoria: e.produto.categoria,
        contrato: e.contrato?.codigo ?? "Geral",
        estoqueAtual: e.estoqueAtual,
        estoqueMinimo: e.estoqueMinimo,
        necessidade: e.necessidade,
        valorNecessidade: e.valorNecessidade,
      })),
    ultimasMovimentacoes,
  });
}
