"use client";

import { useEffect, useMemo, useState } from "react";
import EpiMovimentacaoForm from "@/components/EpiMovimentacaoForm";
import { canonizar, compararItens } from "@/lib/chaveCanonica";

type Contrato = { id: string; codigo: string; nome: string | null };
type Colaborador = { id: string; nomeCompleto: string; contratoId: string };
type EstoqueRow = {
  id: string;
  produto: { id: string; nome: string; tipo: string; categoria: string | null; ca: string | null; codigo: string | null; tamanho: string | null; higienizado: boolean; unidade: string; valorUnitario: number | null; fotoUrl: string | null };
  contrato: Contrato | null;
  estoqueInicial: number;
  entradas: number;
  saidas: number;
  estoqueAtual: number;
  // Mínimo agora é SEMPRE calculado (quantidade real em uso × % de
  // contingência) — nunca um número editado à mão. null quando não existe
  // dado real de uso pra esse produto+tamanho (nenhum EpiColaboradorItem
  // bateu) — nesse caso não existe "sugestão", existe ausência de dado.
  estoqueMinimo: number | null;
  estoqueMinimoAntigo: number; // valor antigo, importado da planilha — só histórico/auditoria
  efetivoConsiderado: number | null; // quantos colaboradores ativos usam esse produto+tamanho, hoje
  temDadoDeUso: boolean;
  necessidade: number;
  status: "OK" | "ATENCAO" | "COMPRAR" | "SEM_DADO";
  valorEmEstoque: number | null;
};

type Status = "OK" | "ATENCAO" | "COMPRAR" | "SEM_DADO";
type Pool = "GERAL" | "ECC";

// O ECC abastece os contratos de código numérico (MRN) e o próprio ECC; Geral = depósito central (sem contrato), Sede e AGA.
function poolDe(r: EstoqueRow): Pool {
  const c = r.contrato?.codigo;
  return c && (c === "ECC" || /^\d+$/.test(c)) ? "ECC" : "GERAL";
}

type Item = {
  chave: string;
  rows: EstoqueRow[];
  produto: EstoqueRow["produto"];
  total: number;
  geral: number;
  ecc: number;
  minGeral: number | null;
  minEcc: number | null;
  inicial: number;
  entradas: number;
  saidas: number;
  uso: number | null;
  minimo: number | null;
  necessidade: number;
  necGeral: number;
  necEcc: number;
  valorEmEstoque: number | null;
  status: Status;
};

const PRIORIDADE: Record<Status, number> = { COMPRAR: 3, ATENCAO: 2, OK: 1, SEM_DADO: 0 };

// Junta num item só tudo o que é o mesmo produto (mesmo nome-base, CA, tamanho e higienizada), esteja em qual depósito estiver
// e mesmo que hoje haja dois cadastros: a contagem total fica junta e se vê quanto está no Geral e quanto no ECC.
function agruparItens(rows: EstoqueRow[]): Item[] {
  const mapa = new Map<string, EstoqueRow[]>();
  for (const r of rows) {
    const k = canonizar(r.produto.nome, r.produto.tamanho, r.produto.higienizado).key;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k)!.push(r);
  }
  const itens: Item[] = [];
  for (const [chave, rs] of mapa) {
    const principal = (rs.find((r) => r.produto.codigo) ?? rs[0]).produto;
    const soma = (f: (r: EstoqueRow) => number) => rs.reduce((s, r) => s + f(r), 0);
    const doPool = (p: Pool) => rs.filter((r) => poolDe(r) === p);
    const minPool = (p: Pool) => {
      const v = doPool(p).map((r) => r.estoqueMinimo).filter((x): x is number => x !== null);
      return v.length ? Math.max(...v) : null;
    };
    const usos = rs.map((r) => r.efetivoConsiderado).filter((x): x is number => x !== null);
    const minimos = [minPool("GERAL"), minPool("ECC")].filter((x): x is number => x !== null);
    const valores = rs.map((r) => r.valorEmEstoque).filter((x): x is number => x !== null);
    const status = rs.reduce<Status>((pior, r) => (PRIORIDADE[r.status] > PRIORIDADE[pior] ? r.status : pior), "SEM_DADO");
    itens.push({
      chave,
      rows: rs,
      produto: principal,
      total: soma((r) => r.estoqueAtual),
      geral: doPool("GERAL").reduce((s, r) => s + r.estoqueAtual, 0),
      ecc: doPool("ECC").reduce((s, r) => s + r.estoqueAtual, 0),
      minGeral: minPool("GERAL"),
      minEcc: minPool("ECC"),
      inicial: soma((r) => r.estoqueInicial),
      entradas: soma((r) => r.entradas),
      saidas: soma((r) => r.saidas),
      uso: usos.length ? Math.max(...usos) : null,
      minimo: minimos.length ? minimos.reduce((s, x) => s + x, 0) : null,
      necessidade: soma((r) => r.necessidade),
      necGeral: doPool("GERAL").reduce((s, r) => s + r.necessidade, 0),
      necEcc: doPool("ECC").reduce((s, r) => s + r.necessidade, 0),
      valorEmEstoque: valores.length ? valores.reduce((s, v) => s + v, 0) : null,
      status,
    });
  }
  return itens.sort((a, b) => compararItens(a.produto, b.produto));
}

