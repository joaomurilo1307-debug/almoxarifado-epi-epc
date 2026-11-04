import type { PrismaClient } from "@prisma/client";

// Cópias de segurança de tabelas ANTES de qualquer mudança em massa. Ficam no esquema "bkp" (separado do "public") porque a subida
// do container roda `prisma db push --accept-data-loss`, que APAGA do esquema "public" toda tabela que não está no schema.prisma —
// uma cópia `_bkp_*` no "public" some na subida seguinte. Em "bkp" o db push não toca.
// Restaurar: INSERT INTO public."EpiProduto" SELECT * FROM bkp."<nome da cópia>";
export async function copiarTabelas(prisma: PrismaClient, prefixo: string, tabelas: string[]): Promise<string[]> {
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS bkp`);
  const nomes: string[] = [];
  for (const t of tabelas) {
    const nome = `${prefixo}_${t}`;
    await prisma.$executeRawUnsafe(`CREATE TABLE bkp."${nome}" AS TABLE public."${t}"`);
    nomes.push(`bkp.${nome}`);
  }
  return nomes;
}
