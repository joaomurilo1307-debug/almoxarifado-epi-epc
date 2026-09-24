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

// Chave de produto pro pivot: nome + tamanho + higienizado é exatamente o
// que identifica um EpiProduto único (@@unique do schema) — cada linha do
// pivot é "esse item, nesse tamanho", nunca mistura tamanhos diferentes.
function chaveProduto(r: LinhaPedido) {
  return `${r.produto.nome}__${r.produto.tamanho ?? ""}__${r.produto.higienizado ? "H" : ""}`;
}

// Destino físico de entrega — João explicou (24/09/2026): o pedido não é
// entregue contrato por contrato, é entregue por LOCAL. Contrato com código
// numérico (3581, 3686, 3687, 3748, 4343...) vai tudo pro ECC; os contratos
// AGA (CB/CDS/QZ) vão junto com a Sede, no mesmo destino. "Geral" (sem
// contrato, depósito central) fica separado dos dois.
function destinoDe(codigoContrato: string | null): string {
  if (codigoContrato === null) return "Geral";
  if (codigoContrato === "ECC") return "ECC";
  if (codigoContrato === "Sede") return "Sede";
  if (codigoContrato.startsWith("AGA")) return "Sede";
  if (/^\d+$/.test(codigoContrato)) return "ECC";
  return codigoContrato; // fallback: contrato novo/desconhecido vira o proprio destino, nunca some
}

