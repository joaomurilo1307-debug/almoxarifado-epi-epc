"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type Contrato = { id: string; codigo: string; nome: string | null };
type Colaborador = {
  id: string;
  nomeCompleto: string;
  funcao: string;
  situacao: string;
  tamanhoBota: number | null;
  tamanhoCamisa: string | null;
  tamanhoCalca: number | null;
  cpf: string | null;
  rg: string | null;
  moradia: string | null;
  endereco: string | null;
  contrato: { id: string; codigo: string; nome: string | null };
};

export default function ColaboradoresPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<Colaborador | null>(null);

  function reload() {
    const qs = busca ? `?q=${encodeURIComponent(busca)}` : "";
    fetch(`/api/epi/colaboradores${qs}`).then((r) => r.json()).then(setColaboradores).catch(() => {});
  }

  useEffect(() => {
    const t = setTimeout(reload, 250);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
  }, []);

  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir ${nome}? Isso remove o cadastro dele — movimentações já registradas em nome dele continuam no histórico.`)) return;
    await fetch(`/api/epi/colaboradores/${id}`, { method: "DELETE" });
    reload();
  }

  const porContrato = useMemo(() => {
    const map = new Map<string, { codigo: string; nome: string | null; itens: Colaborador[] }>();
    for (const c of colaboradores) {
      const key = c.contrato.id;
      if (!map.has(key)) map.set(key, { codigo: c.contrato.codigo, nome: c.contrato.nome, itens: [] });
      map.get(key)!.itens.push(c);
    }
    return [...map.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [colaboradores]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou função..."
          className="w-80 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-gray-400">{colaboradores.length} colaboradores</span>
      </div>

      <div className="space-y-6">
        {porContrato.map((grupo) => (
          <div key={grupo.codigo} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-700">
                Contrato {grupo.codigo} {grupo.nome ? `— ${grupo.nome}` : ""}
              </h2>
              <span className="text-xs text-gray-400">{grupo.itens.length} pessoas</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-2">Nome</th>
                    <th className="px-5 py-2">Função</th>
                    <th className="px-5 py-2">Situação</th>
                    <th className="px-5 py-2">Bota</th>
                    <th className="px-5 py-2">Camisa</th>
                    <th className="px-5 py-2">Calça</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {grupo.itens.map((c) => (
                    <Fragment key={c.id}>
                      <tr className="border-t border-gray-50 hover:bg-gray-50/60">
                        <td className="px-5 py-2 font-medium text-gray-700">{c.nomeCompleto}</td>
                        <td className="px-5 py-2 text-gray-500">{c.funcao}</td>
                        <td className="px-5 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              c.situacao === "ATIVO" ? "bg-brand-light text-brand-dark" : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {c.situacao}
                          </span>
                        </td>
                        <td className="px-5 py-2 text-gray-500">{c.tamanhoBota ?? "—"}</td>
                        <td className="px-5 py-2 text-gray-500">{c.tamanhoCamisa ?? "—"}</td>
                        <td className="px-5 py-2 text-gray-500">{c.tamanhoCalca ?? "—"}</td>
                        <td className="px-5 py-2 text-right">
                          <button onClick={() => setEditando(c)} className="mr-3 text-xs font-medium text-brand-dark hover:underline">
                            Editar
                          </button>
                          <button
                            onClick={() => setAberto(aberto === c.id ? null : c.id)}
                            className="mr-3 text-xs font-medium text-gray-500 hover:underline"
                          >
                            {aberto === c.id ? "Fechar" : "Detalhes"}
                          </button>
                          <button onClick={() => excluir(c.id, c.nomeCompleto)} className="text-xs font-medium text-gray-400 hover:text-rose-600">
                            Excluir
                          </button>
                        </td>
                      </tr>
                      {aberto === c.id && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={7} className="px-5 py-3 text-xs text-gray-500">
                            <span className="mr-4">CPF: {c.cpf ?? "—"}</span>
                            <span className="mr-4">RG: {c.rg ?? "—"}</span>
                            <span className="mr-4">Moradia: {c.moradia ?? "—"}</span>
                            <span>Endereço: {c.endereco ?? "—"}</span>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {porContrato.length === 0 && (
          <p className="text-sm text-gray-400">Nenhum colaborador cadastrado ainda — importe uma planilha em "Importar planilha".</p>
        )}
      </div>

      {editando && (
        <EditarColaboradorModal
          colaborador={editando}
          contratos={contratos}
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

function EditarColaboradorModal({
  colaborador,
  contratos,
  onClose,
  onSaved,
}: {
  colaborador: Colaborador;
  contratos: Contrato[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [funcao, setFuncao] = useState(colaborador.funcao);
  const [situacao, setSituacao] = useState(colaborador.situacao);
  const [contratoId, setContratoId] = useState(colaborador.contrato.id);
  const [tamanhoBota, setTamanhoBota] = useState(colaborador.tamanhoBota?.toString() ?? "");
  const [tamanhoCamisa, setTamanhoCamisa] = useState(colaborador.tamanhoCamisa ?? "");
  const [tamanhoCalca, setTamanhoCalca] = useState(colaborador.tamanhoCalca?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSaving(true);
    setErro(null);
    const res = await fetch(`/api/epi/colaboradores/${colaborador.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        funcao: funcao.trim(),
        situacao,
        contratoId,
        tamanhoBota: tamanhoBota.trim() ? parseInt(tamanhoBota, 10) : null,
        tamanhoCamisa: tamanhoCamisa.trim() || null,
        tamanhoCalca: tamanhoCalca.trim() ? parseInt(tamanhoCalca, 10) : null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ? JSON.stringify(data.error) : "Erro ao salvar — talvez já exista alguém com esse nome nesse contrato.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-lg font-semibold text-ink">{colaborador.nomeCompleto}</h3>
        <p className="mb-4 text-xs text-gray-400">Contrato atual: {colaborador.contrato.codigo}</p>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Transferir para o contrato</span>
          <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} {c.nome ? `— ${c.nome}` : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Função</span>
            <input value={funcao} onChange={(e) => setFuncao(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Situação</span>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
            </select>
          </label>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Bota</span>
            <input value={tamanhoBota} onChange={(e) => setTamanhoBota(e.target.value)} type="number" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Camisa</span>
            <input value={tamanhoCamisa} onChange={(e) => setTamanhoCamisa(e.target.value)} placeholder="P/M/G..." className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Calça</span>
            <input value={tamanhoCalca} onChange={(e) => setTamanhoCalca(e.target.value)} type="number" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
        </div>

        {erro && <p className="mb-3 text-xs text-rose-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
