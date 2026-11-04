// Conferência do estoque do ECC com o INVENTÁRIO FÍSICO de 14/09/2026 (planilha "Inventário ECC - 14-09-2026", aba "Estoque do ECC").
//
// Por que existe: o estoque atual é a base do pedido de compra. Se o estoque do sistema estiver diferente do que há na
// prateleira, o sistema manda comprar peça que existe (ou deixa de comprar a que falta).
//
// Como corrige sem perder histórico: o estoque do sistema é  estoqueInicial + entradas - saídas. O inventário diz quanto havia
// em 14/09. Então:   novo estoqueInicial = contagem do inventário - (entradas - saídas registradas até 14/09).
// O que for movimentado DEPOIS de 14/09 continua somando por cima. Nenhuma movimentação é apagada ou alterada.
//
// Só corrige o que casa EXATAMENTE (mesmo nome-base, CA, tamanho e higienizada). O que é "provável" ou não existe só é mostrado.

import type { PrismaClient } from "@prisma/client";
import inventario from "@/lib/data/inventarioEcc20260914.json";
import geralMrn from "@/lib/data/estoqueGeralMrn20260829.json";
import { canonizar, type Canon } from "@/lib/chaveCanonica";

export { canonizar };
export type { Canon };

export const DATA_INVENTARIO = inventario.data; // "2026-09-14"
// Fim do dia 14/09 no horário de Brasília (UTC-3): tudo registrado até aqui já está dentro da contagem.
export const LIMITE_INVENTARIO = new Date("2026-09-15T02:59:59.999Z");

function similaridade(a: string, b: string) {
  const ta = new Set(a.split(" ").filter((x) => x.length > 1)), tb = new Set(b.split(" ").filter((x) => x.length > 1));
  if (!ta.size || !tb.size) return 0;
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  return comuns / (ta.size + tb.size - comuns);
}

export type StatusLinha = "IGUAL" | "DIFERENTE" | "CONFLITO" | "SEM_CADASTRO" | "PROVAVEL";

export type LinhaConferencia = {
  chave: string;
  status: StatusLinha;
  inventario: { nomes: string[]; inicial: number | null; atual: number; medida: string | null; linhas: number[] };
  sistema: {
    produtoId: string; nome: string; tamanho: string | null; higienizado: boolean; tipo: string;
    inicial: number; atualNaData: number; depoisDaData: number; atualHoje: number; temLinhaEcc: boolean;
  } | null;
  diferenca: number; // inventário - sistema na data da contagem
  novoInicial: number | null;
  /** quantidade do MESMO item no depósito "Geral" (sem contrato). Se for igual à do ECC, pode ser a mesma lista carregada duas vezes. */
  geralMesmoItem: number;
  nota?: string;
  candidato?: { produtoId: string; nome: string; tamanho: string | null };
  sugestaoCadastro?: { nome: string; tamanho: string | null; higienizado: boolean; tipo: "EPI" | "FARDAMENTO"; unidade: string; ca: string | null };
};

export type ResultadoConferencia = {
  dataInventario: string;
  linhas: LinhaConferencia[];
  soSistema: { produtoId: string; nome: string; tamanho: string | null; higienizado: boolean; atualHoje: number }[];
  resumo: {
    itensInventario: number; unidadesInventario: number; unidadesSistemaHoje: number;
    iguais: number; diferentes: number; conflitos: number; semCadastro: number; provaveis: number; soSistema: number; unidadesACorrigir: number;
    itensComGeralIgualAoInventario: number; unidadesGeralMesmosItens: number;
    geralDuplicadoItens: number; geralDuplicadoUnidades: number;
  };
};

const unidadeDe = (medida: string | null) => (!medida ? "UNID" : /PAR/.test(medida) ? "PAR" : /CAIXA/.test(medida) ? "CAIXA" : "UNID");
const tipoDe = (base: string): "EPI" | "FARDAMENTO" => (/^(CAMISA|CALCA|BLUSAO|JALECO)\b/.test(base) ? "FARDAMENTO" : "EPI");

