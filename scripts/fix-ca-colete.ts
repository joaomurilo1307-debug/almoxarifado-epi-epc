// Correção pontual (30/08/2026, pedido do João: "revise os documentos todos
// pra entender o que é o CA").
//
// O documento de origem (EPI.xlsx11.xlsx / EPI.xlsx, aba "EPI - OP 3", linhas
// 30-31) lista:
//   Capa de chuva (Brascamp)      | CA 28449
//   Colete salva-vidas (Ativa)    | CA 28449   <- mesmo CA, item diferente
//
// Um C.A. (Certificado de Aprovação do Ministério do Trabalho) certifica UM
// modelo de UM fabricante — não pode ser da capa de chuva E do colete ao
// mesmo tempo. Conferi o registro oficial em consultaca.com/28449: é
// realmente da Brascamp, categoria "vestimenta para proteção do tronco"
// (capa de chuva) — bate exatamente com a descrição da capa no documento.
//
// O colete salva-vidas nem é EPI sob o sistema de CA do Ministério do
// Trabalho: colete de navegação usa homologação da Marinha do Brasil, e o
// próprio documento já registra esse número na descrição ("Homologado pela
// Marinha do Brasil. Nº 062/2012"). Ou seja, o "CA 28449" no colete foi um
// erro de copiar/colar da linha de cima, no documento original — não uma
// dúvida de qual dos dois é o "certo": os dois números já eram conhecidos,
// só estavam trocados.
//
// Fix: tira o CA errado do colete (fica sem C.A., que é o correto pra esse
// tipo de item) e deixa registrado no nome que a homologação dele é outra,
// pra não parecer que o campo ficou vazio por descuido. Não mexe na capa de
// chuva — o CA dela já estava certo.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const colete = await prisma.epiProduto.findFirst({
    where: { nome: { contains: "Colete salva", mode: "insensitive" }, ca: "28449" },
  });

  if (!colete) {
    console.log("Nada encontrado com esse nome+CA — já foi corrigido antes, ou o nome mudou. Nenhuma alteração feita.");
    return;
  }

  console.log("Encontrado:", colete.id, colete.nome, "CA atual:", colete.ca);

  const atualizado = await prisma.epiProduto.update({
    where: { id: colete.id },
    data: {
      ca: null,
      nome: "Colete salva-vidas (Homolog. Marinha nº 062/2012)",
    },
  });

  console.log("Corrigido:", atualizado.id, "->", atualizado.nome, "| CA:", atualizado.ca ?? "(nenhum)");

  // Confere que a capa de chuva continua com o CA dela, intocada.
  const capa = await prisma.epiProduto.findFirst({ where: { nome: { contains: "Capa de chuva", mode: "insensitive" } } });
  console.log("Capa de chuva (não tocada):", capa?.nome, "| CA:", capa?.ca ?? "(nenhum)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
