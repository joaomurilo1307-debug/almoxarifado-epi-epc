"use client";

import { useState } from "react";

export default function TrocarSenhaModal({ onClose }: { onClose: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  async function salvar() {
    if (nova.length < 8) return setErro("A nova senha precisa ter pelo menos 8 caracteres.");
    if (nova !== confirma) return setErro("A confirmação não é igual à nova senha.");
    setSaving(true);
    setErro(null);
    const res = await fetch("/api/epi/minha-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ atual, nova }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErro(typeof data.error === "string" ? data.error : "Não foi possível trocar a senha.");
    setFeito(true);
  }

  const campo = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-lg font-semibold text-ink">Trocar minha senha</h3>
        {feito ? (
          <>
            <p className="my-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Senha trocada. Use a nova no próximo acesso.</p>
            <div className="flex justify-end">
              <button onClick={onClose} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Fechar</button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-4 text-xs text-gray-400">Só você sabe a nova senha — nem o administrador consegue ver.</p>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Senha atual</span>
              <input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} autoFocus className={campo} />
            </label>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Nova senha (mínimo 8 caracteres)</span>
              <input type="password" value={nova} onChange={(e) => setNova(e.target.value)} className={campo} />
            </label>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Repita a nova senha</span>
              <input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} className={campo} />
            </label>
            {erro && <p className="mb-3 text-xs text-rose-600">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={salvar} disabled={saving || !atual || !nova} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                {saving ? "Salvando..." : "Trocar senha"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