export async function conferirEstoqueEcc(prisma: PrismaClient): Promise<ResultadoConferencia> {
  const ecc = await prisma.epiContrato.findFirst({ where: { codigo: "ECC" } });
  if (!ecc) throw new Error('Contrato "ECC" não encontrado no sistema.');

  const [produtos, estoques, estoquesGeral, movs] = await Promise.all([
    prisma.epiProduto.findMany({ where: { ativo: true } }),
    prisma.epiEstoque.findMany({ where: { contratoId: ecc.id } }),
    prisma.epiEstoque.findMany({ where: { contratoId: null } }),
    prisma.epiMovimentacao.findMany({ where: { contratoId: ecc.id }, select: { produtoId: true, tipo: true, quantidade: true, data: true } }),
  ]);
  const estoquePorProduto = new Map(estoques.map((e) => [e.produtoId, e]));
  const geralPorProduto = new Map(estoquesGeral.map((e) => [e.produtoId, e.estoqueInicial])); // Geral não recebe movimentação (contrato é obrigatório nela)
  const netAte = new Map<string, number>(), netDepois = new Map<string, number>();
  for (const m of movs) {
    const alvo = m.data <= LIMITE_INVENTARIO ? netAte : netDepois;
    alvo.set(m.produtoId, (alvo.get(m.produtoId) ?? 0) + (m.tipo === "ENTRADA" ? m.quantidade : -m.quantidade));
  }

  // produtos do sistema agrupados pela chave canônica
  const sistemaPorChave = new Map<string, { p: (typeof produtos)[number]; canon: Canon }[]>();
  for (const p of produtos) {
    const canon = canonizar(p.nome, p.tamanho, p.higienizado);
    const lista = sistemaPorChave.get(canon.key) ?? [];
    lista.push({ p, canon });
    sistemaPorChave.set(canon.key, lista);
  }

  // inventário agrupado pela mesma chave (linhas repetidas no inventário são somadas)
  const invPorChave = new Map<string, { canon: Canon; itens: typeof inventario.itens }>();
  for (const item of inventario.itens) {
    const canon = canonizar(item.produto);
    const g = invPorChave.get(canon.key) ?? { canon, itens: [] as typeof inventario.itens };
    g.itens.push(item);
    invPorChave.set(canon.key, g);
  }

  const linhas: LinhaConferencia[] = [];
  const casados = new Set<string>();
  for (const [chave, g] of invPorChave) {
    const atual = g.itens.reduce((s, i) => s + (i.atual ?? 0), 0);
    const inicialSoma = g.itens.some((i) => i.inicial !== null) ? g.itens.reduce((s, i) => s + (i.inicial ?? 0), 0) : null;
    const inventarioInfo = { nomes: g.itens.map((i) => i.produto), inicial: inicialSoma, atual, medida: g.itens[0].medida, linhas: g.itens.map((i) => i.linha) };
    const doSistema = sistemaPorChave.get(chave) ?? [];

    if (doSistema.length === 0) {
      // sem igual exato: procura provável (mesmo CA + tamanho + higienizada e nome parecido)
      let melhor: { p: (typeof produtos)[number]; nota: number } | null = null;
      if (g.canon.ca) {
        for (const lista of sistemaPorChave.values()) for (const { p, canon } of lista) {
          if (canon.ca !== g.canon.ca || canon.tam !== g.canon.tam || canon.hig !== g.canon.hig) continue;
          const nota = similaridade(canon.base, g.canon.base);
          if (nota >= 0.5 && (!melhor || nota > melhor.nota)) melhor = { p, nota };
        }
      }
      if (melhor) {
        linhas.push({ chave, status: "PROVAVEL", inventario: inventarioInfo, sistema: null, diferenca: 0, novoInicial: null, geralMesmoItem: geralPorProduto.get(melhor.p.id) ?? 0, candidato: { produtoId: melhor.p.id, nome: melhor.p.nome, tamanho: melhor.p.tamanho }, nota: "Parece ser o mesmo item com nome diferente. Ajuste o nome no cadastro e confira de novo." });
        casados.add(melhor.p.id);
      } else {
        linhas.push({
          chave, status: "SEM_CADASTRO", inventario: inventarioInfo, sistema: null, diferenca: atual, novoInicial: atual, geralMesmoItem: 0,
          sugestaoCadastro: { nome: g.canon.nomeExibicao, tamanho: g.canon.tam, higienizado: g.canon.hig, tipo: tipoDe(g.canon.base), unidade: unidadeDe(g.itens[0].medida), ca: g.canon.ca },
          nota: "Está no inventário e não existe no cadastro.",
        });
      }
      continue;
    }

    for (const { p } of doSistema) casados.add(p.id);
    const comLinha = doSistema.filter(({ p }) => estoquePorProduto.has(p.id));
    const alvo = (comLinha[0] ?? doSistema[0]).p;
    const inicial = estoquePorProduto.get(alvo.id)?.estoqueInicial ?? 0;
    const ate = netAte.get(alvo.id) ?? 0, depois = netDepois.get(alvo.id) ?? 0;
    const sistema = {
      produtoId: alvo.id, nome: alvo.nome, tamanho: alvo.tamanho, higienizado: alvo.higienizado, tipo: alvo.tipo,
      inicial, atualNaData: inicial + ate, depoisDaData: depois, atualHoje: inicial + ate + depois, temLinhaEcc: estoquePorProduto.has(alvo.id),
    };
    const diferenca = atual - sistema.atualNaData;
    const novoInicial = atual - ate;
    const geralMesmoItem = doSistema.reduce((sum, { p }) => sum + (geralPorProduto.get(p.id) ?? 0), 0);
    if (comLinha.length > 1) {
      linhas.push({ chave, status: "CONFLITO", inventario: inventarioInfo, sistema, diferenca, novoInicial: null, geralMesmoItem, nota: `${comLinha.length} cadastros iguais no sistema com estoque no ECC. Unifique antes de corrigir.` });
    } else if (diferenca === 0) {
      linhas.push({ chave, status: "IGUAL", inventario: inventarioInfo, sistema, diferenca: 0, novoInicial, geralMesmoItem });
    } else if (novoInicial < 0) {
      linhas.push({ chave, status: "CONFLITO", inventario: inventarioInfo, sistema, diferenca, novoInicial: null, geralMesmoItem, nota: `Foram registradas ${-ate} saída(s) líquidas até 14/09, mais do que a contagem (${atual}). Confira as movimentações.` });
    } else {
      linhas.push({ chave, status: "DIFERENTE", inventario: inventarioInfo, sistema, diferenca, novoInicial, geralMesmoItem });
    }
  }

  const soSistema = estoques
    .filter((e) => !casados.has(e.produtoId))
    .map((e) => {
      const p = produtos.find((x) => x.id === e.produtoId);
      return p ? { produtoId: p.id, nome: p.nome, tamanho: p.tamanho, higienizado: p.higienizado, atualHoje: e.estoqueInicial + (netAte.get(p.id) ?? 0) + (netDepois.get(p.id) ?? 0) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.atualHoje !== 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const geralDup = await acharGeralDuplicado(prisma, produtos, estoquesGeral);

  const ordem: Record<StatusLinha, number> = { DIFERENTE: 0, CONFLITO: 1, SEM_CADASTRO: 2, PROVAVEL: 3, IGUAL: 4 };
  linhas.sort((a, b) => ordem[a.status] - ordem[b.status] || a.inventario.nomes[0].localeCompare(b.inventario.nomes[0], "pt-BR"));
  const conta = (s: StatusLinha) => linhas.filter((l) => l.status === s).length;
  const unidadesSistemaHoje = estoques.reduce((s, e) => s + e.estoqueInicial + (netAte.get(e.produtoId) ?? 0) + (netDepois.get(e.produtoId) ?? 0), 0);
  return {
    dataInventario: DATA_INVENTARIO,
    linhas,
    soSistema,
    resumo: {
      itensInventario: linhas.length,
      unidadesInventario: linhas.reduce((s, l) => s + l.inventario.atual, 0),
      unidadesSistemaHoje,
      iguais: conta("IGUAL"), diferentes: conta("DIFERENTE"), conflitos: conta("CONFLITO"), semCadastro: conta("SEM_CADASTRO"), provaveis: conta("PROVAVEL"), soSistema: soSistema.length,
      unidadesACorrigir: linhas.filter((l) => l.status === "DIFERENTE").reduce((s, l) => s + Math.abs(l.diferenca), 0),
      itensComGeralIgualAoInventario: linhas.filter((l) => l.geralMesmoItem > 0 && (l.inventario.inicial === l.geralMesmoItem || l.inventario.atual === l.geralMesmoItem)).length,
      unidadesGeralMesmosItens: linhas.reduce((s, l) => s + l.geralMesmoItem, 0),
      geralDuplicadoItens: geralDup.length,
      geralDuplicadoUnidades: geralDup.reduce((s, g) => s + g.inicial, 0),
    },
  };
}

export type GeralDuplicado = { estoqueId: string; produtoId: string; nome: string; tamanho: string | null; higienizado: boolean; inicial: number };

/**
 * A lista que virou "Geral" no sistema veio da aba "Estoque do ECC" de INFORMAÇÕES GERAIS - MRN.xlsx (29/08/2026), importada sem contrato.
 * É a MESMA lista do inventário do ECC. Aqui acha as linhas do Geral que ainda têm exatamente a quantidade inicial dessa aba: são cópia do ECC.
 */
async function acharGeralDuplicado(
  _prisma: PrismaClient,
  produtos: { id: string; nome: string; tamanho: string | null; higienizado: boolean }[],
  estoquesGeral: { id: string; produtoId: string; estoqueInicial: number }[]
): Promise<GeralDuplicado[]> {
  const inicialPorChave = new Map<string, Set<number>>();
  for (const it of geralMrn.itens) {
    if (!it.inicial) continue;
    const k = canonizar(it.produto).key;
    const set = inicialPorChave.get(k) ?? new Set<number>();
    set.add(it.inicial);
    inicialPorChave.set(k, set);
  }
  const linhaPorProduto = new Map(estoquesGeral.map((e) => [e.produtoId, e]));
  const saida: GeralDuplicado[] = [];
  for (const p of produtos) {
    const linha = linhaPorProduto.get(p.id);
    if (!linha || linha.estoqueInicial <= 0) continue;
    const valores = inicialPorChave.get(canonizar(p.nome, p.tamanho, p.higienizado).key);
    if (valores?.has(linha.estoqueInicial)) saida.push({ estoqueId: linha.id, produtoId: p.id, nome: p.nome, tamanho: p.tamanho, higienizado: p.higienizado, inicial: linha.estoqueInicial });
  }
  return saida;
}

function carimbo() {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14).replace(/^(\d{8})(\d{6})$/, "$1_$2");
}

/** Corrige o estoque inicial do ECC dos itens DIFERENTES (cópia de segurança antes). Nada de movimentação é tocado. */
export async function aplicarCorrecoes(prisma: PrismaClient, acao: "corrigir" | "cadastrar" | "zerarGeral") {
  const ecc = await prisma.epiContrato.findFirst({ where: { codigo: "ECC" } });
  if (!ecc) throw new Error('Contrato "ECC" não encontrado no sistema.');
  const conf = await conferirEstoqueEcc(prisma);
  const selo = carimbo();

  if (acao === "zerarGeral") {
    const [produtos, estoquesGeral] = await Promise.all([prisma.epiProduto.findMany({ where: { ativo: true } }), prisma.epiEstoque.findMany({ where: { contratoId: null } })]);
    const dup = await acharGeralDuplicado(prisma, produtos, estoquesGeral);
    if (dup.length === 0) return { acao, alterados: 0, backup: null as string | null, itens: [] as string[] };
    const backup = `_bkp_conf_${selo}_EpiEstoque`;
    await prisma.$executeRawUnsafe(`CREATE TABLE "${backup}" AS TABLE "EpiEstoque"`);
    await prisma.$transaction(async (tx) => {
      for (const d of dup) await tx.epiEstoque.update({ where: { id: d.estoqueId }, data: { estoqueInicial: 0 } });
    });
    return { acao, alterados: dup.length, backup, itens: dup.map((d) => `${d.nome}${d.tamanho ? ` ${d.tamanho}` : ""}${d.higienizado ? " (higienizada)" : ""}: Geral ${d.inicial} -> 0`) };
  }

  if (acao === "corrigir") {
    const alvo = conf.linhas.filter((l) => l.status === "DIFERENTE" && l.sistema && l.novoInicial !== null);
    if (alvo.length === 0) return { acao, alterados: 0, backup: null as string | null, itens: [] as string[] };
    const backup = `_bkp_conf_${selo}_EpiEstoque`;
    await prisma.$executeRawUnsafe(`CREATE TABLE "${backup}" AS TABLE "EpiEstoque"`);
    await prisma.$transaction(async (tx) => {
      for (const l of alvo) {
        const existente = await tx.epiEstoque.findFirst({ where: { produtoId: l.sistema!.produtoId, contratoId: ecc.id } });
        if (existente) await tx.epiEstoque.update({ where: { id: existente.id }, data: { estoqueInicial: l.novoInicial! } });
        else await tx.epiEstoque.create({ data: { produtoId: l.sistema!.produtoId, contratoId: ecc.id, estoqueInicial: l.novoInicial! } });
      }
    });
    return { acao, alterados: alvo.length, backup, itens: alvo.map((l) => `${l.sistema!.nome}${l.sistema!.tamanho ? ` ${l.sistema!.tamanho}` : ""}: ${l.sistema!.atualNaData} -> ${l.inventario.atual}`) };
  }

  const novos = conf.linhas.filter((l) => l.status === "SEM_CADASTRO" && l.sugestaoCadastro);
  if (novos.length === 0) return { acao, alterados: 0, backup: null as string | null, itens: [] as string[] };
  const backupE = `_bkp_conf_${selo}_EpiEstoque`, backupP = `_bkp_conf_${selo}_EpiProduto`;
  await prisma.$executeRawUnsafe(`CREATE TABLE "${backupE}" AS TABLE "EpiEstoque"`);
  await prisma.$executeRawUnsafe(`CREATE TABLE "${backupP}" AS TABLE "EpiProduto"`);
  await prisma.$transaction(async (tx) => {
    for (const l of novos) {
      const s = l.sugestaoCadastro!;
      const igual = await tx.epiProduto.findFirst({ where: { nome: s.nome, tamanho: s.tamanho, higienizado: s.higienizado } });
      const produto = igual ?? (await tx.epiProduto.create({ data: { nome: s.nome, tamanho: s.tamanho, higienizado: s.higienizado, tipo: s.tipo, unidade: s.unidade, ca: s.ca } }));
      const linha = await tx.epiEstoque.findFirst({ where: { produtoId: produto.id, contratoId: ecc.id } });
      if (!linha) await tx.epiEstoque.create({ data: { produtoId: produto.id, contratoId: ecc.id, estoqueInicial: l.novoInicial! } });
    }
  });
  return { acao, alterados: novos.length, backup: `${backupE} / ${backupP}`, itens: novos.map((l) => `${l.sugestaoCadastro!.nome}${l.sugestaoCadastro!.tamanho ? ` ${l.sugestaoCadastro!.tamanho}` : ""}: ${l.inventario.atual}`) };
}
