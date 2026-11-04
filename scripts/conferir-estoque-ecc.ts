// Roda na subida do container (depois da unificação de duplicados): confere o estoque do ECC com o inventário de 14/09/2026,
// imprime o relatório nos logs ([conferir-ecc]) e, UMA ÚNICA VEZ, corrige o estoque inicial dos itens que casam exatamente
// (cópia _bkp_conf_* antes; nenhuma movimentação é tocada). Depois que existe uma cópia _bkp_conf_*, nunca mais corrige sozinho
// (quem mexer no estoque depois não é desfeito) — a tela "Conferência ECC" continua mostrando e corrigindo sob demanda.
// CONFERIR_ESTOQUE_MODO=analisar só relata.

import { PrismaClient } from "@prisma/client";
import { aplicarCorrecoes, conferirEstoqueEcc } from "../src/lib/conferenciaEstoque";

async function main() {
  const prisma = new PrismaClient();
  try {
    const conf = await conferirEstoqueEcc(prisma);
    const r = conf.resumo;
    console.log(`[conferir-ecc] inventário ${conf.dataInventario}: ${r.itensInventario} itens / ${r.unidadesInventario} un. | sistema ECC hoje: ${r.unidadesSistemaHoje} un.`);
    console.log(`[conferir-ecc] confere ${r.iguais} | diferente ${r.diferentes} (${r.unidadesACorrigir} un.) | conflito ${r.conflitos} | sem cadastro ${r.semCadastro} | provável ${r.provaveis} | só no sistema ${r.soSistema}`);
    console.log(`[conferir-ecc] GERAL = cópia da lista do ECC (aba "Estoque do ECC" de 29/08): ${r.geralDuplicadoItens} item(ns), ${r.geralDuplicadoUnidades} un. — NÃO alterado sozinho; a tela Conferência ECC tem o botão para zerar.`);
    console.log(`[conferir-ecc] itens com o mesmo valor no depósito Geral: ${r.itensComGeralIgualAoInventario} (Geral soma ${r.unidadesGeralMesmosItens} un. nos itens que casam)`);
    for (const l of conf.linhas) {
      if (l.status === "IGUAL") continue;
      const s = l.sistema;
      console.log(
        `[conferir-ecc] ${l.status.padEnd(12)} "${l.inventario.nomes[0]}" inv ${l.inventario.atual} | sistema ${s ? `"${s.nome}"${s.tamanho ? ` t${s.tamanho}` : ""} na data ${s.atualNaData} (inicial ${s.inicial}, depois ${s.depoisDaData})` : l.candidato ? `provável "${l.candidato.nome}"` : "—"} | geral ${l.geralMesmoItem}${l.nota ? ` | ${l.nota}` : ""}`
      );
    }
    for (const x of conf.soSistema) console.log(`[conferir-ecc] SO_SISTEMA "${x.nome}"${x.tamanho ? ` t${x.tamanho}` : ""}${x.higienizado ? " H" : ""}: ${x.atualHoje}`);

    if (process.env.CONFERIR_ESTOQUE_MODO === "analisar") return console.log("[conferir-ecc] modo ANALISAR: nada foi gravado.");
    const jaCorrigido = (await prisma.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE schemaname = 'bkp' AND tablename LIKE 'conf\\_%\\_EpiEstoque'`)).length > 0;
    if (jaCorrigido) return console.log("[conferir-ecc] já existe cópia bkp.conf_*: correção automática já foi feita antes — nada gravado agora.");
    if (r.diferentes === 0) return console.log("[conferir-ecc] nada a corrigir.");
    const res = await aplicarCorrecoes(prisma, "corrigir");
    console.log(`[conferir-ecc] CORRIGIDO ${res.alterados} item(ns). Cópia de segurança: ${res.backup}`);
    for (const i of res.itens) console.log(`[conferir-ecc]   ${i}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[conferir-ecc] ERRO:", e);
  process.exitCode = 1;
});
