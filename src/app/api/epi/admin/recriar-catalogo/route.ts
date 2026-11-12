import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planoCatalogo, recriarCatalogo, CONFIRMACAO_RECRIAR } from "@/lib/catalogoBase";

// GET: mostra o que vai mudar (sem gravar nada) se o catálogo for recriado a partir de src/lib/data/catalogoItens.json.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const plano = await planoCatalogo(prisma);
  return NextResponse.json(plano);
}

// POST: recria de verdade (apaga EpiProduto/EpiEstoque/EpiMovimentacao e grava a lista oficial), com backup
// automático antes. Exige { "confirmacao": "RECRIAR CATALOGO" } no corpo pra evitar execução por engano.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body?.confirmacao !== CONFIRMACAO_RECRIAR) {
    return NextResponse.json({ error: `Envie { "confirmacao": "${CONFIRMACAO_RECRIAR}" } no corpo pra confirmar.` }, { status: 422 });
  }

  try {
    const resultado = await recriarCatalogo(prisma);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao recriar o catálogo." }, { status: 500 });
  }
}
