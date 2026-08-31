import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "OPERADOR"]).optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só administradores podem editar usuário" }, { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  // Não deixa o admin se rebaixar sozinho e ficar todo mundo sem admin.
  if (parsed.data.role === "OPERADOR" && (session.user as any).id === params.id) {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) return NextResponse.json({ error: "Precisa ter pelo menos 1 administrador — crie outro admin antes de tirar o seu." }, { status: 400 });
  }

  const { password, ...resto } = parsed.data;
  const usuario = await prisma.user.update({
    where: { id: params.id },
    data: { ...resto, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return NextResponse.json(usuario);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só administradores podem excluir usuário" }, { status: 403 });

  if ((session.user as any).id === params.id) {
    return NextResponse.json({ error: "Não dá pra excluir o próprio usuário logado." }, { status: 400 });
  }

  const alvo = await prisma.user.findUnique({ where: { id: params.id } });
  if (alvo?.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) return NextResponse.json({ error: "Precisa ter pelo menos 1 administrador." }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
