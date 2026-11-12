// Catálogo único de itens (base de SKUs): um código por modelo + tamanho + higienizada. Não tem contrato, estoque nem "em uso" —
// isso vem depois, em abas próprias, sempre em cima destes códigos.
//
// Código:  TIPO-CAT-NNN-TAMANHO[-H]   ex.: EPI-PES-004-40 (bota 40) · FRD-CAM-001-G-H (camisa de malha G higienizada) · GER-ESC-003-UN
// A "família" (TIPO-CAT-NNN) é o modelo; o sufixo é o tamanho (UN = item sem tamanho) e H marca a peça higienizada.
//
// A lista oficial está em src/lib/data/catalogoItens.json (gerada e conferida fora do sistema: sem código repetido, sem
// item repetido, todo item com categoria). Recriar o catálogo apaga o cadastro atual, o estoque e as movimentações, mas ANTES
// guarda uma cópia de cada tabela (esquema "bkp", ver backupBanco.ts) — nada se perde.

import type { PrismaClient } from "@prisma/client";
import catalogo from "@/lib/data/catalogoItens.json";
import { copiarTabelas } from "@/lib/backupBanco";

export type ItemCatalogo = (typeof catalogo.itens)[number];
export const ITENS_CATALOGO: ItemCatalogo[] = catalogo.itens;
export const VERSAO_CATALOGO: string = (catalogo as { versao?: string }).versao ?? catalogo.geradoEm;
export const CONFIRMACAO_RECRIAR = "RECRIAR CATALOGO";

const PREFIXO_TIPO: Record<string, string> = { EPI: "EPI", EPC: "EPC", FARDAMENTO: "FRD", GERAL: "GER" };
const ABREV_CATEGORIA: Record<string, Record<string, string>> = {
  EPI: { "CABEÇA": "CAB", "OLHOS/FACE": "OLH", "AUDIÇÃO": "AUD", "RESPIRATÓRIO": "RES", TRONCO: "TRO", "BRAÇOS": "BRA", "MÃOS": "MAO", PERNAS: "PRN", "PÉS": "PES", PELE: "PEL", ALTURA: "ALT" },
  FARDAMENTO: { CAMISA: "CAM", "CALÇA": "CAL", KIT: "KIT" },
  GERAL: { "Material de Escritório": "ESC", "Itens Veicular": "VEI", "Insumos Alojamento": "ALO", "Depósito Geral": "DEP" },
};
const SEM_CATEGORIA = "OUT";

const carimbo = () => new Date().toISOString().replace(/[-:T.Z]/g, ""); // até o milissegundo: duas execuções nunca batem no mesmo nome
const chaveItem = (nome: string, tamanho: string | null, higienizado: boolean) => `${nome}|${tamanho ?? ""}|${higienizado ? 1 : 0}`;

/** Confere a lista oficial antes de gravar qualquer coisa. Devolve a lista de problemas (vazia = tudo certo). */
export function validarCatalogo(itens: ItemCatalogo[] = ITENS_CATALOGO): string[] {
  const erros: string[] = [];
  const codigos = new Set<string>(), chaves = new Set<string>();
  for (const i of itens) {
    if (!i.codigo) erros.push(`item sem código: ${i.nome}`);
    else if (codigos.has(i.codigo)) erros.push(`código repetido: ${i.codigo}`);
    codigos.add(i.codigo);
    const k = chaveItem(i.nome, i.tamanho, i.higienizado);
    if (chaves.has(k)) erros.push(`item repetido: ${i.nome} ${i.tamanho ?? ""}${i.higienizado ? " (higienizada)" : ""}`);
    chaves.add(k);
    if (!i.categoria) erros.push(`sem categoria: ${i.codigo}`);
    if (!["EPI", "EPC", "FARDAMENTO", "GERAL"].includes(i.tipo)) erros.push(`tipo inválido: ${i.codigo}`);
    if (!i.codigo.startsWith(`${PREFIXO_TIPO[i.tipo]}-`)) erros.push(`código não combina com o tipo: ${i.codigo}`);
  }
  return erros;
}