function StatusBadge({ status }: { status: "OK" | "ATENCAO" | "COMPRAR" | "SEM_DADO" }) {
  const estilo =
    status === "COMPRAR"
      ? "bg-rose-50 text-rose-600"
      : status === "ATENCAO"
        ? "bg-amber-50 text-amber-600"
        : status === "SEM_DADO"
          ? "bg-gray-100 text-gray-400"
          : "bg-brand-light text-brand-dark";
  const texto = status === "COMPRAR" ? "Comprar" : status === "ATENCAO" ? "Atenção" : status === "SEM_DADO" ? "Sem dado" : "OK";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${estilo}`}>{texto}</span>;
}

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Grupos de filtro — EPI/EPC/Fardamento por tipo, e cada categoria de item
// geral (escritório, veicular, alojamento, depósito) separada, não escondida
// atrás de um "Geral" só. A mesma lista serve pra separar o estoque em
// blocos visuais (um bloco por grupo), em vez de uma tabela só gigante.
const GRUPOS = [
  { value: "EPI", label: "🦺 EPI" },
  { value: "EPC", label: "🛡️ EPC" },
  { value: "FARDAMENTO", label: "👕 Fardamento" },
  { value: "cat:Material de Escritório", label: "🖇️ Material de Escritório" },
  { value: "cat:Itens Veicular", label: "🚗 Itens Veicular" },
  { value: "cat:Insumos Alojamento", label: "🛏️ Insumos Alojamento" },
  { value: "cat:Depósito Geral", label: "📦 Depósito Geral" },
];

function grupoChaveDe(r: { produto: EstoqueRow["produto"] }): string {
  // Mesma regra do dashboard: só GERAL usa a categoria (escritório/veicular/
  // alojamento/depósito) como sub-grupo — EPI/EPC/Fardamento agrupam pelo
  // tipo mesmo, categoria (se algum dia tiver valor) não conta aqui.
  if (r.produto.tipo === "GERAL" && r.produto.categoria) return `cat:${r.produto.categoria}`;
  return r.produto.tipo;
}

export default function EstoquePage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [produtos, setProdutos] = useState<{ id: string; nome: string }[]>([]);
  const [rows, setRows] = useState<EstoqueRow[]>([]);
  const [contratoFiltro, setContratoFiltro] = useState<string>("");
  const [grupoFiltro, setGrupoFiltro] = useState<string>("");
  const [statusFiltro, setStatusFiltro] = useState<"" | "COMPRAR" | "ATENCAO" | "OK" | "SEM_DADO">("");
  const [busca, setBusca] = useState("");
  const [modalItem, setModalItem] = useState<Item | null>(null);
  const [blocosFechados, setBlocosFechados] = useState<Set<string>>(new Set());

  function toggleBloco(chave: string) {
    setBlocosFechados((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  function reload() {
    const qs = contratoFiltro ? `?contratoId=${contratoFiltro}` : "";
    fetch(`/api/epi/estoque${qs}`).then((r) => r.json()).then(setRows).catch(() => {});
  }

  useEffect(() => {
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
    fetch("/api/epi/colaboradores").then((r) => r.json()).then(setColaboradores).catch(() => {});
    fetch("/api/epi/produtos").then((r) => r.json()).then(setProdutos).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 20000); // ao vivo
    return () => clearInterval(id);
  }, [contratoFiltro]);

  const itensTodos = useMemo(() => agruparItens(rows), [rows]);

  const filtered = useMemo(
    () =>
      itensTodos.filter((r) => {
        if (busca && !r.produto.nome.toLowerCase().includes(busca.toLowerCase())) return false;
        if (statusFiltro && r.status !== statusFiltro) return false;
        if (grupoFiltro) {
          if (grupoFiltro.startsWith("cat:")) {
            if (r.produto.categoria !== grupoFiltro.slice(4)) return false;
          } else if (r.produto.tipo !== grupoFiltro) {
            return false;
          }
        }
        return true;
      }),
    [itensTodos, busca, grupoFiltro, statusFiltro]
  );

  // Separa em blocos (um por categoria) em vez de uma tabela só gigante —
  // preserva a ordem de GRUPOS, e só cria bloco pra quem tem item de verdade
  // depois do filtro atual.
  const blocos = useMemo(() => {
    const porChave = new Map<string, Item[]>();
    for (const r of filtered) {
      const chave = grupoChaveDe(r);
      if (!porChave.has(chave)) porChave.set(chave, []);
      porChave.get(chave)!.push(r);
    }
    return GRUPOS.map((g) => ({ ...g, rows: porChave.get(g.value) ?? [] })).filter((b) => b.rows.length > 0);
  }, [filtered]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={contratoFiltro}
          onChange={(e) => setContratoFiltro(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todos os contratos</option>
          <option value="geral">Geral (depósito central)</option>
          {contratos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} {c.nome ? `— ${c.nome}` : ""}
            </option>
          ))}
        </select>
        <select
          value={grupoFiltro}
          onChange={(e) => setGrupoFiltro(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todas as categorias</option>
          {GRUPOS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        <select
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value as any)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todos os status</option>
          <option value="COMPRAR">🔴 Precisa comprar</option>
          <option value="ATENCAO">🟡 Perto do mínimo</option>
          <option value="OK">✅ OK</option>
          <option value="SEM_DADO">⚪ Sem dado de uso</option>
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto..."
          className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-gray-400">{filtered.length} itens · uma linha por modelo, tamanho e higienizada, com quanto está guardado no Geral e no ECC · o que as pessoas usam fica em "Em uso" e não conta como estoque · mínimo = em uso × % de contingência</span>
      </div>

      <div className="space-y-4">
        {blocos.map((bloco) => {
          const fechado = blocosFechados.has(bloco.value);
          const comprar = bloco.rows.filter((r) => r.status === "COMPRAR").length;
          const atencao = bloco.rows.filter((r) => r.status === "ATENCAO").length;
          const valorTotal = bloco.rows.reduce((s, r) => s + (r.valorEmEstoque ?? 0), 0);
          const unidades = bloco.rows.reduce((s, r) => s + r.total, 0);
          return (
            <div key={bloco.value} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button
                onClick={() => toggleBloco(bloco.value)}
                className="flex w-full items-center justify-between gap-3 bg-gray-50 px-5 py-3 text-left hover:bg-gray-100"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{fechado ? "▸" : "▾"}</span>
                  <span className="font-semibold text-gray-700">{bloco.label}</span>
                  <span className="text-xs text-gray-400">{bloco.rows.length} itens · {unidades} un.</span>
                  {comprar > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">🔴 {comprar} comprar</span>}
                  {atencao > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600">🟡 {atencao} perto do mín.</span>}
                </div>
                {valorTotal > 0 && <span className="text-xs text-gray-400">{fmtMoney(valorTotal)} em estoque</span>}
              </button>

              {!fechado && (
                <div className="max-h-[65vh] overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-max text-xs">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="whitespace-nowrap border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                        <th className="px-3 py-2" />
                        <th className="px-3 py-2">Produto</th>
                        <th className="px-3 py-2">Código</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-500" title="Soma de tudo que existe deste item: Geral + ECC">Total</th>
                        <th className="px-3 py-2 text-right" title="Quanto está no depósito Geral (inclui Sede e AGA)">Geral</th>
                        <th className="px-3 py-2 text-right" title="Quanto está no ECC (abastece os contratos MRN)">ECC</th>
                        <th className="px-3 py-2 text-right" title="Estoque inicial somado dos depósitos">Inicial</th>
                        <th className="px-3 py-2 text-right">Entradas</th>
                        <th className="px-3 py-2 text-right">Saídas</th>
                        <th className="px-3 py-2 text-right" title="Quantos colaboradores ativos estão USANDO esse item, nesse tamanho (ficha ou matriz de função). NÃO é estoque: o que está com as pessoas não entra no Total. O Mínimo nasce daqui e é comparado só com o que está guardado nos depósitos.">Em uso (pessoas)</th>
                        <th className="px-3 py-2 text-right" title="Em Utilização × % de contingência (arredondado pra cima), somado do Geral e do ECC">Estoque Mínimo</th>
                        <th className="px-3 py-2 text-right" title="Estoque Mínimo − Estoque Atual, quando positivo — se o Estoque Atual já cobre o Mínimo, não precisa comprar">A Comprar</th>
                        <th className="px-3 py-2 text-right">Valor em Estoque</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {bloco.rows.map((r) => (
                        <tr key={r.chave} className="whitespace-nowrap border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                          <td className="px-3 py-2">
                            <div className="h-8 w-8 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                              {r.produto.fotoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={r.produto.fotoUrl} alt={r.produto.nome} className="h-full w-full object-contain" />
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-700">{r.produto.nome}</p>
                            {r.produto.tamanho && (
                              <p className="text-[10px] text-gray-400">
                                Tamanho {r.produto.tamanho}
                                {r.produto.higienizado && <span className="ml-1 text-teal-600">· ♻️ Higienizada</span>}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-0.5">
                              {r.produto.codigo && (
                                <span className="w-fit rounded-md bg-brand-light px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-dark">{r.produto.codigo}</span>
                              )}
                              {r.produto.ca ? (
                                <span className="w-fit rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-600">CA {r.produto.ca}</span>
                              ) : !r.produto.codigo ? (
                                <span className="text-gray-300">—</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-base font-bold text-gray-800">{r.total}</td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            <span className="font-semibold">{r.geral}</span>
                            {r.minGeral !== null && <span className="block text-[10px] text-gray-400">mín {r.minGeral}</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            <span className="font-semibold">{r.ecc}</span>
                            {r.minEcc !== null && <span className="block text-[10px] text-gray-400">mín {r.minEcc}</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">{r.inicial}</td>
                          <td className="px-3 py-2 text-right text-brand-dark">{r.entradas}</td>
                          <td className="px-3 py-2 text-right text-rose-500">{r.saidas}</td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {r.uso !== null ? (
                              r.uso
                            ) : (
                              <span className="italic text-gray-300" title="Nenhum colaborador ativo foi cruzado com esse produto (ficha ou matriz de função)">
                                sem dado
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-700">
                            {r.minimo !== null ? (
                              r.minimo
                            ) : (
                              <span className="italic text-gray-300">sem dado</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {r.necessidade > 0 ? (
                              <>
                                <span className="font-semibold text-rose-600">{r.necessidade}</span>
                                {r.necGeral > 0 && r.necEcc > 0 && <span className="block text-[10px] text-gray-400">G {r.necGeral} · E {r.necEcc}</span>}
                              </>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-400">{r.valorEmEstoque !== null ? fmtMoney(r.valorEmEstoque) : "—"}</td>
                          <td className="px-3 py-2">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <button
                              onClick={() => setModalItem(r)}
                              className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-dark"
                            >
                              + Movimentação
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {blocos.length === 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
            Nenhum item encontrado. Importe uma planilha em "Importar planilha".
          </div>
        )}
      </div>

      {modalItem && (
        <EpiMovimentacaoForm
          contratos={contratos}
          produtos={produtos}
          colaboradores={colaboradores.filter((c) => modalItem.rows.length !== 1 || !modalItem.rows[0].contrato || c.contratoId === modalItem.rows[0].contrato.id)}
          produtoFixo={modalItem.produto}
          contratoFixo={modalItem.rows.length === 1 ? modalItem.rows[0].contrato ?? undefined : undefined}
          onClose={() => setModalItem(null)}
          onSaved={() => {
            setModalItem(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
