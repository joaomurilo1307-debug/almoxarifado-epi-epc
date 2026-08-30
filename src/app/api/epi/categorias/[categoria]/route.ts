import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  percentualContingencia: z.number().min(0).max(1),
});

export async function PATCH(req: Request, { params }: { params: { categoria: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  // Next já decodifica o segmento dinâmico da URL (ex.: "Material%20de...").
  const categoria = params.categoria;
  const config = await prisma.epiCategoriaConfig.upsert({
    where: { categoria },
    update: { percentualContingencia: parsed.data.percentualContingencia },
    create: { categoria, percentualContingencia: parsed.data.percentualContingencia },
  });
  return NextResponse.json(config);
}