export function resumoDoCatalogo(itens: ItemCatalogo[] = ITENS_CATALOGO) {
  const porTipo: Record<string, number> = {};
  for (const i of itens) porTipo[i.tipo] = (porTipo[i.tipo] ?? 0) + 1;
  return { itens: itens.length, familias: new Set(itens.map((i) => i.familia)).size, porTipo };
}

// nome sem o " - CA12345" do final (o catálogo novo não usa CA no nome)
const semCA = (nome: string) => nome.replace(/\s*-\s*CA\s*\d+\s*$/i, "").trim();

type Herdavel = { valorUnitario: number | null; fotoUrl: string | null; percentualContingencia: number | null; fabricante: string | null };

/** Preço, foto, % de contingência e fabricante que o mesmo item (mesmo nome) já tinha no cadastro atual — para não se perder ao recriar. */
async function herancaPorNome(prisma: PrismaClient) {
  const antigos = await prisma.epiProduto.findMany({ select: { nome: true, valorUnitario: true, fotoUrl: true, percentualContingencia: true, fabricante: true }, orderBy: { id: "asc" } });
  const porNome = new Map<string, typeof antigos>();
  for (const p of antigos) {
    const l = porNome.get(semCA(p.nome)) ?? [];
    l.push(p);
    porNome.set(semCA(p.nome), l);
  }
  const maisComum = <T,>(vals: (T | null)[]): T | null => {
    const cont = new Map<T, number>();
    for (const v of vals) if (v !== null && v !== undefined && v !== ("" as any)) cont.set(v, (cont.get(v) ?? 0) + 1);
    let melhor: T | null = null, n = 0;
    for (const [v, c] of cont) if (c > n) { melhor = v; n = c; }
    return melhor;
  };
  const mapa = new Map<string, Herdavel & { linhas?: number }>();
  for (const [nome, l] of porNome) {
    mapa.set(nome, {
      linhas: l.length,
      valorUnitario: maisComum(l.map((p) => p.valorUnitario)),
      fotoUrl: maisComum(l.map((p) => p.fotoUrl)),
      percentualContingencia: maisComum(l.map((p) => p.percentualContingencia)),
      fabricante: maisComum(l.map((p) => p.fabricante)),
    });
  }
  return mapa;
}

// Herança do mesmo nome; se não houver, do modelo antigo mais numeroso cujo nome começa com o nome novo (o catálogo unificou marcas/modelos).
function acharHeranca(heranca: Map<string, Herdavel & { linhas?: number }>, nome: string): Herdavel | undefined {
  const exato = heranca.get(nome);
  if (exato) return exato;
  let melhor: (Herdavel & { linhas?: number }) | undefined;
  for (const [k, v] of heranca) if (k.startsWith(nome + " ") && (!melhor || (v.linhas ?? 0) > (melhor.linhas ?? 0))) melhor = v;
  return melhor;
}

export async function planoCatalogo(prisma: PrismaClient) {
  const [produtos, estoques, movimentacoes, colaboradorItens, heranca] = await Promise.all([
    prisma.epiProduto.count(), prisma.epiEstoque.count(), prisma.epiMovimentacao.count(), prisma.epiColaboradorItem.count(), herancaPorNome(prisma),
  ]);
  const novos = ITENS_CATALOGO;
  const comValor = novos.filter((i) => acharHeranca(heranca, semCA(i.nome))?.valorUnitario != null).length;
  const comFoto = novos.filter((i) => acharHeranca(heranca, semCA(i.nome))?.fotoUrl).length;
  return {
    problemas: validarCatalogo(),
    atual: { produtos, estoques, movimentacoes, colaboradorItens },
    novo: resumoDoCatalogo(novos),
    aproveitados: { valorUnitario: comValor, foto: comFoto },
    confirmacao: CONFIRMACAO_RECRIAR,
  };
}

