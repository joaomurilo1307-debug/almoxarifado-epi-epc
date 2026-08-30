import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Endpoint administrativo pontual — mesma lógica de scripts/fix-ca-colete.ts,
// só que acionável via HTTP autenticado (o console web da Hostinger ficou
// inacessível pra automação neste ambiente: os links "Terminal" do painel
// abrem em popup e o bloqueador de popup do Chrome engole o clique
// simulado). Idempotente: rodar de novo não faz nada se já corrigido.
//
// Ver scripts/fix-ca-colete.ts pro contexto completo (CA 28449 duplicado
// entre "Colete salva-vidas" e "Capa de chuva (Brascamp)" no documento de
// origem — conferido em consultaca.com/28449 que o CA é da capa de chuva).
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const colete = await prisma.epiProduto.findFirst({
    where: { nome: { contains: "Colete salva", mode: "insensitive" }, ca: "28449" },
  });

  if (!colete) {
    return NextResponse.json({ ok: true, alterado: false, motivo: "Nada encontrado com esse nome+CA — já corrigido antes, ou nome mudou." });
  }

  const atualizado = await prisma.epiProduto.update({
    where: { id: colete.id },
    data: { ca: null, nome: "Colete salva-vidas (Homolog. Marinha nº 062/2012)" },
  });

  return NextResponse.json({ ok: true, alterado: true, produto: atualizado });
}
