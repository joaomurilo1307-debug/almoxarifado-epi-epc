// Unifica cadastros do MESMO item que ficaram separados por causa do jeito de escrever o nome (João, 04/11/2026:
// "camisa de malha, mesmo tamanho, higienizada ou não, não tá junto — analisa a base e unifica").
//
// Por que importa: o estoque atual é a base do pedido de compra. Estoque que fica num cadastro ("CAMISA DE MALHA GG
// (HIGIENIZADA)") não entra na conta do cadastro certo ("CAMISA DE MALHA", tamanho GG), então o sistema pede compra
// de peça que já existe.
//
// Regra (conservadora): cada produto é reduzido a  nome-base + tamanho + higienizada?  tirando do nome "(HIGIENIZADA)",
// "TAMANHO" e o tamanho escrito no fim ("... GG"). Produtos que caem na mesma chave são o mesmo item e viram um só.
// Só mexe em nome com tamanho no fim quando JÁ EXISTE a família (um produto com aquele nome-base e tamanho preenchido) —
// sem família, só relata. Nunca junta cor, CA ou modelo diferentes: a chave é só nome-base + tamanho + higienizada.
//
// Junta o estoque (inicial somado por contrato; mínimo antigo = o maior) e leva as movimentações. Antes de gravar, copia
// as 3 tabelas para _bkp_unif_AAAAMMDD_HHMM_* (volta atrás com INSERT ... SELECT dessas cópias).
// UNIFICAR_MODO=analisar só relata; qualquer outro valor (padrão) aplica. Idempotente: sem duplicidade, não faz nada.

import { PrismaClient } from "@prisma/client";

type Prod = {
  id: string; nome: string; tipo: string; categoria: string | null; ca: string | null; fabricante: string | null;
  tamanho: string | null; higienizado: boolean; unidade: string; valorUnitario: number | null;
  percentualContingencia: number | null; fotoUrl: string | null; descricao: string | null; codigo: string | null; ativo: boolean;
};

const RE_HIG = /\(?\s*HIGIENIZAD[AO]S?\s*\)?/g;
const RE_TAM_FIM = /^(.*?)\s+(?:TAMANHO\s+)?(PP|P|M|G|GG|XG|XGG|EG|EGG|EXG|EXGG)$/;
const RE_TAM_PALAVRA = /^(.*?)\s+TAMANHO\s+([A-Z0-9]{1,5})$/;

export function normalizar(p: Pick<Prod, "nome" | "tamanho" | "higienizado">): { base: string; tamanho: string | null; higienizado: boolean; nomeTinhaTamanho: boolean } {
  let nome = p.nome.toUpperCase().replace(/\s+/g, " ").trim();
  const higienizado = p.higienizado || /HIGIENIZAD/.test(nome) || /HIGIENIZAD/.test((p.tamanho ?? "").toUpperCase());
  nome = nome.replace(RE_HIG, " ").replace(/\s+/g, " ").trim();
  let tamanho: string | null = p.tamanho ? p.tamanho.toUpperCase().replace(RE_HIG, " ").replace(/^TAMANHO\s+/, "").replace(/\s+/g, " ").trim() || null : null;
  let nomeTinhaTamanho = false;
  if (!tamanho) {
    const m = nome.match(RE_TAM_PALAVRA) ?? nome.match(RE_TAM_FIM);
    if (m) { nome = m[1].trim(); tamanho = m[2]; nomeTinhaTamanho = true; }
  }
  return { base: nome, tamanho, higienizado, nomeTinhaTamanho };
}

type Grupo = { chave: string; base: string; tamanho: string; higienizado: boolean; membros: Prod[]; alvoExistente: Prod | null; modelo: Prod | null };

