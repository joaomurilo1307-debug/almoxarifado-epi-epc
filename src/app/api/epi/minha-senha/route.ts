import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  atual: z.string().min(1, "Informe a senha atual"),
  nova: z.string().min(8, "A nova senha precisa ter pelo menos 8 caracteres").max(100),
});

// Cada pessoa troca a PRÓPRIA senha (o administrador continua podendo redefinir a de qualquer um na tela de Usuários).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const id = (session?.user as any)?.id as string | undefined;
  if (!session || !id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const usuario = await prisma.user.findUnique({ where: { id }, select: { passwordHash: true } });
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  if (!(await bcrypt.compare(parsed.data.atual, usuario.passwordHash))) return NextResponse.json({ error: "A senha atual não confere." }, { status: 403 });
  if (parsed.data.atual === parsed.data.nova) return NextResponse.json({ error: "A nova senha precisa ser diferente da atual." }, { status: 422 });

  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(parsed.data.nova, 10) } });
  return NextResponse.json({ ok: true });
}
