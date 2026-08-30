"use client";

import { useEffect, useMemo, useState } from "react";

type Contrato = { id: string; codigo: string; nome: string | null; percentualContingencia: number };
type Regra = { id: string; funcao: string; categoria: string; descricao: string; contrato: { id: string; codigo: string } };
type Produto = {
  id: string;
  nome: string;
  tipo: "EPI" | "EPC" | "FARDAMENTO" | "GERAL";
  categoria: string | null;
  ca: string | null;
  fabricante: string | null;
  tamanho: string | null;
  unidade: string;
  valorUnitario: number | null;
  percentualContingencia: number | null;
  fotoUrl: string | null;
  ativo: boolean;
};

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Fotos de referência reais, extraídas do book oficial de EPI da empresa —
// representam o TIPO do item (ex.: "bota de couro"), não a foto exata de cada
// marca/tamanho específico do estoque.
const FOTOS_REFERENCIA = [
  "007_Bota_de_couro_com_biqueira_de_composite_Com_ou_sem.jpeg",
  "008_Coturno_Preta_Bico_De_A_o_Laranja_60C32MTAMEX_Cada.png",
  "009_Bota_de_seguran_a_imperme_vel.png",
  "010_Touca_arabe.png",
  "011_Capacete_aba_frontal_carneira_ajuste_f_cil.jpeg",
  "012_Carneira.png",
  "013_Julgular.png",
  "014_Perneira_com_prote_o_nos_joelhos.png",
  "016_Luva_motosserrista_vaqueta.png",
  "017_Luva_de_vaqueta_antimpacto.png",
  "018_Luva_de_vaqueta.png",
  "019_Luva_termica.png",
  "020_Luva_imperme_vel.png",
  "022_Luva_para_prote_o_contra_agentes_t_rmicos_e_mec_ni.png",
  "023_Mangote_de_prote_o.png",
  "024__culos_de_seguran_a_de_sobrepor.png",
  "025__culos_de_seguran_a_convenciona_claro_ou_escuro_.png",
  "026__culos_de_seguran_a_com_banda_el_stica_claro_ou_es.png",
  "027_Kit_Abafador_XLS.png",
  "028_Mascara_semifacial_descart_vel_particulados_.png",
  "029_PROTETOR_SOLAR_FPS_50_COM_REPELENTE_DE_INSETOS_SUN.png",
  "030_Colete_refletivo.png",
  "031_Capa_de_chuva.png",
  "032_Colete_salva_vidas.png",
  "043_Blusa_refletiva.jpeg",
  "044_Cal_a_brim_cinza_refletiva.jpeg",
  "045_Camisa_social.jpeg",
  "046_Camisa_polo.png",
  "047_Blus_o_Jaqueta_operador_de_motosserra.png",
  "048_Cal_a_operador_de_motosserra.png",
];