export async function recriarCatalogo(prisma: PrismaClient) {
  const problemas = validarCatalogo();
  if (problemas.length) throw new Error(`A lista oficial do catálogo tem problema e nada foi gravado: ${problemas.slice(0, 5).join("; ")}`);

  const selo = carimbo();
  const backups = await copiarTabelas(prisma, `cat_${selo}`, ["EpiProduto", "EpiEstoque", "EpiMovimentacao"]);

  const heranca = await herancaPorNome(prisma);
  let comValor = 0, comFoto = 0;
  const dados = ITENS_CATALOGO.map((i) => {
    const h = acharHeranca(heranca, semCA(i.nome));
    if (h?.valorUnitario != null) comValor++;
    if (h?.fotoUrl) comFoto++;
    return {
      nome: i.nome, tipo: i.tipo as "EPI" | "EPC" | "FARDAMENTO" | "GERAL", categoria: i.categoria, ca: i.ca, fabricante: i.fabricante ?? h?.fabricante ?? null,
      tamanho: i.tamanho, higienizado: i.higienizado, unidade: i.unidade, descricao: i.descricao, codigo: i.codigo, ativo: true,
      valorUnitario: h?.valorUnitario ?? null, fotoUrl: h?.fotoUrl ?? null, percentualContingencia: h?.percentualContingencia ?? null,
      skuCns: i.skuCns ?? null,
    };
  });

  const apagados = await prisma.$transaction(async (tx) => {
    const mov = await tx.epiMovimentacao.deleteMany();
    const est = await tx.epiEstoque.deleteMany();
    const prod = await tx.epiProduto.deleteMany();
    await tx.epiProduto.createMany({ data: dados });
    return { movimentacoes: mov.count, estoques: est.count, produtos: prod.count };
  }, { timeout: 60_000 });

  const [total, codigosDistintos] = await Promise.all([prisma.epiProduto.count(), prisma.epiProduto.findMany({ select: { codigo: true }, distinct: ["codigo"] })]);
  if (total !== ITENS_CATALOGO.length || codigosDistintos.length !== ITENS_CATALOGO.length) {
    throw new Error(`Depois de gravar, o catálogo ficou com ${total} itens e ${codigosDistintos.length} códigos (esperado ${ITENS_CATALOGO.length}). Há cópia em ${backups.join(", ")}.`);
  }
  return { carregados: total, apagados, aproveitados: { valorUnitario: comValor, foto: comFoto }, backups };
}

/** Código de um item NOVO cadastrado depois: reaproveita a família se já existe o mesmo nome; senão abre a próxima família da categoria. */
export async function codigoNovoProduto(
  prisma: PrismaClient,
  p: { nome: string; tipo: string; categoria?: string | null; tamanho?: string | null; higienizado?: boolean },
): Promise<string> {
  const tipo = PREFIXO_TIPO[p.tipo] ?? p.tipo.slice(0, 3).toUpperCase();
  const reFamilia = /^([A-Z]{3}-[A-Z]{3}-\d{3})/;
  const mesmoNome = await prisma.epiProduto.findFirst({ where: { nome: p.nome, tipo: p.tipo as any, codigo: { not: null } }, select: { codigo: true } });
  let familia = mesmoNome?.codigo ? reFamilia.exec(mesmoNome.codigo)?.[1] : undefined;
  if (!familia) {
    const abrev = (p.categoria && ABREV_CATEGORIA[p.tipo]?.[p.categoria]) || SEM_CATEGORIA;
    const prefixo = `${tipo}-${abrev}-`;
    const existentes = await prisma.epiProduto.findMany({ where: { codigo: { startsWith: prefixo } }, select: { codigo: true } });
    let maior = 0;
    for (const e of existentes) {
      const m = new RegExp(`^${prefixo}(\\d{3})`).exec(e.codigo ?? "");
      if (m) maior = Math.max(maior, Number(m[1]));
    }
    familia = `${prefixo}${String(maior + 1).padStart(3, "0")}`;
  }
  const tam = (p.tamanho ?? "").trim().toUpperCase().replace(/\s+/g, "") || "UN";
  return `${familia}-${tam}${p.higienizado ? "-H" : ""}`;
}
