"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Contrato = { id: string; codigo: string; nome: string | null };
type LinhaPedido = {
  id: string;
  produto: { nome: string; tipo: string; ca: string | null; codigo: string | null; tamanho: string | null; higienizado: boolean; unidade: string; valorUnitario: number | null };
  contrato: Contrato | null;
  estoqueAtual: number;
  estoqueMinimo: number | null;
  efetivoConsiderado: number | null;
  temDadoDeUso: boolean;
  necessidade: number;
  valorNecessidade: number | null;
};

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function EstoqueMinimoPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoFiltro, setContratoFiltro] = useState<string>("");
  const [linhas, setLinhas] = useState<LinhaPedido[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
  }, []);

  useEffect(() => {
    setCarregando(true);
    const qs = contratoFiltro ? `?contratoId=${contratoFiltro}` : "";
    fetch(`/api/epi/estoque${qs}`)
      .then((r) => r.json())
      .then((rows: LinhaPedido[]) => setLinhas(rows.filter((r) => r.necessidade > 0)))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [contratoFiltro]);

  // Agrupado por contrato (mesmo padrão da tela Colaboradores) — cada bloco
  // mostra pra onde vai o pedido e o subtotal dele, pra Luana montar as
  // requisições separadas por destino em vez de uma lista solta.
  const porContrato = useMemo(() => {
    const map = new Map<string, { codigo: string; nome: string | null; itens: LinhaPedido[] }>();
    for (const r of linhas) {
      const key = r.contrato?.id ?? "geral";
      if (!map.has(key)) map.set(key, { codigo: r.contrato?.codigo ?? "Geral", nome: r.contrato?.nome ?? "Depósito central", itens: [] });
      map.get(key)!.itens.push(r);
    }
    for (const grupo of map.values()) grupo.itens.sort((a, b) => a.produto.nome.localeCompare(b.produto.nome));
    return [...map.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [linhas]);

  const totalItens = linhas.length;
  const totalUnidades = linhas.reduce((s, r) => s + r.necessidade, 0);
  const totalCusto = linhas.reduce((s, r) => s + (r.valorNecessidade ?? 0), 0);
  const semCusto = linhas.filter((r) => r.valorNecessidade === null).length;

  const nomeContratoAtual = contratoFiltro
    ? contratoFiltro === "geral"
      ? "Geral"
      : contratos.find((c) => c.id === contratoFiltro)?.codigo ?? "contrato"
    : "todos-os-contratos";

  function exportar() {
    const ordenadas = porContrato.flatMap((g) => g.itens);
    const dados = ordenadas.map((r) => ({
      Contrato: r.contrato?.codigo ?? "Geral",
      Produto: r.produto.nome,
      Tamanho: r.produto.tamanho ?? "",
      Código: r.produto.codigo ?? "",
      CA: r.produto.ca ?? "",
      "Em Utilização": r.temDadoDeUso ? r.efetivoConsiderado : "sem dado",
      "Estoque Atual": r.estoqueAtual,
      "Estoque Mínimo": r.estoqueMinimo ?? "",
      "Quantidade a Comprar": r.necessidade,
      Unidade: r.produto.unidade,
      "Valor Unitário (R$)": r.produto.valorUnitario ?? "",
      "Valor Total do Item (R$)": r.valorNecessidade ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = [
      { wch: 12 }, { wch: 40 }, { wch: 10 }, { wch: 14 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedido de Compra");

    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Pedido_Compra_Estoque_Minimo_${nomeContratoAtual}_${hoje}.xlsx`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Estoque Mínimo — Pedido de Compra</h1>
          <p className="text-xs text-gray-400">
            Itens abaixo do mínimo calculado, agrupados por contrato — pra saber pra onde vai cada pedido e conferir se o mínimo bate com quem realmente usa.
          </p>
        </div>
        <div className="flex items-center gap-3">
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
          <button
            onClick={exportar}
            disabled={totalItens === 0}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⬇ Exportar pedido (.xlsx)
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-400">Itens a comprar</p>
          <p className="text-2xl font-semibold text-gray-800">{totalItens}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-400">Unidades a comprar (total)</p>
          <p className="text-2xl font-semibold text-gray-800">{totalUnidades}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-400">Custo estimado do pedido</p>
          <p className="text-2xl font-semibold text-gray-800">{fmtMoney(totalCusto)}</p>
          {semCusto > 0 && <p className="mt-1 text-[11px] text-amber-600">{semCusto} item(ns) sem valor unitário cadastrado — não entram nesse total</p>}
        </div>
      </div>

      <div className="space-y-4">
        {porContrato.map((grupo) => {
          const unidadesGrupo = grupo.itens.reduce((s, r) => s + r.necessidade, 0);
          const custoGrupo = grupo.itens.reduce((s, r) => s + (r.valorNecessidade ?? 0), 0);
          return (
            <div key={grupo.codigo} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-5 py-3">
                <h2 className="text-sm font-semibold text-gray-700">
                  Contrato {grupo.codigo} {grupo.nome ? `— ${grupo.nome}` : ""}
                </h2>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{grupo.itens.length} itens</span>
                  <span>{unidadesGrupo} unidades</span>
                  <span className="font-semibold text-gray-600">{fmtMoney(custoGrupo)}</span>
                </div>
              </div>
              <div className="max-h-[55vh] overflow-x-auto overflow-y-auto">
                <table className="w-full min-w-max text-xs">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="whitespace-nowrap border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                      <th className="px-3 py-2">Produto</th>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2 text-right" title="Quantos colaboradores ativos usam esse item, nesse tamanho, hoje — vem da ficha ou da matriz de função">Em Utilização</th>
                      <th className="px-3 py-2 text-right">Atual</th>
                      <th className="px-3 py-2 text-right" title="Em Utilização × % de contingência do contrato/categoria/produto">Mínimo</th>
                      <th className="px-3 py-2 text-right">Comprar</th>
                      <th className="px-3 py-2 text-right">Valor Unit.</th>
                      <th className="px-3 py-2 text-right">Valor do Item</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.itens.map((r) => (
                      <tr key={r.id} className="whitespace-nowrap border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-700">{r.produto.nome}</p>
                          {r.produto.tamanho && <p className="text-[10px] text-gray-400">Tamanho {r.produto.tamanho}{r.produto.higienizado && " · ♻️ Higienizada"}</p>}
                        </td>
                        <td className="px-3 py-2">
                          {r.produto.codigo && <span className="w-fit rounded-md bg-brand-light px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-dark">{r.produto.codigo}</span>}
                          {r.produto.ca && <span className="ml-1 w-fit rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-600">CA {r.produto.ca}</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {r.temDadoDeUso ? r.efetivoConsiderado : <span className="italic text-gray-300">sem dado</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500">{r.estoqueAtual}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{r.estoqueMinimo ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-semibold text-rose-600">{r.necessidade}</td>
                        <td className="px-3 py-2 text-right text-gray-400">{r.produto.valorUnitario !== null ? fmtMoney(r.produto.valorUnitario) : "—"}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-700">{r.valorNecessidade !== null ? fmtMoney(r.valorNecessidade) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {!carregando && porContrato.length === 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
            {contratoFiltro ? "Nenhum item abaixo do mínimo nesse contrato — nada a comprar agora." : "Nenhum item abaixo do mínimo em nenhum contrato — nada a comprar agora."}
          </div>
        )}
      </div>
    </div>
  );
}