export async function analisar(prisma: PrismaClient) {
  const produtos = (await prisma.epiProduto.findMany()) as unknown as Prod[];
  const famLetrasPorBase = new Map<string, Prod[]>(); // produtos que JÁ têm tamanho no campo, por nome-base
  for (const p of produtos) {
    const n = normalizar(p);
    if (p.tamanho && !n.nomeTinhaTamanho) {
      const lista = famLetrasPorBase.get(n.base) ?? [];
      lista.push(p);
      famLetrasPorBase.set(n.base, lista);
    }
  }
  const grupos = new Map<string, Grupo>();
  const semFamilia: { nome: string; base: string; tamanho: string }[] = [];
  for (const p of produtos) {
    const n = normalizar(p);
    if (!n.tamanho) continue;
    const familia = famLetrasPorBase.get(n.base) ?? [];
    if (n.nomeTinhaTamanho && familia.length === 0) { semFamilia.push({ nome: p.nome, base: n.base, tamanho: n.tamanho }); continue; }
    const chave = `${n.base}|${n.tamanho}|${n.higienizado ? "H" : ""}`;
    if (!grupos.has(chave)) grupos.set(chave, { chave, base: n.base, tamanho: n.tamanho, higienizado: n.higienizado, membros: [], alvoExistente: null, modelo: null });
    const g = grupos.get(chave)!;
    g.membros.push(p);
  }
  const acoes: Grupo[] = [];
  for (const g of grupos.values()) {
    const familia = famLetrasPorBase.get(g.base) ?? [];
    g.alvoExistente =
      g.membros.find((m) => m.nome.toUpperCase().trim() === g.base && (m.tamanho ?? "").toUpperCase().trim() === g.tamanho && m.higienizado === g.higienizado) ?? null;
    g.modelo = familia.find((f) => f.codigo) ?? familia[0] ?? g.membros[0];
    const precisaMexer = g.membros.length > 1 || !g.alvoExistente;
    if (precisaMexer) acoes.push(g);
  }
  return { produtos: produtos.length, acoes, semFamilia };
}

async function estoqueDe(prisma: PrismaClient, ids: string[]) {
  const linhas = await prisma.epiEstoque.findMany({ where: { produtoId: { in: ids } }, include: { contrato: { select: { codigo: true } } } });
  return linhas.map((l) => `${l.contrato?.codigo ?? "Geral"}=${l.estoqueInicial}`).join(", ") || "sem linhas de estoque";
}

