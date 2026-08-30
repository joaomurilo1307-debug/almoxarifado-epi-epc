"use client";

import { useEffect, useState } from "react";
import EpiMovimentacaoForm from "@/components/EpiMovimentacaoForm";

type DashboardData = {
  totalContratos: number;
  colaboradoresAtivos: number;
  totalItensMonitorados: number;
  itensAbaixoMinimo: number;
  necessidadeTotalCompra: number;
  valorEmEstoqueTotal: number;
  valorNecessidadeTotal: number;
  itensComCusto: number;
  porContrato: { contrato: { id: string; codigo: string; nome: string | null }; totalItens: number; abaixoMinimo: number }[];
  porCategoria: { tipo: string; categoria: string | null; total: number; abaixoMinimo: number }[];
  maisUsados: { produto: string; quantidade: number }[];
  consumoPorContrato: { contrato: string; quantidade: number }[];
  totalCriticos: number;
  criticos: {
    produto: string;
    tipo: string;
    categoria: string | null;
    contrato: string;
    estoqueAtual: number;
    estoqueMinimo: number;
    minimoSugerido: number;
    necessidade: number;
    valorNecessidade: number | null;
  }[];
  totalEmAtencao: number;
  emAtencao: { produto: string; contrato: string; estoqueAtual: number; estoqueMinimo: number }[];
  ultimasMovimentacoes: {
    id: string;
    tipo: "ENTRADA" | "SAIDA";
    quantidade: number;
    data: string;
    produto: { nome: string; unidade: string };
    contrato: { codigo: string } | null;
    colaborador: { nomeCompleto: string } | null;
  }[];
};

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <p className="text-3xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  );
}

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const ICONE_CATEGORIA: Record<string, string> = {
  EPI: "🦺",
  EPC: "🛡️",
  FARDAMENTO: "👕",
  "Material de Escritório": "🖇️",
  "Itens Veicular": "🚗",
  "Insumos Alojamento": "🛏️",
  "Depósito Geral": "📦",
};

function labelCategoria(tipo: string, categoria: string | null) {
  if (categoria) return categoria;
  if (tipo === "FARDAMENTO") return "Fardamento";
  return tipo;
}

