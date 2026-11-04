import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aplicarCorrecoes, conferirEstoqueEcc } from "@/lib/conferenciaEstoque";

export const dynamic = "force-dynamic";

// Conferência do estoque do ECC com o inventário físico de 14/09/2026. GET só mostra; POST (só administrador) corrige.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  try {
    return NextResponse.json(await conferirEstoqueEcc(prisma));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível conferir o estoque." }, { status: 500 });
  }
}

const bodySchema = z.object({ acao: z.enum(["corrigir", "cadastrar", "zerarGeral"]) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só administradores podem corrigir o estoque" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ação inválida" }, { status: 422 });

  try {
    const resultado = await aplicarCorrecoes(prisma, parsed.data.acao);
    return NextResponse.json({ resultado, conferencia: await conferirEstoqueEcc(prisma) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível aplicar a correção." }, { status: 500 });
  }
}
