"use client";

import { useEffect, useMemo, useState } from "react";
import EpiMovimentacaoForm from "@/components/EpiMovimentacaoForm";

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

function grupoChaveDe(r: EstoqueRow): string {
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
  const [modalRow, setModalRow] = useState<EstoqueRow | null>(null);
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

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
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
    [rows, busca, grupoFiltro, statusFiltro]
  );

  // Separa em blocos (um por categoria) em vez de uma tabela só gigante —
  // preserva a ordem de GRUPOS, e só cria bloco pra quem tem item de verdade
  // depois do filtro atual.
  const blocos = useMemo(() => {
    const porChave = new Map<string, EstoqueRow[]>();
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
        <span className="text-xs text-gray-400">{filtered.length} itens · mínimo calculado automaticamente (quantidade real em uso × % de contingência)</span>
      </div>

      <div className="space-y-4">
        {blocos.map((bloco) => {
          const fechado = blocosFechados.has(bloco.value);
          const comprar = bloco.rows.filter((r) => r.status === "COMPRAR").length;
          const atencao = bloco.rows.filter((r) => r.status === "ATENCAO").length;
          const valorTotal = bloco.rows.reduce((s, r) => s + (r.valorEmEstoque ?? 0), 0);
          return (
            <div key={bloco.value} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button
                onClick={() => toggleBloco(bloco.value)}
                className="flex w-full items-center justify-between gap-3 bg-gray-50 px-5 py-3 text-left hover:bg-gray-100"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{fechado ? "▸" : "▾"}</span>
                  <span className="font-semibold text-gray-700">{bloco.label}</span>
                  <span className="text-xs text-gray-400">{bloco.rows.length} itens</span>
                  {comprar > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">🔴 {comprar} comprar</span>}
                  {atencao > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600">🟡 {atencao} perto do mín.</span>}
                </div>
                {valorTotal > 0 && <span className="text-xs text-gray-400">{fmtMoney(valorTotal)} em estoque</span>}
              </button>

              {!fechado && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                        <th className="px-4 py-2" />
                        <th className="px-4 py-2">Produto</th>
                        <th className="px-4 py-2">Código</th>
                        <th className="px-4 py-2">Contrato</th>
                        <th className="px-4 py-2 text-right">Inicial</th>
                        <th className="px-4 py-2 text-right">Entradas</th>
                        <th className="px-4 py-2 text-right">Saídas</th>
                        <th className="px-4 py-2 text-right">Atual</th>
                        <th className="px-4 py-2 text-right">Mínimo</th>
                        <th className="px-4 py-2 text-right">Comprar</th>
                        <th className="px-4 py-2 text-right">Valor em estoque</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {bloco.rows.map((r) => (
                        <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                          <td className="px-4 py-2.5">
                            <div className="h-9 w-9 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                              {r.produto.fotoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={r.produto.fotoUrl} alt={r.produto.nome} className="h-full w-full object-contain" />
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-700">{r.produto.nome}</p>
                            {r.produto.tamanho && (
                              <p className="text-xs text-gray-400">
                                Tamanho {r.produto.tamanho}
                                {r.produto.higienizado && <span className="ml-1 text-teal-600">· ♻️ Higienizada</span>}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              {r.produto.codigo && (
                                <span className="w-fit rounded-md bg-brand-light px-2 py-0.5 font-mono text-[11px] font-semibold text-brand-dark">{r.produto.codigo}</span>
                              )}
                              {r.produto.ca ? (
                                <span className="w-fit rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-gray-600">CA {r.produto.ca}</span>
                              ) : !r.produto.codigo ? (
                                <span className="text-xs text-gray-300">—</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-gray-500">{r.contrato?.codigo ?? "Geral"}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{r.estoqueInicial}</td>
                          <td className="px-4 py-2.5 text-right text-brand-dark">{r.entradas}</td>
                          <td className="px-4 py-2.5 text-right text-rose-500">{r.saidas}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{r.estoqueAtual}</td>
                          <td className="px-4 py-2.5 text-right">
                            {r.temDadoDeUso ? (
                              <div>
                                <span
                                  className="font-semibold text-gray-700"
                                  title={`${r.efetivoConsiderado} colaborador(es) ativo(s) em uso × % de contingência (calculado, não editável)`}
                                >
                                  {r.estoqueMinimo}
                                </span>
                                <p className="text-[10px] text-gray-400">{r.efetivoConsiderado} em uso</p>
                              </div>
                            ) : (
                              <span
                                className="text-xs italic text-gray-300"
                                title="Nenhum colaborador ativo foi cruzado com esse produto (ficha ou matriz de função) — sem dado real de uso, não existe mínimo calculado"
                              >
                                sem dado de uso
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {r.necessidade > 0 ? (
                              <span className="font-semibold text-rose-600">{r.necessidade}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-400">{r.valorEmEstoque !== null ? fmtMoney(r.valorEmEstoque) : "—"}</td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => setModalRow(r)}
                              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
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

      {modalRow && (
        <EpiMovimentacaoForm
          contratos={contratos}
          produtos={produtos}
          colaboradores={colaboradores.filter((c) => !modalRow.contrato || c.contratoId === modalRow.contrato.id)}
          produtoFixo={modalRow.produto}
          contratoFixo={modalRow.contrato ?? undefined}
          onClose={() => setModalRow(null)}
          onSaved={() => {
            setModalRow(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