export default function AlmoxarifadoDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [showQuick, setShowQuick] = useState(false);
  const [contratos, setContratos] = useState<{ id: string; codigo: string; nome: string | null }[]>([]);
  const [produtos, setProdutos] = useState<{ id: string; nome: string }[]>([]);
  const [colaboradores, setColaboradores] = useState<{ id: string; nomeCompleto: string; contratoId: string }[]>([]);

  useEffect(() => {
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
    fetch("/api/epi/produtos").then((r) => r.json()).then(setProdutos).catch(() => {});
    fetch("/api/epi/colaboradores").then((r) => r.json()).then(setColaboradores).catch(() => {});
  }, []);

  useEffect(() => {
    function reload() {
      fetch("/api/epi/dashboard")
        .then((r) => r.json())
        .then((d) => {
          setData(d);
          setAtualizadoEm(new Date());
        })
        .catch(() => {});
    }
    reload();
    const id = setInterval(reload, 20000); // ao vivo: atualiza sozinho a cada 20s
    return () => clearInterval(id);
  }, []);

  if (!data) return <p className="text-sm text-gray-400">Carregando...</p>;

  const maxContratoItens = Math.max(1, ...data.porContrato.map((c) => c.totalItens));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          Ao vivo · atualizado {atualizadoEm ? atualizadoEm.toLocaleTimeString("pt-BR") : "..."}
        </div>
        <button
          onClick={() => setShowQuick(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          ⚡ Movimentação rápida
        </button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Contratos monitorados" value={data.totalContratos} accent="bg-brand" />
        <KpiCard label="Colaboradores ativos" value={data.colaboradoresAtivos} accent="bg-brand-dark" />
        <KpiCard label="🟡 Perto do mínimo" value={data.totalEmAtencao} accent="bg-amber-400" />
        <KpiCard label="🔴 Itens abaixo do mínimo" value={data.itensAbaixoMinimo} accent="bg-accent" />
        <KpiCard label="Unidades a comprar (total)" value={data.necessidadeTotalCompra} accent="bg-accent-dark" />
      </div>

      {data.itensComCusto > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <KpiCard label={`Valor em estoque (${data.itensComCusto} itens com custo cadastrado)`} value={fmtMoney(data.valorEmEstoqueTotal)} accent="bg-brand" />
          <KpiCard label="Valor estimado pra repor o que está em falta" value={fmtMoney(data.valorNecessidadeTotal)} accent="bg-accent" />
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Itens monitorados por contrato</h2>
          <div className="space-y-3">
            {data.porContrato.map((c) => (
              <div key={c.contrato.id}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">
                    {c.contrato.codigo} {c.contrato.nome ? `— ${c.contrato.nome}` : ""}
                  </span>
                  <span className="text-gray-400">
                    {c.totalItens} itens{c.abaixoMinimo > 0 && <span className="ml-1 text-accent">· {c.abaixoMinimo} abaixo do mínimo</span>}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand to-brand-dark"
                    style={{ width: `${Math.max(4, (c.totalItens / maxContratoItens) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {data.porContrato.length === 0 && <p className="text-sm text-gray-400">Nenhum contrato importado ainda.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Distribuição por categoria</h2>
          <p className="mb-4 text-xs text-gray-400">EPI, EPC, Fardamento e cada categoria de item geral (escritório, veicular, alojamento, depósito), separados.</p>
          <div className="space-y-2">
            {data.porCategoria.map((c) => {
              const label = labelCategoria(c.tipo, c.categoria);
              return (
                <div key={`${c.tipo}-${c.categoria ?? ""}`} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <span>{ICONE_CATEGORIA[label] ?? "📦"}</span>
                    {label}
                    {c.categoria && <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-normal text-gray-500">Geral</span>}
                  </span>
                  <span className="text-xs text-gray-400">
                    {c.total} itens {c.abaixoMinimo > 0 && <span className="font-medium text-accent">· {c.abaixoMinimo} abaixo do mínimo</span>}
                  </span>
                </div>
              );
            })}
            {data.porCategoria.length === 0 && <p className="text-sm text-gray-400">Sem dados ainda.</p>}
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">📈 Itens mais usados</h2>
          <p className="mb-4 text-xs text-gray-400">Ranking pelo total de saídas já registradas no histórico.</p>
          <div className="space-y-2.5">
            {data.maisUsados.map((m, i) => {
              const max = data.maisUsados[0]?.quantidade || 1;
              return (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700">{m.produto}</span>
                    <span className="font-semibold text-gray-500">{m.quantidade}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-dark" style={{ width: `${Math.max(4, (m.quantidade / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            {data.maisUsados.length === 0 && <p className="text-sm text-gray-400">Nenhuma saída registrada ainda.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">📍 Onde consome mais</h2>
          <p className="mb-4 text-xs text-gray-400">Total de unidades retiradas, por contrato.</p>
          <div className="space-y-2.5">
            {data.consumoPorContrato.map((c, i) => {
              const max = data.consumoPorContrato[0]?.quantidade || 1;
              return (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700">{c.contrato}</span>
                    <span className="font-semibold text-gray-500">{c.quantidade}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-dark" style={{ width: `${Math.max(4, (c.quantidade / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            {data.consumoPorContrato.length === 0 && <p className="text-sm text-gray-400">Nenhuma saída registrada ainda.</p>}
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">🔴 Itens críticos — o que comprar agora</h2>
          {data.totalCriticos > data.criticos.length && (
            <span className="text-xs text-gray-400">
              mostrando {data.criticos.length} de {data.totalCriticos} · veja o resto na aba Estoque
            </span>
          )}
        </div>
        {data.criticos.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum item abaixo do mínimo. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-2">Produto</th>
                  <th className="pb-2">Categoria</th>
                  <th className="pb-2">Contrato</th>
                  <th className="pb-2 text-right">Atual</th>
                  <th className="pb-2 text-right">Mínimo</th>
                  <th className="pb-2 text-right" title="Calculado ao vivo: efetivo do contrato × % de contingência">Sugestão</th>
                  <th className="pb-2 text-right">Comprar</th>
                  <th className="pb-2 text-right">Custo estimado</th>
                </tr>
              </thead>
              <tbody>
                {data.criticos.map((c, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-medium text-gray-700">{c.produto}</td>
                    <td className="py-2 text-xs text-gray-500">
                      {ICONE_CATEGORIA[labelCategoria(c.tipo, c.categoria)] ?? "📦"} {labelCategoria(c.tipo, c.categoria)}
                    </td>
                    <td className="py-2 text-gray-500">{c.contrato}</td>
                    <td className="py-2 text-right text-gray-500">{c.estoqueAtual}</td>
                    <td className="py-2 text-right text-gray-500">{c.estoqueMinimo}</td>
                    <td className="py-2 text-right text-gray-400">{c.minimoSugerido}</td>
                    <td className="py-2 text-right font-semibold text-accent">{c.necessidade}</td>
                    <td className="py-2 text-right text-gray-400">{c.valorNecessidade !== null ? fmtMoney(c.valorNecessidade) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.emAtencao.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">🟡 Perto do mínimo — fique de olho</h2>
          <p className="mb-4 text-xs text-gray-400">
            Ainda não é crítico, mas já está a menos de 20% acima do mínimo — se não repor, vira "Comprar" em breve.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.emAtencao.map((e, i) => (
              <div key={i} className="rounded-xl bg-white px-4 py-2.5 text-sm shadow-sm">
                <p className="font-medium text-gray-700">{e.produto}</p>
                <p className="text-xs text-gray-400">
                  {e.contrato} · atual {e.estoqueAtual} / mínimo {e.estoqueMinimo}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Últimas movimentações</h2>
        <div className="space-y-2">
          {data.ultimasMovimentacoes.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    m.tipo === "ENTRADA" ? "bg-brand-light text-brand-dark" : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {m.tipo === "ENTRADA" ? "Entrada" : "Saída"}
                </span>
                <span className="font-medium text-gray-700">{m.produto.nome}</span>
                <span className="text-gray-400">× {m.quantidade}</span>
              </div>
              <div className="text-xs text-gray-400">
                {m.contrato?.codigo ?? "Geral"}
                {m.colaborador && ` · ${m.colaborador.nomeCompleto}`} · {new Date(m.data).toLocaleDateString("pt-BR")}
              </div>
            </div>
          ))}
          {data.ultimasMovimentacoes.length === 0 && <p className="text-sm text-gray-400">Nenhuma movimentação registrada ainda.</p>}
        </div>
      </div>

      {showQuick && (
        <EpiMovimentacaoForm
          contratos={contratos}
          produtos={produtos}
          colaboradores={colaboradores}
          onClose={() => setShowQuick(false)}
          onSaved={() => {
            setShowQuick(false);
            fetch("/api/epi/dashboard").then((r) => r.json()).then((d) => {
              setData(d);
              setAtualizadoEm(new Date());
            });
          }}
        />
      )}
    </div>
  );
}