export default function EstoqueMinimoPage() {
  const [todasLinhas, setTodasLinhas] = useState<LinhaPedido[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    setCarregando(true);
    fetch("/api/epi/estoque")
      .then((r) => r.json())
      .then(setTodasLinhas)
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  const linhas = useMemo(() => todasLinhas.filter((r) => r.necessidade > 0), [todasLinhas]);

  // Colunas do pivot: um DESTINO físico por coluna (não um contrato por
  // coluna) — só entra quem tem pelo menos um item a comprar. Geral primeiro,
  // depois alfabética.
  const colunasContrato = useMemo(() => {
    const set = new Set<string>();
    for (const r of linhas) set.add(destinoDe(r.contrato?.codigo ?? null));
    const entradas = [...set].sort((a, b) => {
      if (a === "Geral") return -1;
      if (b === "Geral") return 1;
      return a.localeCompare(b);
    });
    return entradas.map((d) => [d, d] as [string, string]); // mantem o formato [chave, rotulo]
  }, [linhas]);

  // Pivot: uma linha por produto+tamanho, uma coluna por contrato com a
  // quantidade a comprar PRA AQUELE contrato — assim quem for comprar o
  // total do fornecedor já sabe de cara como distribuir entre os contratos
  // (pedido do João, 24/09/2026: "ela tem que saber quanto vai mandar pra
  // cada contrato... ela tem que distribuir a compra de estoque mínimo").
  const pivot = useMemo(() => {
    type Linha = {
      chave: string;
      produto: LinhaPedido["produto"];
      porContrato: Map<string, number>; // chave contrato -> necessidade
      total: number;
      valorTotal: number | null;
    };
    const map = new Map<string, Linha>();
    for (const r of linhas) {
      const key = chaveProduto(r);
      if (!map.has(key)) map.set(key, { chave: key, produto: r.produto, porContrato: new Map(), total: 0, valorTotal: r.produto.valorUnitario !== null ? 0 : null });
      const linha = map.get(key)!;
      const destino = destinoDe(r.contrato?.codigo ?? null);
      linha.porContrato.set(destino, (linha.porContrato.get(destino) ?? 0) + r.necessidade);
      linha.total += r.necessidade;
      if (linha.valorTotal !== null && r.valorNecessidade !== null) linha.valorTotal += r.valorNecessidade;
    }
    return [...map.values()].sort((a, b) => a.produto.nome.localeCompare(b.produto.nome) || (a.produto.tamanho ?? "").localeCompare(b.produto.tamanho ?? ""));
  }, [linhas]);

  const totalItens = pivot.length;
  const totalUnidades = linhas.reduce((s, r) => s + r.necessidade, 0);
  const totalCusto = linhas.reduce((s, r) => s + (r.valorNecessidade ?? 0), 0);
  const semCusto = pivot.filter((p) => p.valorTotal === null).length;

  function exportar() {
    const dadosPivot = pivot.map((p) => {
      const linha: Record<string, string | number> = {
        Produto: p.produto.nome,
        Tamanho: p.produto.tamanho ?? "",
        Código: p.produto.codigo ?? "",
      };
      for (const [chaveContrato, rotulo] of colunasContrato) {
        linha[rotulo] = p.porContrato.get(chaveContrato) ?? 0;
      }
      linha["TOTAL A COMPRAR"] = p.total;
      linha["Valor Unitário (R$)"] = p.produto.valorUnitario ?? "";
      linha["Valor Total (R$)"] = p.valorTotal ?? "";
      return linha;
    });

    const wsPivot = XLSX.utils.json_to_sheet(dadosPivot);
    wsPivot["!cols"] = [
      { wch: 40 }, { wch: 10 }, { wch: 14 },
      ...colunasContrato.map(() => ({ wch: 12 })),
      { wch: 16 }, { wch: 16 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsPivot, "Distribuição por Destino");

    // Segunda aba: detalhe linha a linha (produto+contrato+dados de cálculo),
    // pra quem quiser conferir de onde veio cada número do resumo.
    const dadosDetalhe = linhas.map((r) => ({
      Contrato: r.contrato?.codigo ?? "Geral",
      Produto: r.produto.nome,
      Tamanho: r.produto.tamanho ?? "",
      Código: r.produto.codigo ?? "",
      "Em Utilização": r.temDadoDeUso ? r.efetivoConsiderado : "sem dado",
      "Estoque Atual": r.estoqueAtual,
      "Estoque Mínimo": r.estoqueMinimo ?? "",
      "Quantidade a Comprar": r.necessidade,
      "Valor Unitário (R$)": r.produto.valorUnitario ?? "",
      "Valor Total do Item (R$)": r.valorNecessidade ?? "",
    }));
    const wsDetalhe = XLSX.utils.json_to_sheet(dadosDetalhe);
    wsDetalhe["!cols"] = [
      { wch: 12 }, { wch: 40 }, { wch: 10 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDetalhe, "Detalhe por linha");

    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Pedido_Compra_Estoque_Minimo_${hoje}.xlsx`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Estoque Mínimo — Pedido de Compra</h1>
          <p className="text-xs text-gray-400">
            Quanto comprar de cada item e como distribuir entre os contratos — pra fechar o pedido com o fornecedor e depois separar o que vai pra cada lugar.
          </p>
        </div>
        <button
          onClick={exportar}
          disabled={totalItens === 0}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⬇ Exportar pedido (.xlsx)
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-400">Itens (produto+tamanho) a comprar</p>
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

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-700">Distribuição por destino de entrega</h2>
          <p className="text-xs text-gray-400">
            O total é o que pedir pro fornecedor. Cada coluna é pra onde entregar depois — ECC recebe todo contrato numérico (3581, 3686...), Sede recebe os contratos AGA junto com o que é da própria Sede.
          </p>
        </div>
        <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-max text-xs">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="whitespace-nowrap border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2">Código</th>
                {colunasContrato.map(([chave, rotulo]) => (
                  <th key={chave} className="px-3 py-2 text-right">{rotulo}</th>
                ))}
                <th className="px-3 py-2 text-right font-bold text-gray-500">Total</th>
                <th className="px-3 py-2 text-right">Valor Unit.</th>
                <th className="px-3 py-2 text-right">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {pivot.map((p) => (
                <tr key={p.chave} className="whitespace-nowrap border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-700">{p.produto.nome}</p>
                    {p.produto.tamanho && <p className="text-[10px] text-gray-400">Tamanho {p.produto.tamanho}{p.produto.higienizado && " · ♻️ Higienizada"}</p>}
                  </td>
                  <td className="px-3 py-2">
                    {p.produto.codigo && <span className="w-fit rounded-md bg-brand-light px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-dark">{p.produto.codigo}</span>}
                  </td>
                  {colunasContrato.map(([chave]) => {
                    const qtd = p.porContrato.get(chave);
                    return (
                      <td key={chave} className="px-3 py-2 text-right">
                        {qtd ? <span className="font-semibold text-rose-600">{qtd}</span> : <span className="text-gray-200">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-bold text-gray-800">{p.total}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{p.produto.valorUnitario !== null ? fmtMoney(p.produto.valorUnitario) : "—"}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-700">{p.valorTotal !== null ? fmtMoney(p.valorTotal) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!carregando && pivot.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">Nenhum item abaixo do mínimo em nenhum contrato — nada a comprar agora.</div>
        )}
      </div>
    </div>
  );
}