export default function CatalogoPage() {
  const [tab, setTab] = useState<"regras" | "produtos">("produtos");
  const [contratos, setContratos] = useState<Contrato[]>([]);

  useEffect(() => {
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
  }, []);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {[
          { id: "produtos", label: "Catálogo de itens" },
          { id: "regras", label: "Regras por função" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === t.id ? "bg-brand text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "produtos" && <ProdutosTab />}
      {tab === "regras" && <RegrasTab contratos={contratos} />}
    </div>
  );
}

const TIPO_LABEL: Record<Produto["tipo"], string> = {
  EPI: "EPI",
  EPC: "EPC",
  FARDAMENTO: "Fardamento",
  GERAL: "Geral",
};

// Ordem natural pra tamanho de roupa — usada quando o tamanho não é um
// número (bota/calça já ordenam numericamente sozinhos).
const TAMANHO_LETRA_ORDEM = ["PP", "P", "M", "G", "GG", "XG", "EXG", "XXG"];
function compararTamanho(a: string, b: string) {
  const semHig = (t: string) => t.replace(/\s*\(Higienizada\)/i, "").trim();
  const higienizada = (t: string) => (/\(Higienizada\)/i.test(t) ? 1 : 0);
  const ca = semHig(a);
  const cb = semHig(b);
  const na = Number(ca);
  const nb = Number(cb);
  if (ca !== "" && cb !== "" && !Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  const ia = TAMANHO_LETRA_ORDEM.indexOf(ca.toUpperCase());
  const ib = TAMANHO_LETRA_ORDEM.indexOf(cb.toUpperCase());
  if (ia >= 0 && ib >= 0 && ia !== ib) return ia - ib;
  if (ca !== cb) return ca.localeCompare(cb);
  return higienizada(a) - higienizada(b);
}

// `chave` identifica o grupo de verdade (nome+tipo, nunca colide) — `nome` é
// só o texto pra mostrar na tela.
type Grupo = { chave: string; nome: string; itens: Produto[] };

function ProdutosTab() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [estoquePorProduto, setEstoquePorProduto] = useState<Map<string, number>>(new Map());
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"" | Produto["tipo"]>("");
  const [filtroFabricante, setFiltroFabricante] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [editandoFabricante, setEditandoFabricante] = useState<string | null>(null);
  const [rascunhoFabricante, setRascunhoFabricante] = useState("");
  const [editandoPct, setEditandoPct] = useState<string | null>(null);
  const [rascunhoPct, setRascunhoPct] = useState("");
  const [escolhendoFoto, setEscolhendoFoto] = useState<string | null>(null);
  const [autoFotoRodando, setAutoFotoRodando] = useState(false);
  const [autoFotoResultado, setAutoFotoResultado] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  function reload() {
    fetch("/api/epi/produtos").then((r) => r.json()).then(setProdutos).catch(() => {});
    fetch("/api/epi/estoque")
      .then((r) => r.json())
      .then((estoque: { produtoId?: string; produto?: { id: string }; estoqueAtual: number }[]) => {
        const map = new Map<string, number>();
        for (const e of estoque) {
          const id = e.produtoId ?? e.produto?.id;
          if (!id) continue;
          map.set(id, (map.get(id) ?? 0) + e.estoqueAtual);
        }
        setEstoquePorProduto(map);
      })
      .catch(() => {});
  }
  useEffect(reload, []);

  function toggleExpandido(chave: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  const fabricantes = useMemo(
    () => [...new Set(produtos.map((p) => p.fabricante).filter((f): f is string => !!f))].sort(),
    [produtos]
  );

  const filtrados = useMemo(
    () =>
      produtos.filter(
        (p) =>
          p.ativo &&
          (!busca ||
            p.nome.toLowerCase().includes(busca.toLowerCase()) ||
            (p.tamanho ?? "").toLowerCase().includes(busca.toLowerCase()) ||
            (p.ca ?? "").toLowerCase().includes(busca.toLowerCase())) &&
          (!filtroTipo || p.tipo === filtroTipo) &&
          (!filtroFabricante || p.fabricante === filtroFabricante)
      ),
    [produtos, busca, filtroTipo, filtroFabricante]
  );

  // Agrupa por nome+tipo — depois da migração de tamanhos, o nome já é a
  // base limpa do equipamento (ex.: "BOTA DE SEGURANÇA MARLUVAS - CA42374")
  // e o que varia por tamanho fica só no campo `tamanho`. Item sem variação
  // de tamanho vira um grupo de 1 — renderiza igual a antes, sem drill-down.
  // Inclui o tipo na chave de propósito: um nome igual com tipo diferente
  // (ex.: import antigo categorizou errado) não pode virar um grupo só —
  // já aconteceu uma vez (ver correção de tipo no migrate-tamanhos) e
  // misturar tipo escondido dentro do mesmo card seria pior que não agrupar.
  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, Produto[]>();
    for (const p of filtrados) {
      const chave = `${p.nome}__${p.tipo}`;
      if (!map.has(chave)) map.set(chave, []);
      map.get(chave)!.push(p);
    }
    return [...map.entries()]
      .map(([chave, itens]) => ({
        chave,
        nome: itens[0].nome,
        itens: [...itens].sort((a, b) => compararTamanho(a.tamanho ?? "", b.tamanho ?? "")),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filtrados]);

  async function salvarFabricante(id: string) {
    const fabricante = rascunhoFabricante.trim() || null;
    await fetch(`/api/epi/produtos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fabricante }),
    });
    setEditandoFabricante(null);
    setProdutos((prev) => prev.map((p) => (p.id === id ? { ...p, fabricante } : p)));
  }

  async function salvarPct(id: string, pctInteiro: number | null) {
    const pct = pctInteiro === null ? null : Math.min(100, Math.max(0, pctInteiro)) / 100;
    await fetch(`/api/epi/produtos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percentualContingencia: pct }),
    });
    setEditandoPct(null);
    setProdutos((prev) => prev.map((p) => (p.id === id ? { ...p, percentualContingencia: pct } : p)));
  }

  function ajustarPct(p: Produto, delta: number) {
    const atual = Math.round((p.percentualContingencia ?? 0.1) * 100);
    salvarPct(p.id, atual + delta);
  }

  async function salvarValor(id: string) {
    const valor = rascunho.trim() === "" ? null : parseFloat(rascunho.replace(",", "."));
    await fetch(`/api/epi/produtos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valorUnitario: valor !== null && !Number.isNaN(valor) ? valor : null }),
    });
    setEditando(null);
    reload();
  }

  async function salvarFoto(id: string, fotoUrl: string | null) {
    await fetch(`/api/epi/produtos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fotoUrl }),
    });
    setEscolhendoFoto(null);
    reload();
  }

  async function rodarAutoFoto() {
    setAutoFotoRodando(true);
    setAutoFotoResultado(null);
    const res = await fetch("/api/epi/produtos/auto-foto", { method: "POST" });
    const data = await res.json();
    setAutoFotoRodando(false);
    setAutoFotoResultado(`${data.atualizados} itens ganharam foto automática (${data.semMatch} sem foto de referência parecida).`);
    reload();
  }

  async function excluir(id: string) {
    if (!confirm("Remover este item do catálogo? Se já tiver movimentação registrada, ele só é desativado (não some do histórico).")) return;
    await fetch(`/api/epi/produtos/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar item..."
          className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as any)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todos os tipos</option>
          <option value="EPI">EPI</option>
          <option value="EPC">EPC</option>
          <option value="FARDAMENTO">Fardamento</option>
          <option value="GERAL">Geral (escritório, veicular, alojamento...)</option>
        </select>
        <select
          value={filtroFabricante}
          onChange={(e) => setFiltroFabricante(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todos os fabricantes</option>
          {fabricantes.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{filtrados.length} itens ativos</span>
        <button
          onClick={rodarAutoFoto}
          disabled={autoFotoRodando}
          className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-light disabled:opacity-50"
        >
          {autoFotoRodando ? "Buscando fotos..." : "📷 Preencher fotos automaticamente"}
        </button>
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          + Novo item
        </button>
      </div>

      {autoFotoResultado && <p className="mb-3 text-xs text-brand-dark">{autoFotoResultado}</p>}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Foto</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">CA</th>
              <th className="px-4 py-3">Fabricante</th>
              <th className="px-4 py-3">Tamanho</th>
              <th className="px-4 py-3">Unid.</th>
              <th className="px-4 py-3 text-right">Em estoque</th>
              <th className="px-4 py-3 text-right">Valor unitário</th>
              <th className="px-4 py-3 text-center">% Contingência</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) =>
              g.itens.length === 1 ? (
                <LinhaProduto
                  key={g.itens[0].id}
                  p={g.itens[0]}
                  qtd={estoquePorProduto.get(g.itens[0].id) ?? 0}
                  editando={editando}
                  setEditando={setEditando}
                  rascunho={rascunho}
                  setRascunho={setRascunho}
                  salvarValor={salvarValor}
                  editandoFabricante={editandoFabricante}
                  setEditandoFabricante={setEditandoFabricante}
                  rascunhoFabricante={rascunhoFabricante}
                  setRascunhoFabricante={setRascunhoFabricante}
                  salvarFabricante={salvarFabricante}
                  editandoPct={editandoPct}
                  setEditandoPct={setEditandoPct}
                  rascunhoPct={rascunhoPct}
                  setRascunhoPct={setRascunhoPct}
                  salvarPct={salvarPct}
                  ajustarPct={ajustarPct}
                  setEscolhendoFoto={setEscolhendoFoto}
                  excluir={excluir}
                />
              ) : (
                <GrupoTamanhos
                  key={g.chave}
                  grupo={g}
                  aberto={expandidos.has(g.chave)}
                  toggle={() => toggleExpandido(g.chave)}
                  estoquePorProduto={estoquePorProduto}
                  editando={editando}
                  setEditando={setEditando}
                  rascunho={rascunho}
                  setRascunho={setRascunho}
                  salvarValor={salvarValor}
                  editandoFabricante={editandoFabricante}
                  setEditandoFabricante={setEditandoFabricante}
                  rascunhoFabricante={rascunhoFabricante}
                  setRascunhoFabricante={setRascunhoFabricante}
                  salvarFabricante={salvarFabricante}
                  editandoPct={editandoPct}
                  setEditandoPct={setEditandoPct}
                  rascunhoPct={rascunhoPct}
                  setRascunhoPct={setRascunhoPct}
                  salvarPct={salvarPct}
                  ajustarPct={ajustarPct}
                  setEscolhendoFoto={setEscolhendoFoto}
                  excluir={excluir}
                />
              )
            )}
            {grupos.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum item encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <NovoProdutoForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {escolhendoFoto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setEscolhendoFoto(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-semibold text-ink">Escolher foto de referência</h3>
            <p className="mb-4 text-xs text-gray-400">Fotos reais do book de EPI da empresa — representam o tipo do item, não a marca/tamanho exato.</p>
            <div className="mb-4 grid grid-cols-5 gap-3 sm:grid-cols-6">
              {FOTOS_REFERENCIA.map((f) => (
                <button key={f} onClick={() => salvarFoto(escolhendoFoto, `/epi-fotos/${f}`)} className="aspect-square overflow-hidden rounded-lg border border-gray-200 hover:border-brand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/epi-fotos/${f}`} alt={f} className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <button onClick={() => salvarFoto(escolhendoFoto, null)} className="text-xs text-gray-400 hover:text-rose-600">
                Remover foto
              </button>
              <button onClick={() => setEscolhendoFoto(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type LinhaEditProps = {
  editando: string | null;
  setEditando: (id: string | null) => void;
  rascunho: string;
  setRascunho: (v: string) => void;
  salvarValor: (id: string) => void;
  editandoFabricante: string | null;
  setEditandoFabricante: (id: string | null) => void;
  rascunhoFabricante: string;
  setRascunhoFabricante: (v: string) => void;
  salvarFabricante: (id: string) => void;
  editandoPct: string | null;
  setEditandoPct: (id: string | null) => void;
  rascunhoPct: string;
  setRascunhoPct: (v: string) => void;
  salvarPct: (id: string, pct: number | null) => void;
  ajustarPct: (p: Produto, delta: number) => void;
  setEscolhendoFoto: (id: string | null) => void;
  excluir: (id: string) => void;
};

// Uma linha de produto de verdade — usada tanto pra item avulso (sem
// variação de tamanho) quanto pra cada tamanho dentro de um grupo aberto.
// `indentado` só muda o recuo visual e esconde colunas que já aparecem na
// linha-pai do grupo (foto/tipo/CA/fabricante), pra não repetir informação.
function LinhaProduto({
  p,
  qtd,
  indentado,
  ...ed
}: { p: Produto; qtd: number; indentado?: boolean } & LinhaEditProps) {
  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
      <td className="px-4 py-2.5">
        {indentado ? null : (
          <button onClick={() => ed.setEscolhendoFoto(p.id)} className="block h-11 w-11 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {p.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.fotoUrl} alt={p.nome} className="h-full w-full object-contain" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] text-gray-300">sem foto</span>
            )}
          </button>
        )}
      </td>
      <td className={`px-4 py-2.5 font-medium text-gray-700 ${indentado ? "pl-10 text-gray-400" : ""}`}>{indentado ? "↳" : p.nome}</td>
      <td className="px-4 py-2.5">
        {indentado ? null : (
          <>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{TIPO_LABEL[p.tipo]}</span>
            {p.categoria && <span className="ml-1 text-xs text-gray-400">{p.categoria}</span>}
          </>
        )}
      </td>
      <td className="px-4 py-2.5 text-gray-500">{indentado ? null : p.ca ?? "—"}</td>
      <td className="px-4 py-2.5">
        {indentado ? null : editandoFabricanteCampo(p, ed)}
      </td>
      <td className="px-4 py-2.5 font-semibold text-gray-700">{p.tamanho ?? "—"}</td>
      <td className="px-4 py-2.5 text-gray-500">{p.unidade}</td>
      <td className="px-4 py-2.5 text-right text-gray-600">{qtd}</td>
      <td className="px-4 py-2.5 text-right">
        {ed.editando === p.id ? (
          <input
            autoFocus
            value={ed.rascunho}
            onChange={(e) => ed.setRascunho(e.target.value)}
            onBlur={() => ed.salvarValor(p.id)}
            onKeyDown={(e) => e.key === "Enter" && ed.salvarValor(p.id)}
            placeholder="0,00"
            className="w-24 rounded border border-brand px-1 py-0.5 text-right text-sm"
          />
        ) : (
          <button
            onClick={() => {
              ed.setEditando(p.id);
              ed.setRascunho(p.valorUnitario !== null ? String(p.valorUnitario) : "");
            }}
            className="rounded px-1 text-gray-500 underline decoration-dotted hover:text-brand-dark"
          >
            {p.valorUnitario !== null ? fmtMoney(p.valorUnitario) : "definir"}
          </button>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => ed.ajustarPct(p, -1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 hover:bg-gray-200" aria-label="Diminuir">
            −
          </button>
          {ed.editandoPct === p.id ? (
            <input
              autoFocus
              value={ed.rascunhoPct}
              onChange={(e) => ed.setRascunhoPct(e.target.value)}
              onBlur={() => {
                const v = parseFloat(ed.rascunhoPct.replace(",", "."));
                ed.salvarPct(p.id, Number.isNaN(v) ? null : v);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="w-12 rounded border border-brand px-1 py-0.5 text-center text-xs font-semibold"
            />
          ) : (
            <button
              onClick={() => {
                ed.setEditandoPct(p.id);
                ed.setRascunhoPct(p.percentualContingencia !== null ? String(Math.round(p.percentualContingencia * 100)) : "");
              }}
              title={p.percentualContingencia === null ? "Usando o % padrão do contrato — clique pra definir um específico" : "Clique pra digitar"}
              className={`w-14 rounded px-1 py-0.5 text-center text-xs font-semibold ${
                p.percentualContingencia !== null ? "bg-brand-light text-brand-dark" : "text-gray-400 underline decoration-dotted"
              }`}
            >
              {p.percentualContingencia !== null ? `${Math.round(p.percentualContingencia * 100)}%` : "padrão"}
            </button>
          )}
          <button onClick={() => ed.ajustarPct(p, 1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 hover:bg-gray-200" aria-label="Aumentar">
            +
          </button>
        </div>
      </td>
      <td className="px-4 py-2.5 text-right">
        <button onClick={() => ed.excluir(p.id)} className="text-xs text-gray-400 hover:text-rose-600">
          Remover
        </button>
      </td>
    </tr>
  );
}

function editandoFabricanteCampo(p: Produto, ed: LinhaEditProps) {
  return ed.editandoFabricante === p.id ? (
    <input
      autoFocus
      value={ed.rascunhoFabricante}
      onChange={(e) => ed.setRascunhoFabricante(e.target.value)}
      onBlur={() => ed.salvarFabricante(p.id)}
      onKeyDown={(e) => e.key === "Enter" && ed.salvarFabricante(p.id)}
      className="w-32 rounded border border-brand px-1 py-0.5 text-sm"
    />
  ) : (
    <button
      onClick={() => {
        ed.setEditandoFabricante(p.id);
        ed.setRascunhoFabricante(p.fabricante ?? "");
      }}
      className="rounded px-1 text-left text-gray-500 underline decoration-dotted hover:text-brand-dark"
    >
      {p.fabricante ?? "definir"}
    </button>
  );
}

// Linha-pai de um grupo com mais de um tamanho (ex.: "BOTA DE SEGURANÇA
// MARLUVAS - CA42374" com 9 tamanhos) + as linhas-filho quando expandido.
// Editar fabricante/CA fica só nas linhas-filho (cada tamanho é o produto
// de verdade) — a linha-pai é resumo, não edita nada sozinha.
function GrupoTamanhos({
  grupo,
  aberto,
  toggle,
  estoquePorProduto,
  ...ed
}: { grupo: Grupo; aberto: boolean; toggle: () => void; estoquePorProduto: Map<string, number> } & LinhaEditProps) {
  const primeiro = grupo.itens[0];
  const cas = new Set(grupo.itens.map((i) => i.ca ?? ""));
  const fabricantes = new Set(grupo.itens.map((i) => i.fabricante ?? ""));
  const totalQtd = grupo.itens.reduce((soma, i) => soma + (estoquePorProduto.get(i.id) ?? 0), 0);

  return (
    <>
      <tr className="border-b border-gray-50 bg-brand-light/20 hover:bg-brand-light/30">
        <td className="px-4 py-2.5">
          <button onClick={() => setEscolhendoFotoDoGrupo(grupo, ed)} className="block h-11 w-11 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {primeiro.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={primeiro.fotoUrl} alt={grupo.nome} className="h-full w-full object-contain" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] text-gray-300">sem foto</span>
            )}
          </button>
        </td>
        <td className="px-4 py-2.5">
          <button onClick={toggle} className="flex items-center gap-2 text-left font-semibold text-gray-700 hover:text-brand-dark">
            <span className="text-xs text-brand-dark">{aberto ? "▾" : "▸"}</span>
            {grupo.nome}
          </button>
        </td>
        <td className="px-4 py-2.5">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{TIPO_LABEL[primeiro.tipo]}</span>
          {primeiro.categoria && <span className="ml-1 text-xs text-gray-400">{primeiro.categoria}</span>}
        </td>
        <td className="px-4 py-2.5 text-gray-500">{cas.size === 1 ? [...cas][0] || "—" : "vário"}</td>
        <td className="px-4 py-2.5 text-gray-500">{fabricantes.size === 1 ? [...fabricantes][0] || "—" : "vário"}</td>
        <td className="px-4 py-2.5">
          <button onClick={toggle} className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-dark hover:bg-brand/20">
            {grupo.itens.length} tamanhos
          </button>
        </td>
        <td className="px-4 py-2.5 text-gray-500">{primeiro.unidade}</td>
        <td className="px-4 py-2.5 text-right font-semibold text-gray-700">{totalQtd}</td>
        <td className="px-4 py-2.5 text-right text-gray-400">—</td>
        <td className="px-4 py-2.5 text-center text-gray-400">—</td>
        <td className="px-4 py-2.5" />
      </tr>
      {aberto && grupo.itens.map((item) => <LinhaProduto key={item.id} p={item} qtd={estoquePorProduto.get(item.id) ?? 0} indentado {...ed} />)}
    </>
  );
}

function setEscolhendoFotoDoGrupo(grupo: Grupo, ed: LinhaEditProps) {
  // A foto do grupo é a foto do primeiro tamanho — escolher uma foto pela
  // linha-pai edita esse item (os outros tamanhos podem ter foto própria se
  // precisar, editando na linha expandida).
  ed.setEscolhendoFoto(grupo.itens[0].id);
}

function NovoProdutoForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"EPI" | "EPC" | "FARDAMENTO" | "GERAL">("EPI");
  const [categoria, setCategoria] = useState("");
  // Placeholder muda pra dar exemplo certo quando tipo=GERAL, já que aí
  // "categoria" vira a prateleira do item (escritório/veicular/alojamento...)
  const categoriaPlaceholder =
    tipo === "GERAL" ? "ex: Material de Escritório, Itens Veicular, Insumos Alojamento" : "opcional";
  const [ca, setCa] = useState("");
  const [fabricante, setFabricante] = useState("");
  const [tamanho, setTamanho] = useState("");
  const [unidade, setUnidade] = useState("UNID");
  const [valorUnitario, setValorUnitario] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim()) {
      setErro("Informe o nome do item.");
      return;
    }
    setSaving(true);
    setErro(null);
    const valor = valorUnitario.trim() ? parseFloat(valorUnitario.replace(",", ".")) : null;
    const res = await fetch("/api/epi/produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: nome.trim(),
        tipo,
        categoria: categoria.trim() || null,
        ca: ca.trim() || null,
        fabricante: fabricante.trim() || null,
        tamanho: tamanho.trim() || null,
        unidade: unidade.trim() || "UNID",
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ? JSON.stringify(data.error) : "Erro ao salvar.");
      return;
    }
    if (valor !== null && !Number.isNaN(valor)) {
      const produto = await res.json();
      await fetch(`/api/epi/produtos/${produto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valorUnitario: valor }),
      });
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-ink">Novo item do catálogo</h3>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="EPI">EPI</option>
            <option value="EPC">EPC</option>
            <option value="FARDAMENTO">Fardamento</option>
            <option value="GERAL">Geral (escritório, veicular, alojamento...)</option>
          </select>
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Categoria</span>
          <input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder={categoriaPlaceholder}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">CA (opcional)</span>
            <input value={ca} onChange={(e) => setCa(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Tamanho (opcional)</span>
            <input value={tamanho} onChange={(e) => setTamanho(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
        </div>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Fabricante (opcional)</span>
          <input value={fabricante} onChange={(e) => setFabricante(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Unidade</span>
            <input value={unidade} onChange={(e) => setUnidade(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Valor unitário (opcional)</span>
            <input value={valorUnitario} onChange={(e) => setValorUnitario(e.target.value)} placeholder="0,00" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
        </div>

        {erro && <p className="mb-3 text-xs text-rose-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {saving ? "Salvando..." : "Adicionar ao catálogo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegrasTab({ contratos }: { contratos: Contrato[] }) {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [contratoId, setContratoId] = useState("");
  const [funcaoAberta, setFuncaoAberta] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function reload() {
    const qs = contratoId ? `?contratoId=${contratoId}` : "";
    fetch(`/api/epi/funcao-regras${qs}`).then((r) => r.json()).then(setRegras).catch(() => {});
  }
  useEffect(reload, [contratoId]);

  async function excluir(id: string) {
    if (!confirm("Remover esta regra?")) return;
    await fetch(`/api/epi/funcao-regras/${id}`, { method: "DELETE" });
    reload();
  }

  const porFuncao = useMemo(() => {
    const map = new Map<string, Regra[]>();
    for (const r of regras) {
      const key = `${r.funcao}__${r.contrato.codigo}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [regras]);

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">
        Qual EPI cada função usa, por contrato — vem da matriz oficial, mas pode ser editada ou ampliada aqui.
      </p>

      <div className="mb-4 flex items-center gap-3">
        <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">Todos os contratos</option>
          {contratos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} {c.nome ? `— ${c.nome}` : ""}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          + Nova regra
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {porFuncao.map(([key, items]) => {
          const [funcao, codigo] = key.split("__");
          const aberto = funcaoAberta === key;
          return (
            <div key={key} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button onClick={() => setFuncaoAberta(aberto ? null : key)} className="flex w-full items-center justify-between px-5 py-3 text-left">
                <div>
                  <p className="text-sm font-semibold text-gray-700">{funcao}</p>
                  <p className="text-xs text-gray-400">Contrato {codigo} · {items.length} categorias de EPI</p>
                </div>
                <span className="text-gray-400">{aberto ? "−" : "+"}</span>
              </button>
              {aberto && (
                <div className="space-y-2 border-t border-gray-100 px-5 py-3">
                  {items.map((r) => (
                    <div key={r.id} className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">{r.categoria}</p>
                        <p className="whitespace-pre-line text-xs text-gray-500">{r.descricao}</p>
                      </div>
                      <button onClick={() => excluir(r.id)} className="shrink-0 text-xs text-gray-400 hover:text-rose-600">
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {porFuncao.length === 0 && <p className="text-sm text-gray-400">Nenhuma regra importada ainda.</p>}
      </div>

      {showForm && (
        <NovaRegraForm
          contratos={contratos}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function NovaRegraForm({ contratos, onClose, onSaved }: { contratos: Contrato[]; onClose: () => void; onSaved: () => void }) {
  const [contratoId, setContratoId] = useState("");
  const [funcao, setFuncao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!contratoId || !funcao.trim() || !categoria.trim() || !descricao.trim()) {
      setErro("Preencha contrato, função, categoria e descrição.");
      return;
    }
    setSaving(true);
    setErro(null);
    const res = await fetch("/api/epi/funcao-regras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contratoId, funcao: funcao.trim(), categoria: categoria.trim(), descricao: descricao.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ? JSON.stringify(data.error) : "Erro ao salvar.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-ink">Nova regra de EPI por função</h3>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Contrato</span>
          <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="">Selecione...</option>
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} {c.nome ? `— ${c.nome}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Função</span>
          <input value={funcao} onChange={(e) => setFuncao(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Categoria (parte do corpo)</span>
          <input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="ex: EPI - MÃOS" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Descrição (itens, com CA se souber)</span>
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>

        {erro && <p className="mb-3 text-xs text-rose-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {saving ? "Salvando..." : "Adicionar regra"}
          </button>
        </div>
      </div>
    </div>
  );
}
