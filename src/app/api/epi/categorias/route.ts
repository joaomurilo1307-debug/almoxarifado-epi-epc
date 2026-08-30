import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Categorias conhecidas do sistema — os 3 tipos "puros" (EPI/EPC/FARDAMENTO,
// quando o produto não tem uma categoria mais específica) e as 4 categorias
// reais de item geral. Mostra sempre as 7, mesmo antes de qualquer uma ter
// sido customizada (usa 10% de padrão, igual ao resto do sistema).
const CATEGORIAS_CONHECIDAS = [
  "EPI",
  "EPC",
  "FARDAMENTO",
  "Material de Escritório",
  "Itens Veicular",
  "Insumos Alojamento",
  "Depósito Geral",
];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const configs = await prisma.epiCategoriaConfig.findMany();
  const configMap = new Map(configs.map((c) => [c.categoria, c.percentualContingencia]));

  const resultado = CATEGORIAS_CONHECIDAS.map((categoria) => ({
    categoria,
    percentualContingencia: configMap.get(categoria) ?? 0.1,
  }));
  return NextResponse.json(resultado);
}
