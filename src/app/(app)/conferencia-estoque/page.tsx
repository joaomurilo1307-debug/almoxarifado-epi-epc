"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { LinhaConferencia, ResultadoConferencia, StatusLinha } from "@/lib/conferenciaEstoque";

const ROTULO: Record<StatusLinha, { texto: string; classe: string }> = {
  IGUAL: { texto: "Confere", classe: "bg-emerald-50 text-emerald-700" },
  DIFERENTE: { texto: "Diferente", classe: "bg-rose-50 text-rose-700" },
  CONFLITO: { texto: "Conflito", classe: "bg-amber-50 text-amber-700" },
  SEM_CADASTRO: { texto: "Sem cadastro", classe: "bg-sky-50 text-sky-700" },
  PROVAVEL: { texto: "Provável", classe: "bg-violet-50 text-violet-700" },
};

const FILTROS: { id: StatusLinha | "TODOS"; texto: string }[] = [
  { id: "DIFERENTE", texto: "Diferentes" },
  { id: "CONFLITO", texto: "Conflitos" },
  { id: "SEM_CADASTRO", texto: "Sem cadastro" },
  { id: "PROVAVEL", texto: "Prováveis" },
  { id: "IGUAL", texto: "Conferem" },
  { id: "TODOS", texto: "Todos" },
];

