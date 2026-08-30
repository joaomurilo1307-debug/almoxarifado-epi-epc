"use client";

import { useEffect, useState } from "react";

type Contrato = { id: string; codigo: string; nome: string | null; percentualContingencia: number };

export default function MetricasPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");

  function reload() {
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
  }
  useEffect(reload, []);

  async function salvarPct(id: string, pctInteiro: number) {
    const pct = Math.min(100, Math.max(0, pctInteiro));
    await fetch(`/api/epi/contratos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percentualContingencia: pct / 100 }),
    });
    setContratos((prev) => prev.map((c) => (c.id === id ? { ...c, percentualContingencia: pct / 100 } : c)));
  }

  function ajustar(c: Contrato, delta: number) {
    const atual = Math.round(c.percentualContingencia * 100);
    salvarPct(c.id, atual + delta);
  }

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">% de contingência sugerido, por contrato</h2>
        <p className="text-xs text-gray-400">
          Referência pra calcular o mínimo a partir do efetivo (ex.: 10% = a cada 10 pessoas usando o item, 1 unidade de
          reserva). Use os botões pra ajustar rápido, ou clique no número pra digitar direto. O mínimo que realmente vale
          por item continua editável separadamente, na aba Estoque.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {contratos.map((c) => {
          const pct = Math.round(c.percentualContingencia * 100);
          const editando = editandoId === c.id;
          return (
            <div key={c.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-gray-700">
                {c.codigo} {c.nome ? `— ${c.nome}` : ""}
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => ajustar(c, -1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-600 hover:bg-gray-200"
                  aria-label="Diminuir"
                >
                  −
                </button>

                {editando ? (
                  <input
                    autoFocus
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    onBlur={() => {
                      const v = parseFloat(rascunho.replace(",", "."));
                      setEditandoId(null);
                      if (!Number.isNaN(v)) salvarPct(c.id, v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="w-16 rounded-lg border border-brand px-2 py-1.5 text-center text-lg font-bold"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditandoId(c.id);
                      setRascunho(String(pct));
                    }}
                    className="w-16 rounded-lg bg-brand-light px-2 py-1.5 text-center text-lg font-bold text-brand-dark"
                    title="Clique pra digitar"
                  >
                    {pct}%
                  </button>
                )}

                <button
                  onClick={() => ajustar(c, 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-600 hover:bg-gray-200"
                  aria-label="Aumentar"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
        {contratos.length === 0 && <p className="text-sm text-gray-400">Nenhum contrato importado ainda.</p>}
      </div>
    </div>
  );
}
