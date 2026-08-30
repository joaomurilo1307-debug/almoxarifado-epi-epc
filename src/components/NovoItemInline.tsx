"use client";

import { useState } from "react";

export type ProdutoCriado = { id: string; nome: string; unidade: string };

const CATEGORIAS_GERAL = ["Material de Escritório", "Itens Veicular", "Insumos Alojamento", "Depósito Geral"];
const UNIDADES = ["UNID", "PAR(ES)", "CX", "PC", "KG", "L", "M"];

// Escape hatch da seleção de produto nos formulários de movimentação: por
// padrão o operador só pode ESCOLHER um item já cadastrado (lista suspensa,
// sem digitar nome à mão — evita erro de digitação/duplicidade). Isso aqui só
// aparece quando ela explicitamente pede pra cadastrar um item novo que ainda
// não existe no catálogo.
export default function NovoItemInline({ onCancel, onCreated }: { onCancel: () => void; onCreated: (p: ProdutoCriado) => void }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"EPI" | "EPC" | "FARDAMENTO" | "GERAL">("EPI");
  const [categoria, setCategoria] = useState(CATEGORIAS_GERAL[0]);
  const [unidade, setUnidade] = useState("UNID");
  const [fabricante, setFabricante] = useState("");
  const [ca, setCa] = useState("");
  const [tamanho, setTamanho] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    if (!nome.trim()) {
      setErro("Digite o nome do item.");
      return;
    }
    setSaving(true);
    setErro(null);
    const res = await fetch("/api/epi/produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: nome.trim(),
        tipo,
        categoria: tipo === "GERAL" ? categoria : null,
        unidade,
        fabricante: fabricante.trim() || null,
        ca: ca.trim() || null,
        tamanho: tamanho.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ? JSON.stringify(data.error) : "Erro ao cadastrar — já deve existir um item com esse nome.");
      return;
    }
    const produto = await res.json();
    onCreated({ id: produto.id, nome: produto.nome, unidade: produto.unidade });
  }

  return (
    <div className="rounded-xl border border-dashed border-brand bg-brand-light/40 p-3">
      <p className="mb-2 text-xs font-semibold text-brand-dark">📦 Cadastrar item novo no catálogo</p>

      <label className="mb-2 block text-sm">
        <span className="mb-1 block text-xs font-medium text-gray-500">Nome do item</span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
          placeholder="ex: Luva de raspa cano longo"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="EPI">EPI</option>
            <option value="EPC">EPC</option>
            <option value="FARDAMENTO">Fardamento</option>
            <option value="GERAL">Geral (escritório, veicular, alojamento...)</option>
          </select>
        </label>
        {tipo === "GERAL" ? (
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Categoria</span>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {CATEGORIAS_GERAL.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Unidade</span>
            <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {tipo === "GERAL" && (
        <label className="mb-2 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Unidade</span>
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mb-2 grid grid-cols-3 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Fabricante (opcional)</span>
          <input value={fabricante} onChange={(e) => setFabricante(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">CA (opcional)</span>
          <input value={ca} onChange={(e) => setCa(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Tamanho (opcional)</span>
          <input value={tamanho} onChange={(e) => setTamanho(e.target.value)} placeholder="ex: 42, M, G" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
      </div>

      {erro && <p className="mb-2 text-xs text-rose-600">{erro}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600">
          Cancelar
        </button>
        <button
          onClick={criar}
          disabled={saving}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {saving ? "Cadastrando..." : "Cadastrar e usar"}
        </button>
      </div>
    </div>
  );
}