function fmtData(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function ConferenciaEstoquePage() {
  const { data: sessao } = useSession();
  const admin = (sessao?.user as any)?.role === "ADMIN";
  const [dados, setDados] = useState<ResultadoConferencia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<StatusLinha | "TODOS">("DIFERENTE");
  const [aplicando, setAplicando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    fetch("/api/epi/estoque/conferencia")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Erro ao conferir");
        setDados(j);
        setErro(null);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }
  useEffect(carregar, []);

  async function aplicar(acao: "corrigir" | "cadastrar" | "zerarGeral", quantos: number) {
    const msg =
      acao === "zerarGeral"
        ? `Zerar o estoque inicial de ${quantos} item(ns) do depósito Geral que são cópia exata da lista do ECC (planilha "Estoque do ECC" de 29/08)?\n\nNão apaga nada: só coloca 0 no estoque inicial desses itens no Geral, com cópia de segurança antes. O estoque do ECC não muda.`
        : acao === "corrigir"
        ? `Corrigir o estoque do ECC de ${quantos} item(ns) para a contagem de ${dados ? fmtData(dados.dataInventario) : "14/09"}?\n\nÉ feita uma cópia de segurança antes. Nenhuma movimentação é apagada: o que foi movimentado depois da contagem continua somando.`
        : `Cadastrar ${quantos} item(ns) que estão no inventário e não existem no sistema, já com o estoque do ECC?\n\nÉ feita uma cópia de segurança antes.`;
    if (!confirm(msg)) return;
    setAplicando(true);
    setAviso(null);
    const res = await fetch("/api/epi/estoque/conferencia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }) });
    const j = await res.json().catch(() => ({}));
    setAplicando(false);
    if (!res.ok) return setErro(j.error ?? "Não foi possível aplicar.");
    setErro(null);
    setDados(j.conferencia);
    setAviso(`${j.resultado.alterados} item(ns) ${acao === "cadastrar" ? "cadastrado(s)" : acao === "zerarGeral" ? "zerado(s) no Geral" : "corrigido(s)"}. Cópia de segurança: ${j.resultado.backup ?? "—"}.`);
  }

  const linhas = useMemo(() => (dados ? dados.linhas.filter((l) => filtro === "TODOS" || l.status === filtro) : []), [dados, filtro]);
  const r = dados?.resumo;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Conferência do estoque do ECC</h1>
          <p className="max-w-3xl text-xs text-gray-400">
            Compara o estoque do sistema com o inventário físico {dados ? `de ${fmtData(dados.dataInventario)}` : ""}. O estoque é a base do pedido de compra: se estiver diferente da
            prateleira, o sistema manda comprar o que já existe. A correção ajusta o estoque inicial para a contagem e preserva todas as movimentações.
          </p>
        </div>
        <button onClick={carregar} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">Conferir de novo</button>
      </div>

      {erro && <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{erro}</p>}
      {aviso && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{aviso}</p>}
      {carregando && !dados && <p className="text-sm text-gray-400">Conferindo...</p>}

      {r && dados && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card titulo="Itens no inventário" valor={r.itensInventario} sub={`${r.unidadesInventario} unidades contadas`} />
            <Card titulo="Estoque do ECC no sistema hoje" valor={r.unidadesSistemaHoje} sub="unidades" />
            <Card titulo="Diferentes da contagem" valor={r.diferentes} sub={`${r.unidadesACorrigir} unidades de diferença`} destaque={r.diferentes > 0} />
            <Card titulo="Sem cadastro" valor={r.semCadastro} sub={`${r.provaveis} prováveis · ${r.conflitos} conflitos`} />
          </div>

          {r.geralDuplicadoItens > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <b>Confira o depósito Geral:</b> {r.geralDuplicadoItens} item(ns) ({r.geralDuplicadoUnidades} unidades) têm no Geral exatamente a quantidade da aba "Estoque do ECC" da planilha INFORMAÇÕES GERAIS - MRN
              (29/08/2026) — a lista do ECC, que foi carregada sem contrato. Se o Geral/Sede não tem estoque próprio desses itens, ele está contado duas vezes e dá para zerar só essas cópias (o ECC não muda).
              <b> Se tem estoque próprio, não zere:</b> mande o inventário do Geral/Sede para carregar.
              {admin && (
                <button onClick={() => aplicar("zerarGeral", r.geralDuplicadoItens)} disabled={aplicando} className="ml-3 rounded-lg border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40">
                  Zerar {r.geralDuplicadoItens} cópia(s) no Geral
                </button>
              )}
            </div>
          )}

          {admin && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={() => aplicar("corrigir", r.diferentes)}
                disabled={aplicando || r.diferentes === 0}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                Corrigir {r.diferentes} item(ns) para a contagem
              </button>
              <button
                onClick={() => aplicar("cadastrar", r.semCadastro)}
                disabled={aplicando || r.semCadastro === 0}
                className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cadastrar {r.semCadastro} item(ns) que faltam
              </button>
              {aplicando && <span className="self-center text-xs text-gray-400">Aplicando...</span>}
            </div>
          )}
          {!admin && <p className="mb-4 text-xs text-gray-400">Só o administrador aplica a correção.</p>}

          <div className="mb-3 flex flex-wrap gap-1">
            {FILTROS.map((f) => {
              const n = f.id === "TODOS" ? dados.linhas.length : dados.linhas.filter((l) => l.status === f.id).length;
              return (
                <button
                  key={f.id}
                  onClick={() => setFiltro(f.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${filtro === f.id ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {f.texto} ({n})
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="max-h-[68vh] overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-max text-xs">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="whitespace-nowrap border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="px-3 py-2">Item do inventário</th>
                    <th className="px-3 py-2">Cadastro no sistema</th>
                    <th className="px-3 py-2 text-right">Inventário</th>
                    <th className="px-3 py-2 text-right">Sistema na data</th>
                    <th className="px-3 py-2 text-right">Diferença</th>
                    <th className="px-3 py-2 text-right">Depois da contagem</th>
                    <th className="px-3 py-2 text-right">Geral (mesmo item)</th>
                    <th className="px-3 py-2">Situação</th>
                    <th className="px-3 py-2">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <Linha key={l.chave} l={l} />
                  ))}
                </tbody>
              </table>
            </div>
            {linhas.length === 0 && <p className="p-8 text-center text-sm text-gray-400">Nada nesta situação.</p>}
          </div>

          {dados.soSistema.length > 0 && (
            <details className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 text-xs text-gray-600 shadow-sm">
              <summary className="cursor-pointer font-semibold text-gray-700">{dados.soSistema.length} item(ns) com estoque no ECC do sistema que não estão no inventário (não são alterados)</summary>
              <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                {dados.soSistema.map((s) => (
                  <li key={s.produtoId}>
                    {s.nome}
                    {s.tamanho ? ` · tam. ${s.tamanho}` : ""}
                    {s.higienizado ? " · higienizada" : ""}: <b>{s.atualHoje}</b>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Card({ titulo, valor, sub, destaque }: { titulo: string; valor: number; sub: string; destaque?: boolean }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-400">{titulo}</p>
      <p className={`text-2xl font-semibold ${destaque ? "text-rose-600" : "text-gray-800"}`}>{valor}</p>
      <p className="text-[11px] text-gray-400">{sub}</p>
    </div>
  );
}

function Linha({ l }: { l: LinhaConferencia }) {
  const s = l.sistema;
  const rot = ROTULO[l.status];
  return (
    <tr className="whitespace-nowrap border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
      <td className="px-3 py-2">
        <p className="font-medium text-gray-700">{l.inventario.nomes[0]}</p>
        {l.inventario.nomes.length > 1 && <p className="text-[10px] text-amber-600">{l.inventario.nomes.length} linhas no inventário somadas</p>}
      </td>
      <td className="px-3 py-2 text-gray-500">
        {s ? (
          <>
            {s.nome}
            {s.tamanho ? <span className="text-gray-400"> · tam. {s.tamanho}</span> : null}
            {s.higienizado ? <span className="text-gray-400"> · ♻️</span> : null}
          </>
        ) : l.candidato ? (
          <span className="text-violet-600">{l.candidato.nome}{l.candidato.tamanho ? ` · tam. ${l.candidato.tamanho}` : ""}</span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2 text-right font-semibold text-gray-800">{l.inventario.atual}</td>
      <td className="px-3 py-2 text-right text-gray-600">{s ? s.atualNaData : "—"}</td>
      <td className={`px-3 py-2 text-right font-semibold ${l.diferenca === 0 ? "text-gray-300" : l.diferenca > 0 ? "text-emerald-600" : "text-rose-600"}`}>
        {s || l.status === "SEM_CADASTRO" ? (l.diferenca > 0 ? `+${l.diferenca}` : l.diferenca) : "—"}
      </td>
      <td className="px-3 py-2 text-right text-gray-500">{s && s.depoisDaData !== 0 ? (s.depoisDaData > 0 ? `+${s.depoisDaData}` : s.depoisDaData) : "—"}</td>
      <td className="px-3 py-2 text-right text-gray-500">{l.geralMesmoItem > 0 ? l.geralMesmoItem : "—"}</td>
      <td className="px-3 py-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${rot.classe}`}>{rot.texto}</span>
      </td>
      <td className="max-w-md truncate px-3 py-2 text-gray-400" title={l.nota}>{l.nota ?? ""}</td>
    </tr>
  );
}
