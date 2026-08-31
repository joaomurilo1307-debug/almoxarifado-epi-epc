"use client";

import { useEffect, useMemo, useState } from "react";

type Contrato = { id: string; codigo: string; nome: string | null; percentualContingencia: number };
type Categoria = { categoria: string; percentualContingencia: number };
type Produto = { id: string; nome: string; tipo: string; categoria: string | null; percentualContingencia: number | null };

const ICONE_CATEGORIA: Record<string, string> = {
  EPI: "🦺",
  EPC: "🛡️",
  FARDAMENTO: "👕",
  "Material de Escritório": "🖇️",
  "Itens Veicular": "🚗",
  "Insumos Alojamento": "🛏️",
  "Depósito Geral": "📦",
};

// Stepper de %, reaproveitado nas 3 camadas (contrato / categoria / produto).
// value=null só existe na camada produto (significa "usa o padrão de cima").
function PercentStepper({
  value,
  onChange,
  allowNull,
}: {
  value: number | null;
  onChange: (novoPct: number | null) => void;
  allowNull?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const pct = value !== null ? Math.round(value * 100) : null;

  function ajustar(delta: number) {
    onChange(Math.min(100, Math.max(0, (pct ?? 10) + delta)));
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        onClick={() => ajustar(-1)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-base font-bold text-gray-600 hover:bg-gray-200"
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
            setEditando(false);
            if (rascunho.trim() === "" && allowNull) {
              onChange(null);
              return;
            }
            const v = parseFloat(rascunho.replace(",", "."));
            if (!Number.isNaN(v)) onChange(v);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder={allowNull ? "padrão" : undefined}
          className="w-16 rounded-lg border border-brand px-2 py-1.5 text-center text-base font-bold"
        />
      ) : (
        <button
          onClick={() => {
            setEditando(true);
            setRascunho(pct !== null ? String(pct) : "");
          }}
          className={`w-16 rounded-lg px-2 py-1.5 text-center text-base font-bold ${
            pct !== null ? "bg-brand-light text-brand-dark" : "bg-gray-100 text-gray-400"
          }`}
          title="Clique pra digitar"
        >
          {pct !== null ? `${pct}%` : "padrão"}
        </button>
      )}
      <button
        onClick={() => ajustar(1)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-base font-bold text-gray-600 hover:bg-gray-200"
        aria-label="Aumentar"
      >
        +
      </button>
    </div>
  );
}

export default function MetricasPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [buscaProduto, setBuscaProduto] = useState("");

  function reloadContratos() {
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
  }
  function reloadCategorias() {
    fetch("/api/epi/categorias").then((r) => r.json()).then(setCategorias).catch(() => {});
  }
  function reloadProdutos() {
    fetch("/api/epi/produtos").then((r) => r.json()).then(setProdutos).catch(() => {});
  }
  useEffect(() => {
    reloadContratos();
    reloadCategorias();
    reloadProdutos();
  }, []);

  async function salvarContrato(id: string, pct: number) {
    const v = Math.min(100, Math.max(0, pct));
    await fetch(`/api/epi/contratos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percentualContingencia: v / 100 }),
    });
    setContratos((prev) => prev.map((c) => (c.id === id ? { ...c, percentualContingencia: v / 100 } : c)));
  }

  async function salvarCategoria(categoria: string, pct: number) {
    const v = Math.min(100, Math.max(0, pct));
    await fetch(`/api/epi/categorias/${encodeURIComponent(categoria)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percentualContingencia: v / 100 }),
    });
    setCategorias((prev) => prev.map((c) => (c.categoria === categoria ? { ...c, percentualContingencia: v / 100 } : c)));
  }

  async function salvarProduto(id: string, pct: number | null) {
    const v = pct === null ? null : Math.min(100, Math.max(0, pct)) / 100;
    await fetch(`/api/epi/produtos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percentualContingencia: v }),
    });
    setProdutos((prev) => prev.map((p) => (p.id === id ? { ...p, percentualContingencia: v } : p)));
  }

  const produtosFiltrados = useMemo(
    () => produtos.filter((p) => !buscaProduto || p.nome.toLowerCase().includes(buscaProduto.toLowerCase())),
    [produtos, buscaProduto]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">Como o % de contingência funciona</h2>
        <p className="text-xs text-gray-400">
          O mínimo sugerido de cada item (visível na aba Estoque) é <strong>efetivo × %</strong>, sempre arredondado pra
          cima. O % é resolvido em 3 camadas, da mais específica pra mais genérica:{" "}
          <strong>produto → categoria → contrato</strong> (10% se nada estiver definido). O mínimo que realmente vale
          continua editável item a item, na aba Estoque — isso aqui só ajusta a sugestão.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">1. Por contrato (padrão geral)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contratos.map((c) => (
            <div key={c.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-gray-700">
                {c.codigo} {c.nome ? `— ${c.nome}` : ""}
              </p>
              <PercentStepper value={c.percentualContingencia} onChange={(v) => salvarContrato(c.id, v ?? 10)} />
            </div>
          ))}
          {contratos.length === 0 && <p className="text-sm text-gray-400">Nenhum contrato importado ainda.</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-sm font-semibold text-gray-700">2. Por categoria</h2>
        <p className="mb-3 text-xs text-gray-400">Sobrescreve o % do contrato pra todos os itens dessa categoria, de uma vez.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categorias.map((c) => (
            <div key={c.categoria} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <span>{ICONE_CATEGORIA[c.categoria] ?? "📦"}</span>
                {c.categoria}
              </p>
              <PercentStepper value={c.percentualContingencia} onChange={(v) => salvarCategoria(c.categoria, v ?? 10)} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-sm font-semibold text-gray-700">3. Por produto</h2>
        <p className="mb-3 text-xs text-gray-400">
          O ajuste mais específico — sobrescreve tanto o % da categoria quanto o do contrato, só pra esse item. Deixe em
          branco pra voltar a usar o padrão de cima.
        </p>
        <input
          value={buscaProduto}
          onChange={(e) => setBuscaProduto(e.target.value)}
          placeholder="Buscar produto..."
          className="mb-3 w-72 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 text-center">%</th>
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-2 font-medium text-gray-700">{p.nome}</td>
                  {/* Mesma regra do lib/epi.ts: só GERAL usa a categoria real como
                      chave do % — em EPI ela virou subcategoria de corpo (Catálogo),
                      dimensão diferente da config "2. Por categoria" acima. */}
                  <td className="px-4 py-2 text-xs text-gray-400">{p.tipo === "GERAL" ? p.categoria ?? p.tipo : p.tipo}</td>
                  <td className="px-4 py-2">
                    <PercentStepper value={p.percentualContingencia} onChange={(v) => salvarProduto(p.id, v)} allowNull />
                  </td>
                </tr>
              ))}
              {produtosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