export async function unificar(prisma: PrismaClient, aplicar: boolean, log: (s: string) => void = console.log) {
  const { produtos, acoes, semFamilia } = await analisar(prisma);
  log(`[unificar] ${produtos} produtos analisados; ${acoes.length} grupo(s) a unificar; ${semFamilia.length} com tamanho no nome e sem família (só relato)`);
  for (const s of semFamilia) log(`[unificar] SEM FAMÍLIA (não mexe): "${s.nome}" -> "${s.base}" tam ${s.tamanho}`);
  if (acoes.length === 0) return { grupos: 0, aplicado: false };

  const resumoFinal: string[] = [];
  for (const g of acoes) {
    const alvoTxt = g.alvoExistente ? `existe: ${g.alvoExistente.id}` : "será criado a partir da família";
    const rotulo = `"${g.base}" tam ${g.tamanho}${g.higienizado ? " HIGIENIZADA" : ""}`;
    log(`[unificar] ${rotulo} (${alvoTxt})`);
    for (const m of g.membros) {
      const movs = await prisma.epiMovimentacao.count({ where: { produtoId: m.id } });
      log(`[unificar]    - "${m.nome}" tam ${m.tamanho ?? "-"} hig ${m.higienizado} tipo ${m.tipo} codigo ${m.codigo ?? "-"} | estoque: ${await estoqueDe(prisma, [m.id])} | ${movs} mov.`);
    }
  }
  if (!aplicar) { log("[unificar] modo ANALISAR: nada foi gravado."); return { grupos: acoes.length, aplicado: false }; }

  const carimbo = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14).replace(/^(\d{8})(\d{6})$/, "$1_$2");
  for (const tabela of ["EpiProduto", "EpiEstoque", "EpiMovimentacao"]) {
    await prisma.$executeRawUnsafe(`CREATE TABLE "_bkp_unif_${carimbo}_${tabela}" AS TABLE "${tabela}"`);
  }
  log(`[unificar] cópia de segurança criada: _bkp_unif_${carimbo}_EpiProduto / _EpiEstoque / _EpiMovimentacao`);

  for (const g of acoes) {
    await prisma.$transaction(async (tx) => {
      let alvo = g.alvoExistente;
      const outros = g.membros.filter((m) => m.id !== alvo?.id);
      if (!alvo) {
        // Sem cadastro "certo": o primeiro membro vira o cadastro certo (nome-base, tamanho e higienizada corrigidos, dados da família).
        const [primeiro, ...resto] = g.membros;
        const m = g.modelo!;
        alvo = (await tx.epiProduto.update({
          where: { id: primeiro.id },
          data: {
            nome: g.base, tamanho: g.tamanho, higienizado: g.higienizado,
            tipo: m.tipo as any, categoria: m.categoria ?? primeiro.categoria, codigo: m.codigo ?? primeiro.codigo,
            ca: primeiro.ca ?? m.ca, fabricante: primeiro.fabricante ?? m.fabricante, unidade: m.unidade ?? primeiro.unidade,
            valorUnitario: primeiro.valorUnitario ?? m.valorUnitario, fotoUrl: primeiro.fotoUrl ?? m.fotoUrl, descricao: primeiro.descricao ?? m.descricao,
            percentualContingencia: primeiro.percentualContingencia ?? m.percentualContingencia,
          },
        })) as unknown as Prod;
        outros.length = 0;
        outros.push(...resto);
      } else {
        // O cadastro certo herda o que faltar nos outros (foto, valor, CA, código da família).
        const doc = outros.find((o) => o.fotoUrl) ?? null, val = outros.find((o) => o.valorUnitario !== null) ?? null;
        const faltando: Record<string, unknown> = {};
        if (!alvo.fotoUrl && doc) faltando.fotoUrl = doc.fotoUrl;
        if (alvo.valorUnitario === null && val) faltando.valorUnitario = val.valorUnitario;
        if (!alvo.codigo && g.modelo?.codigo) faltando.codigo = g.modelo.codigo;
        if (Object.keys(faltando).length) await tx.epiProduto.update({ where: { id: alvo.id }, data: faltando });
      }
      for (const o of outros) {
        const linhas = await tx.epiEstoque.findMany({ where: { produtoId: o.id } });
        for (const l of linhas) {
          const igual = await tx.epiEstoque.findFirst({ where: { produtoId: alvo.id, contratoId: l.contratoId } });
          if (igual) {
            await tx.epiEstoque.update({ where: { id: igual.id }, data: { estoqueInicial: igual.estoqueInicial + l.estoqueInicial, estoqueMinimo: Math.max(igual.estoqueMinimo, l.estoqueMinimo) } });
            await tx.epiEstoque.delete({ where: { id: l.id } });
          } else {
            await tx.epiEstoque.update({ where: { id: l.id }, data: { produtoId: alvo.id } });
          }
        }
        await tx.epiMovimentacao.updateMany({ where: { produtoId: o.id }, data: { produtoId: alvo.id } });
        await tx.epiProduto.delete({ where: { id: o.id } });
      }
    });
    const final = await prisma.epiProduto.findFirst({ where: { nome: g.base, tamanho: g.tamanho, higienizado: g.higienizado } });
    resumoFinal.push(`"${g.base}" tam ${g.tamanho}${g.higienizado ? " H" : ""}: ${final ? await estoqueDe(prisma, [final.id]) : "?"}`);
  }
  for (const r of resumoFinal) log(`[unificar] RESULTADO ${r}`);
  log(`[unificar] ${acoes.length} grupo(s) unificado(s).`);
  return { grupos: acoes.length, aplicado: true };
}

if (process.argv[1] && /unificar-duplicados/.test(process.argv[1])) {
  const prisma = new PrismaClient();
  unificar(prisma, process.env.UNIFICAR_MODO !== "analisar")
    .catch((e) => { console.error("[unificar] ERRO:", e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
