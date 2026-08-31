import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só administradores veem essa tela" }, { status: 403 });

  const usuarios = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(usuarios);
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Senha precisa ter pelo menos 8 caracteres"),
  role: z.enum(["ADMIN", "OPERADOR"]).default("OPERADOR"),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só administradores podem criar usuário" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const email = parsed.data.email.toLowerCase();
  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente) return NextResponse.json({ error: "Já existe usuário com esse e-mail" }, { status: 409 });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const usuario = await prisma.user.create({
    data: { name: parsed.data.name, email, passwordHash, role: parsed.data.role },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return NextResponse.json(usuario, { status: 201 });
}
