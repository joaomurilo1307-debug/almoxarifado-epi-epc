import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { codigoNovoProduto } from "@/lib/catalogoBase";

// Dá código (padrão do catálogo: TIPO-CAT-NNN-TAMANHO[-H]) aos itens que ainda não têm. Item que já tem código não é tocado.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const semCodigo = await prisma.epiProduto.findMany({ where: { ativo: true, codigo: null }, orderBy: [{ nome: "asc" }, { tamanho: "asc" }] });
  const gerados: { id: string; codigo: string }[] = [];
  for (const p of semCodigo) {
    const codigo = await codigoNovoProduto(prisma, p);
    await prisma.epiProduto.update({ where: { id: p.id }, data: { codigo } });
    gerados.push({ id: p.id, codigo });
  }
  return NextResponse.json({ ok: true, semCodigo: semCodigo.length, gerados: gerados.length, exemplos: gerados.slice(0, 5) });
}
