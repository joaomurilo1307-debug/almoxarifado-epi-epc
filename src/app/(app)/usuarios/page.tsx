"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Usuario = { id: string; name: string; email: string; role: "ADMIN" | "OPERADOR"; createdAt: string };

const ROLE_LABEL: Record<Usuario["role"], string> = { ADMIN: "Administrador", OPERADOR: "Operador" };
const ROLE_DESC: Record<Usuario["role"], string> = {
  ADMIN: "Vê e edita tudo, inclusive esta tela de usuários.",
  OPERADOR: "Vê e edita estoque, movimentações, colaboradores, catálogo e métricas — não gerencia outros usuários.",
};

export default function UsuariosPage() {
  const { data: sessionData, status } = useSession();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  function reload() {
    fetch("/api/epi/usuarios")
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error ?? "Erro ao carregar");
        }
        return r.json();
      })
      .then(setUsuarios)
      .catch((e) => setErroCarregar(e.message));
  }
  useEffect(reload, []);

  async function excluir(u: Usuario) {
    if (!confirm(`Excluir o acesso de ${u.name}?`)) return;
    const res = await fetch(`/api/epi/usuarios/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Erro ao excluir.");
      return;
    }
    reload();
  }

  // A página só existe de verdade pro ADMIN — a API já bloqueia (403) quem
  // não é, isso aqui é só pra não mostrar formulário pra quem vai apanhar da
  // API mesmo assim.
  if (status === "loading") return <p className="text-sm text-gray-400">Carregando...</p>;
  if ((sessionData?.user as any)?.role !== "ADMIN") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
        Essa tela é só pra administradores. Fale com um administrador do sistema se precisar de acesso.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">Quem pode entrar no sistema e o que cada um pode fazer.</p>
        <button onClick={() => setShowForm(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          + Novo usuário
        </button>
      </div>

      {erroCarregar && <p className="mb-3 text-sm text-rose-600">{erroCarregar}</p>}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail (login)</th>
              <th className="px-4 py-3">Acesso</th>
              <th className="px-4 py-3">Desde</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-2.5 font-medium text-gray-700">
                  {u.name}
                  {u.id === (sessionData?.user as any)?.id && <span className="ml-2 text-xs text-gray-400">(você)</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-500">{u.email}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      u.role === "ADMIN" ? "bg-brand-light text-brand-dark" : "bg-gray-100 text-gray-600"
                    }`}
                    title={ROLE_DESC[u.role]}
                  >
                    {ROLE_LABEL[u.role]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-400">{new Date(u.createdAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => setEditando(u)} className="mr-3 text-xs font-medium text-brand-dark hover:underline">
                    Editar
                  </button>
                  <button onClick={() => excluir(u)} className="text-xs font-medium text-gray-400 hover:text-rose-600">
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && !erroCarregar && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum usuário ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 text-xs text-gray-500 shadow-sm">
        <p className="mb-1 font-semibold text-gray-600">O que cada acesso vê</p>
        <p><strong>Administrador</strong> — {ROLE_DESC.ADMIN}</p>
        <p><strong>Operador</strong> — {ROLE_DESC.OPERADOR}</p>
      </div>

      {showForm && (
        <UsuarioForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {editando && (
        <UsuarioForm
          usuario={editando}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function gerarSenha() {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return s;
}

function UsuarioForm({ usuario, onClose, onSaved }: { usuario?: Usuario; onClose: () => void; onSaved: () => void }) {
  const editandoExistente = !!usuario;
  const [name, setName] = useState(usuario?.name ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [role, setRole] = useState<Usuario["role"]>(usuario?.role ?? "OPERADOR");
  const [password, setPassword] = useState(editandoExistente ? "" : gerarSenha());
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  async function salvar() {
    setSaving(true);
    setErro(null);
    const url = editandoExistente ? `/api/epi/usuarios/${usuario!.id}` : "/api/epi/usuarios";
    const method = editandoExistente ? "PATCH" : "POST";
    const body = editandoExistente
      ? { name: name.trim(), role, ...(password.trim() ? { password: password.trim() } : {}) }
      : { name: name.trim(), email: email.trim(), role, password };
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(typeof data.error === "string" ? data.error : JSON.stringify(data.error) || "Erro ao salvar.");
      return;
    }
    if (!editandoExistente) {
      // Mostra a senha gerada antes de fechar — depois disso ela não aparece
      // mais em nenhum lugar (só o hash fica salvo).
      setSalvo(true);
      return;
    }
    onSaved();
  }

  if (salvo) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onSaved}>
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
          <h3 className="mb-1 text-lg font-semibold text-ink">Usuário criado ✅</h3>
          <p className="mb-4 text-xs text-gray-500">Anote agora — essa senha não aparece de novo em nenhuma tela.</p>
          <div className="mb-4 space-y-2 rounded-xl bg-gray-50 p-4 text-sm">
            <p><span className="text-gray-400">Login:</span> <span className="font-mono font-semibold">{email.trim()}</span></p>
            <p><span className="text-gray-400">Senha:</span> <span className="font-mono font-semibold">{password}</span></p>
          </div>
          <button onClick={onSaved} className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
            Ok, já anotei
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-ink">{editandoExistente ? `Editar ${usuario!.name}` : "Novo usuário"}</h3>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">E-mail (usado pra fazer login)</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            disabled={editandoExistente}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Acesso</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Usuario["role"])} className="w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="OPERADOR">Operador — usa o sistema no dia a dia</option>
            <option value="ADMIN">Administrador — também gerencia usuários</option>
          </select>
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            {editandoExistente ? "Nova senha (deixe em branco pra manter a atual)" : "Senha (gerada — pode trocar se quiser)"}
          </span>
          <div className="flex gap-2">
            <input value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono" />
            {!editandoExistente && (
              <button type="button" onClick={() => setPassword(gerarSenha())} className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50">
                Gerar outra
              </button>
            )}
          </div>
        </label>

        {erro && <p className="mb-3 text-xs text-rose-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving || !name.trim() || (!editandoExistente && (!email.trim() || !password.trim()))} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
