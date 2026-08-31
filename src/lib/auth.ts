import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

const loginAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil: number | null }>();

function isLocked(email: string): boolean {
  const entry = loginAttempts.get(email);
  if (!entry) return false;
  const now = Date.now();
  if (entry.lockedUntil) {
    if (now < entry.lockedUntil) return true;
    loginAttempts.delete(email);
    return false;
  }
  if (now - entry.firstAttempt > WINDOW_MS) {
    loginAttempts.delete(email);
    return false;
  }
  return false;
}

function recordFailure(email: string) {
  const now = Date.now();
  const entry = loginAttempts.get(email);
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    loginAttempts.set(email, { count: 1, firstAttempt: now, lockedUntil: null });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCK_MS;
}

function recordSuccess(email: string) {
  loginAttempts.delete(email);
}

export const authOptions: AuthOptions = {
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.toLowerCase();

        if (isLocked(email)) {
          throw new Error("Muitas tentativas de login. Tente novamente em alguns minutos.");
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          recordFailure(email);
          return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          recordFailure(email);
          return null;
        }

        recordSuccess(email);
        return { id: user.id, name: user.name, email: user.email, role: user.role } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
      } else if (token.id) {
        // Sessão já aberta (sem `user`, só refresh do token) — busca o role
        // de novo no banco. Sem isso, quem já tava logado quando o campo
        // `role` foi criado ficaria preso num token antigo sem role até
        // deslogar e logar de novo; assim como se alguém mudar o role de um
        // usuário logado (na tela de Usuários), pega o valor novo na
        // próxima requisição, sem precisar relogar.
        const atual = await prisma.user.findUnique({ where: { id: token.id as string }, select: { role: true } });
        if (atual) token.role = atual.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
};

// Helper pras rotas de API que só o ADMIN pode usar (cadastro de usuários).
// Sessão sem role (token antigo, de antes desse campo existir) é tratada
// como não-admin — força relogar em vez de assumir acesso.
// any de propósito — o tipo de Session do next-auth não tem `role` (não foi
// declarado um next-auth.d.ts pra isso), então o resto do código já lida com
// user.role via cast (ver jwt/session acima). Mesma convenção aqui.
export function isAdmin(session: any): boolean {
  return session?.user?.role === "ADMIN";
}
