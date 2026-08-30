"use client";

import { useState } from "react";

type Contrato = { id: string; codigo: string; nome: string | null };
type Produto = { id: string; nome: string; unidade?: string };

type Linha = { produtoId: string; quantidade: number };

// Lançamento em lote — pra dar entrada de uma compra grande (nota fiscal com
// vários itens) numa tacada só, em vez de abrir o formulário item por item.
// Sempre um contrato + um tipo (entrada/saída) só, com várias linhas de
// produto+quantidade.
export default function EpiLoteForm({
  contratos,
  produtos,
  onClose,
  onSaved,
}: {
  contratos: Contrato[];
  produtos: Produto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [contratoId, setContratoId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([{ produtoId: "", quantidade: 1 }]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<number | null>(null);

  function atualizarLinha(i: number, campo: keyof Linha, valor: string | number) {
    setLinhas((prev) => prev.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }

  function adicionarLinha() {
    setLinhas((prev) => [...prev, { produtoId: "", quantidade: 1 }]);
  }

  function removerLinha(i: number) {
    setLinhas((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function salvar() {
    const validas = linhas.filter((l) => l.produtoId && l.quantidade > 0);
    if (!contratoId) {
      setErro("Escolha o contrato.");
      return;
    }
    if (validas.length === 0) {
      setErro("Adicione pelo menos um item com produto e quantidade.");
      return;
    }
    setSaving(true);
    setErro(null);
    const res = await fetch("/api/epi/movimentacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itens: validas.map((l) => ({
          tipo,
          produtoId: l.produtoId,
          contratoId,
          quantidade: l.quantidade,
          observacao: observacao || null,
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ? JSON.stringify(data.error) : "Erro ao salvar.");
      return;
    }
    const data = await res.json();
    setResultado(data.criadas ?? validas.length);
    setTimeout(onSaved, 900);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-lg font-semibold text-ink">Lançamento em lote</h3>
        <p className="mb-4 text-xs text-gray-400">
          Pra registrar uma compra grande (nota fiscal com vários itens) de uma vez, sem abrir o formulário item por item.
        </p>

        {resultado !== null ? (
          <div className="rounded-xl bg-brand-light p-4 text-sm font-medium text-brand-dark">✅ {resultado} movimentações registradas.</div>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              <button
                onClick={() => setTipo("ENTRADA")}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tipo === "ENTRADA" ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}
              >
                Entrada (compra)
              </button>
              <button
                onClick={() => setTipo("SAIDA")}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tipo === "SAIDA" ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-500"}`}
              >
                Saída (retirada)
              </button>
            </div>

            <label className="mb-4 block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Contrato (vale pra todos os itens do lote)</span>
              <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                <option value="">Selecione...</option>
                {contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} {c.nome ? `— ${c.nome}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="mb-3 space-y-2">
              {linhas.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={l.produtoId}
                    onChange={(e) => atualizarLinha(i, "produtoId", e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Selecione o produto...</option>
                    {produtos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={l.quantidade}
                    onChange={(e) => atualizarLinha(i, "quantidade", parseInt(e.target.value, 10) || 1)}
                    className="w-20 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                  />
                  <button onClick={() => removerLinha(i)} className="shrink-0 text-xs text-gray-400 hover:text-rose-600">
                    Remover
                  </button>
                </div>
              ))}
            </div>

            <button onClick={adicionarLinha} className="mb-4 text-sm font-medium text-brand-dark hover:underline">
              + Adicionar item
            </button>

            <label className="mb-4 block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Observação (opcional, vale pra todos os itens)</span>
              <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="ex: NF 12345" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>

            {erro && <p className="mb-3 text-xs text-rose-600">{erro}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">
                Cancelar
              </button>
              <button onClick={salvar} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                {saving ? "Salvando..." : `Registrar ${linhas.filter((l) => l.produtoId).length || ""} itens`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
