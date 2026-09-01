import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Abreviação de 3 letras por categoria — EPI usa a parte do corpo (mesma
// classificação da aba Catálogo), GERAL usa a prateleira. EPC e FARDAMENTO
// não têm subcategoria hoje, então o código deles não leva esse trecho.
const ABREV_CATEGORIA_EPI: Record<string, string> = {
  "CABEÇA": "CAB",
  "OLHOS/FACE": "OLH",
  "AUDIÇÃO": "AUD",
  "RESPIRATÓRIO": "RES",
  "TRONCO": "TRO",
  "BRAÇOS": "BRA",
  "MÃOS": "MAO",
  "PERNAS": "PER",
  "PÉS": "PES",
};
const ABREV_CATEGORIA_GERAL: Record<string, string> = {
  "Material de Escritório": "ESC",
  "Itens Veicular": "VEI",
  "Insumos Alojamento": "ALJ",
  "Depósito Geral": "DEP",
};
const ABREV_PADRAO = "OUT";

// Gera (uma vez) o código interno sequencial de cada item do catálogo —
// pedido pelo João (31/08/2026): "EPI-{categoria}-{sequencial}", ex.
// "EPI-PES-001" pra bota. O código identifica o TIPO do item (nome+tipo),
// não a linha — todos os tamanhos da mesma "BOTA DE SEGURANÇA MARLUVAS"
// compartilham o mesmo código, igual já agrupa a tela de Catálogo.
// Idempotente: item que já tem código não é reprocessado, então rodar de
// novo só cobre item novo, sem embaralhar os códigos já em uso.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const produtos = await prisma.epiProduto.findMany({
    where: { ativo: true },
    orderBy: [{ nome: "asc" }],
  });

  // Agrupa por nome+tipo (mesma chave usada na tela de Catálogo) — cada
  // grupo vira 1 código só, aplicado a todas as linhas (tamanhos) dele.
  const grupos = new Map<string, typeof produtos>();
  for (const p of produtos) {
    const chave = `${p.nome}__${p.tipo}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(p);
  }

  // Só gera código pra grupo que ainda não tem nenhum — preserva os que já
  // foram gerados numa rodada anterior (idempotência).
  const gruposPendentes = [...grupos.values()].filter((itens) => itens.every((p) => !p.codigo));

  // Sequencial por abreviação — continua de onde os códigos já existentes
  // pararam, pra nunca colidir mesmo rodando em cima de uma base parcial.
  const proximoNumero = new Map<string, number>();
  for (const p of produtos) {
    if (!p.codigo) continue;
    const m = p.codigo.match(/-(\d+)$/);
    if (!m) continue;
    const abrevChave = p.codigo.replace(/-\d+$/, "");
    const num = parseInt(m[1], 10);
    proximoNumero.set(abrevChave, Math.max(proximoNumero.get(abrevChave) ?? 0, num) + 1);
  }

  function abrevDe(p: (typeof produtos)[number]): string {
    if (p.tipo === "EPI") return ABREV_CATEGORIA_EPI[p.categoria ?? ""] ?? ABREV_PADRAO;
    if (p.tipo === "GERAL") return ABREV_CATEGORIA_GERAL[p.categoria ?? ""] ?? ABREV_PADRAO;
    return ""; // EPC e FARDAMENTO não têm subcategoria — código fica só TIPO-seq
  }

  const atualizacoes: { ids: string[]; codigo: string }[] = [];
  for (const itens of gruposPendentes) {
    const primeiro = itens[0];
    const abrev = abrevDe(primeiro);
    const prefixo = abrev ? `${primeiro.tipo}-${abrev}` : primeiro.tipo;
    const numero = proximoNumero.get(prefixo) ?? 1;
    proximoNumero.set(prefixo, numero + 1);
    const codigo = `${prefixo}-${String(numero).padStart(3, "0")}`;
    atualizacoes.push({ ids: itens.map((p) => p.id), codigo });
  }

  await prisma.$transaction(
    atualizacoes.map((a) => prisma.epiProduto.updateMany({ where: { id: { in: a.ids } }, data: { codigo: a.codigo } }))
  );

  return NextResponse.json({
    ok: true,
    totalProdutos: produtos.length,
    totalGrupos: grupos.size,
    gruposNovos: gruposPendentes.length,
    exemplos: atualizacoes.slice(0, 5),
  });
}
