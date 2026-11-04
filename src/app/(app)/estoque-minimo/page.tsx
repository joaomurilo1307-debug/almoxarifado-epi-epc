"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { montarPedidoPorCentro, type LinhaParaRateio } from "@/lib/pedidoPorCentro";

type Contrato = { id: string; codigo: string; nome: string | null };
type LinhaPedido = {
  id: string;
  produto: { id: string; nome: string; tipo: string; ca: string | null; codigo: string | null; tamanho: string | null; higienizado: boolean; unidade: string; valorUnitario: number | null };
  contrato: Contrato | null;
  estoqueAtual: number;
  estoqueMinimo: number | null;
  efetivoConsiderado: number | null;
  temDadoDeUso: boolean;
  necessidade: number;
  valorNecessidade: number | null;
  efetivoPorCentro: Record<string, number> | null;
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
  const [editandoProdutoId, setEditandoProdutoId] = useState<string | null>(null);
  const [rascunhoValor, setRascunhoValor] = useState("");
  const [contratosAtivos, setContratosAtivos] = useState<string[]>([]);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  function reload() {
    setCarregando(true);
    Promise.all([
      fetch("/api/epi/estoque").then((r) => r.json()),
      fetch("/api/epi/contratos").then((r) => r.json()),
    ])
      .then(([linhasApi, contratosApi]) => {
        if (Array.isArray(linhasApi)) setTodasLinhas(linhasApi);
        if (Array.isArray(contratosApi)) setContratosAtivos(contratosApi.filter((c: { ativo: boolean }) => c.ativo).map((c: { codigo: string }) => c.codigo));
        setAtualizadoEm(new Date());
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }

  useEffect(reload, []);

  // O pedido por centro de custo acompanha o estoque: ao voltar para esta aba (depois de dar entrada, cadastrar
  // colaborador ou contrato em outra tela), recarrega sozinho.
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, []);

  async function salvarValorUnitario(produtoId: string) {
    const texto = rascunhoValor.trim();
    const valor = texto ? parseFloat(texto.replace(",", ".")) : null;
    setEditandoProdutoId(null);
    await fetch(`/api/epi/produtos/${produtoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valorUnitario: valor !== null && !Number.isNaN(valor) ? valor : null }),
    });
    reload();
  }

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

  // Mesma compra de cima, repartida por centro de custo (contrato), como na tela de Colaboradores.
  const porCentro = useMemo(() => montarPedidoPorCentro(linhas as unknown as LinhaParaRateio[], contratosAtivos), [linhas, contratosAtivos]);
  const gruposCentro = useMemo(
    () =>
      (["GERAL", "ECC"] as const)
        .map((g) => ({ grupo: g, rotulo: g === "GERAL" ? "Geral — Sede e AGA" : "ECC — contratos MRN e ECC", centros: porCentro.centros.filter((c) => c.grupo === g) }))
        .filter((g) => g.centros.length > 0),
    [porCentro]
  );

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

    // Terceira aba: o mesmo pedido separado por centro de custo (contrato), com subtotal por grupo e total.
    const dadosCentro = porCentro.linhas.map((l) => {
      const linha: Record<string, string | number> = { Produto: l.produto.nome, Tamanho: l.produto.tamanho ?? "", Código: l.produto.codigo ?? "" };
      for (const g of gruposCentro) {
        for (const c of g.centros) linha[c.codigo] = l.porCentro[c.codigo] ?? 0;
        linha[`Subtotal ${g.grupo === "GERAL" ? "Geral" : "ECC"}`] = g.centros.reduce((s, c) => s + (l.porCentro[c.codigo] ?? 0), 0);
      }
      linha["TOTAL A COMPRAR"] = l.total;
      linha["Valor Unitário (R$)"] = l.produto.valorUnitario ?? "";
      linha["Valor Total (R$)"] = l.valorTotal ?? "";
      return linha;
    });
    const totais: Record<string, string | number> = { Produto: "TOTAL (unidades)", Tamanho: "", Código: "" };
    const valores: Record<string, string | number> = { Produto: "TOTAL (R$)", Tamanho: "", Código: "" };
    for (const g of gruposCentro) {
      for (const c of g.centros) { totais[c.codigo] = porCentro.totalPorCentro[c.codigo]; valores[c.codigo] = Math.round(porCentro.valorPorCentro[c.codigo] * 100) / 100; }
      totais[`Subtotal ${g.grupo === "GERAL" ? "Geral" : "ECC"}`] = g.centros.reduce((s, c) => s + porCentro.totalPorCentro[c.codigo], 0);
      valores[`Subtotal ${g.grupo === "GERAL" ? "Geral" : "ECC"}`] = Math.round(g.centros.reduce((s, c) => s + porCentro.valorPorCentro[c.codigo], 0) * 100) / 100;
    }
    totais["TOTAL A COMPRAR"] = porCentro.totalUnidades;
    valores["TOTAL A COMPRAR"] = Math.round(porCentro.totalValor * 100) / 100;
    const wsCentro = XLSX.utils.json_to_sheet([...dadosCentro, totais, valores]);
    wsCentro["!cols"] = [{ wch: 40 }, { wch: 10 }, { wch: 14 }, ...Array(gruposCentro.reduce((n, g) => n + g.centros.length + 1, 0) + 3).fill({ wch: 12 })];
    XLSX.utils.book_append_sheet(wb, wsCentro, "Por Centro de Custo");

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
                  <td className="px-3 py-2 text-right">
                    {editandoProdutoId === p.produto.id ? (
                      <input
                        autoFocus
                        value={rascunhoValor}
                        onChange={(e) => setRascunhoValor(e.target.value)}
                        onBlur={() => salvarValorUnitario(p.produto.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") salvarValorUnitario(p.produto.id);
                          if (e.key === "Escape") setEditandoProdutoId(null);
                        }}
                        placeholder="0,00"
                        className="w-20 rounded border border-brand px-1.5 py-0.5 text-right text-xs"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditandoProdutoId(p.produto.id);
                          setRascunhoValor(p.produto.valorUnitario !== null ? String(p.produto.valorUnitario) : "");
                        }}
                        className="text-gray-400 underline decoration-dotted hover:text-brand-dark"
                        title="Clique pra editar o valor unitário"
                      >
                        {p.produto.valorUnitario !== null ? fmtMoney(p.produto.valorUnitario) : "definir"}
                      </button>
                    )}
                  </td>
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

      <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 bg-gray-50 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Pedido por centro de custo (contrato)</h2>
            <p className="max-w-3xl text-xs text-gray-400">
              A mesma compra da tabela de cima, repartida entre os contratos na proporção de pessoas ativas de cada um que usam o item. O estoque é um só por
              destino (ECC ou Geral); aqui você vê quanto da compra é de cada centro de custo. Atualiza sozinho com o estoque, os colaboradores e os contratos.
            </p>
          </div>
          <div className="text-right text-[11px] text-gray-400">
            {porCentro.totalUnidades === totalUnidades ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">✓ confere com o pedido de cima ({totalUnidades} un.)</span>
            ) : (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700">diferença: {porCentro.totalUnidades} × {totalUnidades} un.</span>
            )}
            {atualizadoEm && <p className="mt-1">Atualizado às {atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
            <button onClick={reload} className="mt-1 text-brand-dark underline">atualizar agora</button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-max text-xs">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="whitespace-nowrap border-b border-gray-100 text-[10px] uppercase tracking-wide text-gray-400">
                <th colSpan={2} className="px-3 py-1" />
                {gruposCentro.map((g) => (
                  <th key={g.grupo} colSpan={g.centros.length + 1} className={`border-l border-gray-100 px-3 py-1 text-center font-semibold ${g.grupo === "GERAL" ? "text-sky-600" : "text-emerald-600"}`}>
                    {g.rotulo}
                  </th>
                ))}
                <th colSpan={3} className="border-l border-gray-100 px-3 py-1" />
              </tr>
              <tr className="whitespace-nowrap border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2">Código</th>
                {gruposCentro.map((g) => (
                  <Fragment key={g.grupo}>
                    {g.centros.map((c, i) => (
                      <th key={c.codigo} className={`px-3 py-2 text-right ${i === 0 ? "border-l border-gray-100" : ""}`}>{c.codigo}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-bold text-gray-500">Subtotal</th>
                  </Fragment>
                ))}
                <th className="border-l border-gray-100 px-3 py-2 text-right font-bold text-gray-500">Total</th>
                <th className="px-3 py-2 text-right">Valor Unit.</th>
                <th className="px-3 py-2 text-right">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {porCentro.linhas.map((l) => (
                <tr key={l.chave} className="whitespace-nowrap border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-700">{l.produto.nome}</p>
                    {l.produto.tamanho && <p className="text-[10px] text-gray-400">Tamanho {l.produto.tamanho}{l.produto.higienizado && " · ♻️ Higienizada"}</p>}
                  </td>
                  <td className="px-3 py-2">
                    {l.produto.codigo && <span className="w-fit rounded-md bg-brand-light px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-dark">{l.produto.codigo}</span>}
                  </td>
                  {gruposCentro.map((g) => (
                    <Fragment key={g.grupo}>
                      {g.centros.map((c, i) => {
                        const q = l.porCentro[c.codigo];
                        return (
                          <td key={c.codigo} className={`px-3 py-2 text-right ${i === 0 ? "border-l border-gray-100" : ""}`}>
                            {q ? <span className="font-semibold text-rose-600">{q}</span> : <span className="text-gray-200">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-gray-600">{g.centros.reduce((s, c) => s + (l.porCentro[c.codigo] ?? 0), 0) || <span className="text-gray-200">—</span>}</td>
                    </Fragment>
                  ))}
                  <td className="border-l border-gray-100 px-3 py-2 text-right font-bold text-gray-800">{l.total}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{l.produto.valorUnitario !== null ? fmtMoney(l.produto.valorUnitario) : "—"}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-700">{l.valorTotal !== null ? fmtMoney(l.valorTotal) : "—"}</td>
                </tr>
              ))}
            </tbody>
            {porCentro.linhas.length > 0 && (
              <tfoot className="sticky bottom-0 bg-gray-50 text-xs font-semibold text-gray-700">
                <tr className="whitespace-nowrap border-t border-gray-200">
                  <td colSpan={2} className="px-3 py-2">Total de unidades</td>
                  {gruposCentro.map((g) => (
                    <Fragment key={g.grupo}>
                      {g.centros.map((c) => (
                        <td key={c.codigo} className="px-3 py-2 text-right">{porCentro.totalPorCentro[c.codigo] || <span className="text-gray-300">0</span>}</td>
                      ))}
                      <td className="px-3 py-2 text-right">{g.centros.reduce((s, c) => s + porCentro.totalPorCentro[c.codigo], 0)}</td>
                    </Fragment>
                  ))}
                  <td className="px-3 py-2 text-right">{porCentro.totalUnidades}</td>
                  <td />
                  <td className="px-3 py-2 text-right">{fmtMoney(porCentro.totalValor)}</td>
                </tr>
                <tr className="whitespace-nowrap">
                  <td colSpan={2} className="px-3 py-2">Valor estimado (R$)</td>
                  {gruposCentro.map((g) => (
                    <Fragment key={g.grupo}>
                      {g.centros.map((c) => (
                        <td key={c.codigo} className="px-3 py-2 text-right">{porCentro.valorPorCentro[c.codigo] ? fmtMoney(porCentro.valorPorCentro[c.codigo]) : <span className="text-gray-300">—</span>}</td>
                      ))}
                      <td className="px-3 py-2 text-right">{fmtMoney(g.centros.reduce((s, c) => s + porCentro.valorPorCentro[c.codigo], 0))}</td>
                    </Fragment>
                  ))}
                  <td className="px-3 py-2 text-right">{fmtMoney(porCentro.totalValor)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!carregando && porCentro.linhas.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">Nada a comprar agora — nenhum centro de custo com item abaixo do mínimo.</div>
        )}
        {porCentro.semValor > 0 && <p className="border-t border-gray-100 px-5 py-2 text-[11px] text-amber-600">{porCentro.semValor} item(ns) sem valor unitário cadastrado — não entram nos valores.</p>}
      </div>
    </div>
  );
}
