import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { reconstruirItensNecessarios } from "@/lib/epiRebuild";

// A reconstrução (ficha + matriz por função -> EpiColaboradorItem) mora em lib/epiRebuild.ts pra rodar sozinha
// quando alguém cadastra/edita colaborador; esta rota continua existindo pra rodar na mão.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(await reconstruirItensNecessarios());
}
