import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CONFIRMACAO_RECRIAR, planoCatalogo, recriarCatalogo } from "@/lib/catalogoBase";

export const dynamic = "force-dynamic";

// Recriar o catálogo: GET só mostra o que vai acontecer; POST (só administrador, com a frase de confirmação) faz — sempre com cópia antes.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só administradores" }, { status: 403 });
  try {
    return NextResponse.json(await planoCatalogo(prisma));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível montar a prévia." }, { status: 500 });
  }
}

const bodySchema = z.object({ confirmacao: z.string() });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só administradores podem recriar o catálogo" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.confirmacao.trim().toUpperCase() !== CONFIRMACAO_RECRIAR) {
    return NextResponse.json({ error: `Para confirmar, digite exatamente: ${CONFIRMACAO_RECRIAR}` }, { status: 422 });
  }
  try {
    return NextResponse.json({ resultado: await recriarCatalogo(prisma) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível recriar o catálogo." }, { status: 500 });
  }
}
