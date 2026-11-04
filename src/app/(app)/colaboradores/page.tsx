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
  nascimento: string | null;
  admissao: string | null;
  moradia: string | null;
  endereco: string | null;
  numero: string | null;
  contrato: { id: string; codigo: string; nome: string | null };
};

function fmtData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// yyyy-mm-dd pro value de <input type="date"> — sempre em UTC pra não
// "voltar um dia" dependendo do fuso do navegador.
function paraInputDate(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function ColaboradoresPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<Colaborador | null>(null);
  const [novoColaborador, setNovoColaborador] = useState(false);
  const [novoContrato, setNovoContrato] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [funcoes, setFuncoes] = useState<string[]>([]);

  function reload() {
    const qs = busca ? `?q=${encodeURIComponent(busca)}` : "";
    fetch(`/api/epi/colaboradores${qs}`)
      .then((r) => r.json())
      .then((lista: Colaborador[]) => {
        setColaboradores(lista);
        // sugestões de função = as que já existem no cadastro (só quando a lista não está filtrada)
        if (!busca) setFuncoes([...new Set(lista.map((c) => c.funcao))].sort((a, b) => a.localeCompare(b, "pt-BR")));
      })
      .catch(() => {});
  }

  function reloadContratos() {
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
  }

  useEffect(() => {
    const t = setTimeout(reload, 250);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    reloadContratos();
  }, []);

  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir ${nome}? Isso remove o cadastro dele — movimentações já registradas em nome dele continuam no histórico.`)) return;
    await fetch(`/api/epi/colaboradores/${id}`, { method: "DELETE" });
    reload();
  }

  const porContrato = useMemo(() => {
    const map = new Map<string, { codigo: string; nome: string | null; itens: Colaborador[] }>();
    // Contrato recém-cadastrado aparece na hora, mesmo sem ninguém (só quando não há busca).
    if (!busca) for (const c of contratos) map.set(c.id, { codigo: c.codigo, nome: c.nome, itens: [] });
    for (const c of colaboradores) {
      const key = c.contrato.id;
      if (!map.has(key)) map.set(key, { codigo: c.contrato.codigo, nome: c.contrato.nome, itens: [] });
      map.get(key)!.itens.push(c);
    }
    return [...map.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [colaboradores, contratos, busca]);

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
        <div className="ml-auto flex gap-2">
          <button onClick={() => setNovoContrato(true)} className="rounded-lg border border-brand px-3 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-light">
            + Novo contrato
          </button>
          <button
            onClick={() => setNovoColaborador(true)}
            disabled={contratos.length === 0}
            title={contratos.length === 0 ? "Cadastre um contrato primeiro" : undefined}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Novo colaborador
          </button>
        </div>
      </div>

      {aviso && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="text-emerald-700 hover:underline">fechar</button>
        </div>
      )}

      <div className="space-y-6">
        {porContrato.map((grupo) => (
          <div key={grupo.codigo} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-700">
                Contrato {grupo.codigo} {grupo.nome ? `— ${grupo.nome}` : ""}
              </h2>
              <span className="text-xs text-gray-400">{grupo.itens.length} pessoas</span>
            </div>
            {grupo.itens.length === 0 && <p className="px-5 py-4 text-sm text-gray-400">Nenhum colaborador neste contrato ainda.</p>}
            <div className={grupo.itens.length === 0 ? "hidden" : "max-h-[65vh] overflow-x-auto overflow-y-auto"}>
              <table className="w-full min-w-max text-sm">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="whitespace-nowrap text-left text-xs uppercase tracking-wide text-gray-400">
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
                      <tr className="whitespace-nowrap border-t border-gray-50 hover:bg-gray-50/60">
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
                            <div className="grid grid-cols-3 gap-x-6 gap-y-1 sm:grid-cols-4">
                              <span>CPF: {c.cpf ?? "—"}</span>
                              <span>RG: {c.rg ?? "—"}</span>
                              <span>Nascimento: {fmtData(c.nascimento)}</span>
                              <span>Admissão: {fmtData(c.admissao)}</span>
                              <span>Moradia: {c.moradia ?? "—"}</span>
                              <span>Endereço: {c.endereco ?? "—"}</span>
                              <span>Número: {c.numero ?? "—"}</span>
                            </div>
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
          <p className="text-sm text-gray-400">Nenhum contrato ou colaborador cadastrado ainda — cadastre acima ou importe uma planilha em "Importar planilha".</p>
        )}
      </div>

      {novoContrato && (
        <NovoContratoModal
          onClose={() => setNovoContrato(false)}
          onSaved={(c) => {
            setNovoContrato(false);
            reloadContratos();
            setAviso(`Contrato ${c.codigo} cadastrado. Agora cadastre os colaboradores dele — eles entram no cálculo do pedido sozinhos.`);
          }}
        />
      )}

      {novoColaborador && (
        <NovoColaboradorModal
          contratos={contratos}
          funcoes={funcoes}
          onClose={() => setNovoColaborador(false)}
          onSaved={(nome, itens) => {
            setNovoColaborador(false);
            reload();
            reloadContratos();
            setAviso(`${nome} cadastrado. O estoque mínimo já foi recalculado (${itens} itens necessários no total).`);
          }}
        />
      )}

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
  const [cpf, setCpf] = useState(colaborador.cpf ?? "");
  const [rg, setRg] = useState(colaborador.rg ?? "");
  const [nascimento, setNascimento] = useState(paraInputDate(colaborador.nascimento));
  const [admissao, setAdmissao] = useState(paraInputDate(colaborador.admissao));
  const [moradia, setMoradia] = useState(colaborador.moradia ?? "");
  const [endereco, setEndereco] = useState(colaborador.endereco ?? "");
  const [numero, setNumero] = useState(colaborador.numero ?? "");
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
        cpf: cpf.trim() || null,
        rg: rg.trim() || null,
        nascimento: nascimento || null,
        admissao: admissao || null,
        moradia: moradia.trim() || null,
        endereco: endereco.trim() || null,
        numero: numero.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(typeof data.error === "string" ? data.error : data.error ? JSON.stringify(data.error) : "Erro ao salvar.");
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

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Dados pessoais</p>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">CPF</span>
            <input value={cpf} onChange={(e) => setCpf(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">RG</span>
            <input value={rg} onChange={(e) => setRg(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Nascimento</span>
            <input value={nascimento} onChange={(e) => setNascimento(e.target.value)} type="date" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Admissão</span>
            <input value={admissao} onChange={(e) => setAdmissao(e.target.value)} type="date" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Moradia</p>
        <div className="mb-4 grid grid-cols-3 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Situação</span>
            <input value={moradia} onChange={(e) => setMoradia(e.target.value)} placeholder="Residente/Alojamento..." className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="col-span-2 block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Endereço</span>
            <input value={endereco} onChange={(e) => setEndereco(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Número</span>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
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

function NovoContratoModal({ onClose, onSaved }: { onClose: () => void; onSaved: (c: { codigo: string }) => void }) {
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [percentual, setPercentual] = useState("10");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cod = codigo.trim();
  const abastecidoPor = !cod ? null : cod.toUpperCase() === "ECC" || /^\d+$/.test(cod) ? "ECC" : "Geral";

  async function salvar() {
    const pct = parseFloat(percentual.replace(",", "."));
    if (!cod) return setErro("Informe o código do contrato.");
    if (Number.isNaN(pct) || pct < 0 || pct > 100) return setErro("A contingência precisa estar entre 0 e 100.");
    setSaving(true);
    setErro(null);
    const res = await fetch("/api/epi/contratos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: cod, nome: nome.trim() || null, percentualContingencia: pct / 100 }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(typeof data.error === "string" ? data.error : "Não foi possível cadastrar o contrato.");
      return;
    }
    onSaved(data);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-lg font-semibold text-ink">Novo contrato</h3>
        <p className="mb-4 text-xs text-gray-400">Cada contrato é um centro de custo no pedido de compra do estoque mínimo.</p>
        <div className="mb-3 grid grid-cols-3 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Código *</span>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ex.: 4401" autoFocus className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="col-span-2 block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: MRN LT 4401" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
        </div>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Contingência do estoque mínimo (%)</span>
          <input value={percentual} onChange={(e) => setPercentual(e.target.value)} className="w-32 rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        {abastecidoPor && (
          <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Este contrato será abastecido pelo <b>{abastecidoPor}</b>
            {abastecidoPor === "ECC" ? " (código só com números = MRN)." : " (Sede, AGA e demais ficam no Geral)."}
          </p>
        )}
        {erro && <p className="mb-3 text-xs text-rose-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {saving ? "Salvando..." : "Cadastrar contrato"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NovoColaboradorModal({
  contratos,
  funcoes,
  onClose,
  onSaved,
}: {
  contratos: Contrato[];
  funcoes: string[];
  onClose: () => void;
  onSaved: (nome: string, itens: number) => void;
}) {
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [contratoId, setContratoId] = useState(contratos[0]?.id ?? "");
  const [funcao, setFuncao] = useState("");
  const [situacao, setSituacao] = useState("ATIVO");
  const [admissao, setAdmissao] = useState("");
  const [tamanhoBota, setTamanhoBota] = useState("");
  const [tamanhoCamisa, setTamanhoCamisa] = useState("");
  const [tamanhoCalca, setTamanhoCalca] = useState("");
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [moradia, setMoradia] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nomeCompleto.trim()) return setErro("Informe o nome completo.");
    if (!contratoId) return setErro("Escolha o contrato.");
    if (!funcao.trim()) return setErro("Informe a função — é ela que define os EPIs da pessoa.");
    setSaving(true);
    setErro(null);
    const res = await fetch("/api/epi/colaboradores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nomeCompleto: nomeCompleto.trim(),
        contratoId,
        funcao: funcao.trim(),
        situacao,
        admissao: admissao || null,
        tamanhoBota: tamanhoBota.trim() ? parseInt(tamanhoBota, 10) : null,
        tamanhoCamisa: tamanhoCamisa.trim().toUpperCase() || null,
        tamanhoCalca: tamanhoCalca.trim() ? parseInt(tamanhoCalca, 10) : null,
        cpf: cpf.trim() || null,
        rg: rg.trim() || null,
        nascimento: nascimento || null,
        moradia: moradia.trim() || null,
        endereco: endereco.trim() || null,
        numero: numero.trim() || null,
      }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(typeof data.error === "string" ? data.error : "Não foi possível cadastrar. Confira os campos.");
      return;
    }
    onSaved(nomeCompleto.trim(), data.recalculo?.totalLinhasGeradas ?? 0);
  }

  const campo = "w-full rounded-lg border border-gray-300 px-3 py-2";
  const rotulo = "mb-1 block text-xs font-medium text-gray-500";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-lg font-semibold text-ink">Novo colaborador</h3>
        <p className="mb-4 text-xs text-gray-400">Ao salvar, o estoque mínimo e o pedido de compra já contam essa pessoa.</p>

        <label className="mb-3 block text-sm">
          <span className={rotulo}>Nome completo *</span>
          <input value={nomeCompleto} onChange={(e) => setNomeCompleto(e.target.value)} autoFocus className={campo} />
        </label>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className={rotulo}>Contrato *</span>
            <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className={campo}>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} {c.nome ? `— ${c.nome}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className={rotulo}>Situação</span>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className={campo}>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
            </select>
          </label>
        </div>
        <label className="mb-3 block text-sm">
          <span className={rotulo}>Função *</span>
          <input value={funcao} onChange={(e) => setFuncao(e.target.value)} list="funcoes-existentes" placeholder="Escolha uma existente ou digite" className={campo} />
          <datalist id="funcoes-existentes">
            {funcoes.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <span className="mt-1 block text-[11px] text-gray-400">Use o mesmo nome do cadastro de EPI por função para os itens da função entrarem sozinhos.</span>
        </label>
        <div className="mb-3 grid grid-cols-3 gap-2">
          <label className="block text-sm">
            <span className={rotulo}>Bota</span>
            <input value={tamanhoBota} onChange={(e) => setTamanhoBota(e.target.value)} type="number" className={campo} />
          </label>
          <label className="block text-sm">
            <span className={rotulo}>Camisa</span>
            <input value={tamanhoCamisa} onChange={(e) => setTamanhoCamisa(e.target.value)} list="tamanhos-camisa" placeholder="P/M/G..." className={campo} />
            <datalist id="tamanhos-camisa">
              {["PP", "P", "M", "G", "GG", "XG", "EXG"].map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm">
            <span className={rotulo}>Calça</span>
            <input value={tamanhoCalca} onChange={(e) => setTamanhoCalca(e.target.value)} type="number" className={campo} />
          </label>
        </div>
        <label className="mb-3 block text-sm">
          <span className={rotulo}>Admissão</span>
          <input value={admissao} onChange={(e) => setAdmissao(e.target.value)} type="date" className={campo} />
        </label>

        <details className="mb-4 rounded-lg border border-gray-200 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-400">Dados pessoais e moradia (opcional)</summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className={rotulo}>CPF</span>
              <input value={cpf} onChange={(e) => setCpf(e.target.value)} className={campo} />
            </label>
            <label className="block text-sm">
              <span className={rotulo}>RG</span>
              <input value={rg} onChange={(e) => setRg(e.target.value)} className={campo} />
            </label>
            <label className="block text-sm">
              <span className={rotulo}>Nascimento</span>
              <input value={nascimento} onChange={(e) => setNascimento(e.target.value)} type="date" className={campo} />
            </label>
            <label className="block text-sm">
              <span className={rotulo}>Moradia</span>
              <input value={moradia} onChange={(e) => setMoradia(e.target.value)} placeholder="Residente/Alojamento..." className={campo} />
            </label>
            <label className="col-span-2 block text-sm">
              <span className={rotulo}>Endereço</span>
              <input value={endereco} onChange={(e) => setEndereco(e.target.value)} className={campo} />
            </label>
            <label className="block text-sm">
              <span className={rotulo}>Número</span>
              <input value={numero} onChange={(e) => setNumero(e.target.value)} className={campo} />
            </label>
          </div>
        </details>

        {erro && <p className="mb-3 text-xs text-rose-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {saving ? "Salvando..." : "Cadastrar colaborador"}
          </button>
        </div>
      </div>
    </div>
  );
}
