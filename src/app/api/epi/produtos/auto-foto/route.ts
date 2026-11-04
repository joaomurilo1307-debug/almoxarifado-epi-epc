import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { preencherFotos } from "@/lib/fotosReferencia";

// Preenche a foto de referência (book de EPI da empresa) de quem ainda não tem. As regras de casamento por palavra-chave estão em
// src/lib/fotosReferencia.ts. Nunca sobrescreve uma foto que o usuário já tenha definido.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(await preencherFotos(prisma));
}
