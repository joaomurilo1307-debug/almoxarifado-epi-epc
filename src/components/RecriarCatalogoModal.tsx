"use client";

import { useEffect, useState } from "react";

type Plano = {
  problemas: string[];
  atual: { produtos: number; estoques: number; movimentacoes: number; colaboradorItens: number };
  novo: { itens: number; familias: number; porTipo: Record<string, number> };
  aproveitados: { valorUnitario: number; foto: number };
  confirmacao: string;
};
type Resultado = { carregados: number; apagados: { produtos: number; estoques: number; movimentacoes: number }; aproveitados: { valorUnitario: number; foto: number }; backups: string[] };

const TIPO_ROTULO: Record<string, string> = { EPI: "EPI", FARDAMENTO: "Fardamento", GERAL: "Geral", EPC: "EPC" };

export default function RecriarCatalogoModal({ onClose, onFeito }: { onClose: () => void; onFeito: () => void }) {
  const [plano, setPlano] = useState<Plano | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [frase, setFrase] = useState("");
  const [gravando, setGravando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    fetch("/api/epi/catalogo/recriar")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Não foi possível montar a prévia.");
        setPlano(d);
      })
      .catch((e) => setErro(e.message));
  }, []);

  async function recriar() {
    setGravando(true);
    setErro(null);
    const res = await fetch("/api/epi/catalogo/recriar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmacao: frase }) });
    const d = await res.json().catch(() => ({}));
    setGravando(false);
    if (!res.ok) return setErro(typeof d.error === "string" ? d.error : "Não foi possível recriar o catálogo.");
    setResultado(d.resultado);
    onFeito();
  }

  const podeConfirmar = !!plano && plano.problemas.length === 0 && frase.trim().toUpperCase() === plano.confirmacao && !gravando;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-lg font-semibold text-ink">Recriar o catálogo do zero</h3>

        {resultado ? (
          <>
            <p className="my-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Catálogo recriado: <b>{resultado.carregados} itens</b> com código. Foram apagados {resultado.apagados.produtos} itens antigos, {resultado.apagados.estoques} linhas de estoque e {resultado.apagados.movimentacoes} movimentações.
              Preço de {resultado.aproveitados.valorUnitario} itens e foto de {resultado.aproveitados.foto} itens foram mantidos.
            </p>
            <p className="mb-4 text-xs text-gray-500">Cópia de segurança guardada no banco: {resultado.backups.join(", ")}.</p>
            <div className="flex justify-end">
              <button onClick={onClose} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Fechar</button>
            </div>
          </>
        ) : !plano && !erro ? (
          <p className="my-6 text-sm text-gray-400">Montando a prévia…</p>
        ) : plano ? (
          <>
            <p className="mb-4 text-xs text-gray-400">Nada é gravado até você confirmar. Antes de apagar, o sistema copia as tabelas para o banco.</p>
            <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <p className="font-semibold">Vai apagar</p>
              <p>{plano.atual.produtos} itens do cadastro atual, {plano.atual.estoques} linhas de estoque e {plano.atual.movimentacoes} movimentações.</p>
            </div>
            <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <p className="font-semibold">Vai criar</p>
              <p>{plano.novo.itens} itens ({plano.novo.familias} modelos), cada um com código, tamanho e categoria:</p>
              <p className="text-xs">{Object.entries(plano.novo.porTipo).map(([t, n]) => `${TIPO_ROTULO[t] ?? t}: ${n}`).join(" · ")}</p>
              <p className="mt-1 text-xs">Mantém o preço de {plano.aproveitados.valorUnitario} itens e a foto de {plano.aproveitados.foto} itens que já tinham.</p>
            </div>
            <p className="mb-3 text-xs text-gray-500">Não mexe em colaboradores, contratos, regras por função nem usuários.</p>
            {plano.problemas.length > 0 && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">A lista do catálogo tem problema e não pode ser carregada: {plano.problemas.slice(0, 3).join("; ")}</p>
            )}
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Para confirmar, digite: <b>{plano.confirmacao}</b></span>
              <input value={frase} onChange={(e) => setFrase(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            {erro && <p className="mb-3 text-sm text-rose-600">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={recriar} disabled={!podeConfirmar} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40">
                {gravando ? "Recriando…" : "Apagar e recriar"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="my-4 text-sm text-rose-600">{erro}</p>
            <div className="flex justify-end">
              <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
