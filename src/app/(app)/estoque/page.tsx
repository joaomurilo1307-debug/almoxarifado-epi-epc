"use client";

import { useEffect, useMemo, useState } from "react";

type Linha = {
  produtoId: string;
  codigo: string | null;
  nome: string;
  tamanho: string | null;
  higienizado: boolean;
  tipo: "EPI" | "EPC" | "FARDAMENTO" | "GERAL";
  categoria: string | null;
  unidade: string;
  quantidades: Record<string, number>;
  total: number;
};
type Deposito = { codigo: string; nome: string | null; unidades: number; itens: number };

const TAMANHO_LETRA_ORDEM = ["PP", "P", "M", "G", "GG", "XG", "XXG"];
function compararTamanho(a: Linha, b: Linha) {
  const ca = a.tamanho ?? "", cb = b.tamanho ?? "";
  const na = Number(ca), nb = Number(cb);
  if (ca !== "" && cb !== "" && !Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  const ia = TAMANHO_LETRA_ORDEM.indexOf(ca), ib = TAMANHO_LETRA_ORDEM.indexOf(cb);
  if (ia >= 0 && ib >= 0 && ia !== ib) return ia - ib;
  if (ca !== cb) return ca.localeCompare(cb, "pt-BR", { numeric: true });
  return Number(a.higienizado) - Number(b.higienizado);
}

const TIPO_ROTULO: Record<Linha["tipo"], string> = { EPI: "EPI", EPC: "EPC", FARDAMENTO: "Fardamento", GERAL: "Geral" };
const ORDEM_TIPO: Linha["tipo"][] = ["EPI", "EPC", "FARDAMENTO", "GERAL"];
const ORDEM_CATEGORIA = ["CABEÇA", "OLHOS/FACE", "AUDIÇÃO", "RESPIRATÓRIO", "TRONCO", "BRAÇOS", "MÃOS", "PERNAS", "PÉS", "PELE", "CAMISA", "CALÇA", "KIT"];

export default function EstoquePage() {
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [soComEstoque, setSoComEstoque] = useState(false);

  useEffect(() => {
    fetch("/api/epi/estoque/lista")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Não foi possível carregar o estoque.");
        setDepositos(d.depositos);
        setLinhas(d.linhas);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  const secoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtradas = linhas.filter(
      (l) =>
        (!soComEstoque || l.total > 0) &&
        (!q || l.nome.toLowerCase().includes(q) || (l.codigo ?? "").toLowerCase().includes(q) || (l.tamanho ?? "").toLowerCase() === q)
    );
    const mapa = new Map<string, Linha[]>();
    for (const l of filtradas) {
      const chave = `${l.tipo}|${l.categoria ?? ""}`;
      mapa.set(chave, [...(mapa.get(chave) ?? []), l]);
    }
    const posicao = (chave: string) => {
      const [t, c] = chave.split("|");
      const ct = ORDEM_CATEGORIA.indexOf(c);
      return ORDEM_TIPO.indexOf(t as Linha["tipo"]) * 100 + (ct >= 0 ? ct : 50);
    };
    return [...mapa.entries()]
      .sort((a, b) => posicao(a[0]) - posicao(b[0]) || a[0].localeCompare(b[0], "pt-BR"))
      .map(([chave, itens]) => {
        const [t, c] = chave.split("|");
        return {
          chave,
          titulo: `${TIPO_ROTULO[t as Linha["tipo"]]}${c ? ` · ${c}` : ""}`,
          itens: [...itens].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || compararTamanho(a, b)),
        };
      });
  }, [linhas, busca, soComEstoque]);

  const totalGeral = linhas.reduce((n, l) => n + l.total, 0);
  const colunas = depositos.map((d) => d.codigo);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <h1 className="text-lg font-semibold text-ink">Estoque</h1>
          <p className="text-xs text-gray-400">Quanto há de cada item do Cadastro, por contrato. Os códigos são os mesmos do Cadastro.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-brand-light px-3 py-1 font-semibold text-brand-dark">{totalGeral} unidades no total</span>
          {depositos.map((d) => (
            <span key={d.codigo} className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-600">{d.codigo}: {d.unidades} un. em {d.itens} itens</span>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item, código ou tamanho..." className="w-72 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={soComEstoque} onChange={(e) => setSoComEstoque(e.target.checked)} /> Só o que tem estoque
        </label>
      </div>

      {erro && <p className="mb-3 text-sm text-rose-600">{erro}</p>}
      {carregando && <p className="text-sm text-gray-400">Carregando…</p>}

      <div className="space-y-4">
        {secoes.map((s) => (
          <div key={s.chave} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <p className="bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-700">
              {s.titulo} <span className="ml-2 text-xs font-normal text-gray-400">{s.itens.length} {s.itens.length === 1 ? "código" : "códigos"} · {s.itens.reduce((n, l) => n + l.total, 0)} un.</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-2">Código</th>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2">Tamanho</th>
                    <th className="px-4 py-2">Versão</th>
                    {colunas.map((c) => <th key={c} className="px-4 py-2 text-right">{c}</th>)}
                    {colunas.length > 1 && <th className="px-4 py-2 text-right">Total</th>}
                  </tr>
                </thead>
                <tbody>
                  {s.itens.map((l) => (
                    <tr key={l.produtoId} className="border-t border-gray-50">
                      <td className="px-4 py-2"><span className="rounded-md bg-white px-2 py-1 font-mono text-[11px] font-semibold text-gray-700 ring-1 ring-brand/30">{l.codigo ?? "—"}</span></td>
                      <td className="px-4 py-2 font-medium text-gray-700">{l.nome}</td>
                      <td className="px-4 py-2 font-semibold text-gray-700">{l.tamanho ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-500">{l.higienizado ? "♻️ Higienizada" : "Normal"}</td>
                      {colunas.map((c) => (
                        <td key={c} className={`px-4 py-2 text-right tabular-nums ${(l.quantidades[c] ?? 0) === 0 ? "text-gray-300" : "font-semibold text-gray-800"}`}>{l.quantidades[c] ?? 0}</td>
                      ))}
                      {colunas.length > 1 && <td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-800">{l.total}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {!carregando && secoes.length === 0 && <p className="rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">Nenhum item encontrado.</p>}
      </div>
    </div>
  );
}
