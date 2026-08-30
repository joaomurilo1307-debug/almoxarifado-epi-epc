import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@consominas.com.br";
  const password = process.env.SEED_ADMIN_PASSWORD || "AlterarSenha123";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Usuário admin já existe:", email);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { name: "Administrador", email, passwordHash } });
  console.log("Usuário admin criado:", email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
