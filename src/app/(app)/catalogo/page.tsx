"use client";

import { useEffect, useMemo, useState } from "react";

type Produto = {
  id: string;
  nome: string;
  tipo: "EPI" | "EPC" | "FARDAMENTO" | "GERAL";
  categoria: string | null;
  ca: string | null;
  skuCns: string | null;
  codigo: string | null;
  fabricante: string | null;
  tamanho: string | null;
  higienizado: boolean;
  unidade: string;
  valorUnitario: number | null;
  percentualContingencia: number | null;
  fotoUrl: string | null;
  descricao: string | null;
  funcao: string | null;
  validadeCa: string | null;
  codigoFornecedor: string | null;
  observacao: string | null;
  ativo: boolean;
};

// Tabela plana igual a planilha: uma coluna por campo, cada uma com seu filtro de texto.
type ColunaDef = { chave: string; rotulo: string; valor: (p: Produto) => string };
const COLUNAS: ColunaDef[] = [
  { chave: "codigo", rotulo: "Item", valor: (p) => p.codigo ?? "" },
  { chave: "categoria", rotulo: "Categoria", valor: (p) => p.categoria ?? "" },
  { chave: "tipo", rotulo: "Tipo", valor: (p) => TIPO_LABEL[p.tipo] },
  { chave: "funcao", rotulo: "Função", valor: (p) => p.funcao ?? "" },
  { chave: "descricao", rotulo: "Descrição", valor: (p) => p.descricao ?? "" },
  { chave: "fabricante", rotulo: "Fabricante", valor: (p) => p.fabricante ?? "" },
  { chave: "ca", rotulo: "CA", valor: (p) => p.ca ?? "" },
  { chave: "skuCns", rotulo: "SKU CNS", valor: (p) => p.skuCns ?? "" },
  { chave: "tamanho", rotulo: "Tamanho", valor: (p) => p.tamanho ?? "" },
  { chave: "codigoFornecedor", rotulo: "Código MRN", valor: (p) => p.codigoFornecedor ?? "" },
  { chave: "validadeCa", rotulo: "Validade", valor: (p) => p.validadeCa ?? "" },
  { chave: "observacao", rotulo: "Observação", valor: (p) => p.observacao ?? "" },
];

// Código do modelo (TIPO-CAT-NNN) a partir do código de um tamanho (TIPO-CAT-NNN-TAMANHO[-H]).
function familiaDoCodigo(codigo: string | null): string | null {
  if (!codigo) return null;
  return /^([A-Z]{3}-[A-Z]{3}-\d{3})(-|$)/.exec(codigo)?.[1] ?? codigo;
}

// "7 tamanhos · 14 códigos" (cada tamanho e cada versão, normal ou higienizada, tem o seu código).
function rotuloDoGrupo(itens: { tamanho: string | null }[]): string {
  const tams = new Set(itens.map((i) => i.tamanho).filter((t): t is string => !!t)).size;
  const n = itens.length;
  const tamanhos = tams === 0 ? "sem tamanho" : `${tams} ${tams === 1 ? "tamanho" : "tamanhos"}`;
  return `${tamanhos} · ${n} ${n === 1 ? "código" : "códigos"}`;
}

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

export default function CadastroPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-ink">Cadastro de itens</h1>
        <p className="text-xs text-gray-400">Cada item tem o seu código, e cada tamanho e versão (normal ou higienizada) tem o código próprio. Aqui não há contagem: a quantidade fica na aba Estoque.</p>
      </div>
      <ProdutosTab />
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
// "Higienizada" é flag do lote (like marca/CA), não parte do texto do
// tamanho — por isso entra como campo separado aqui, só pra desempate
// (mesmo tamanho, o novo aparece antes do higienizado).
function compararTamanho(a: { tamanho: string | null; higienizado: boolean }, b: { tamanho: string | null; higienizado: boolean }) {
  const ca = a.tamanho ?? "";
  const cb = b.tamanho ?? "";
  const na = Number(ca);
  const nb = Number(cb);
  if (ca !== "" && cb !== "" && !Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  const ia = TAMANHO_LETRA_ORDEM.indexOf(ca.toUpperCase());
  const ib = TAMANHO_LETRA_ORDEM.indexOf(cb.toUpperCase());
  if (ia >= 0 && ib >= 0 && ia !== ib) return ia - ib;
  if (ca !== cb) return ca.localeCompare(cb);
  return Number(a.higienizado) - Number(b.higienizado);
}

// `chave` identifica o grupo de verdade (nome+tipo, nunca colide) — `nome` é
// só o texto pra mostrar na tela.
type Grupo = { chave: string; nome: string; itens: Produto[] };

// Mesmos blocos de topo do Estoque (ver grupoChaveDe lá) — pra parar de
// mostrar EPI, Fardamento e cada categoria de Geral tudo misturado numa
// tabela só, igual o João pediu ("separe como no estoque").
const BLOCOS_TOPO: { value: string; label: string }[] = [
  { value: "EPI", label: "🦺 EPI" },
  { value: "EPC", label: "🛡️ EPC" },
  { value: "FARDAMENTO", label: "👕 Fardamento" },
  { value: "cat:Material de Escritório", label: "🖇️ Material de Escritório" },
  { value: "cat:Itens Veicular", label: "🚗 Itens Veicular" },
  { value: "cat:Insumos Alojamento", label: "🛏️ Insumos Alojamento" },
  { value: "cat:Depósito Geral", label: "📦 Depósito Geral" },
];
function blocoChaveDe(p: Produto): string {
  if (p.tipo === "GERAL" && p.categoria) return `cat:${p.categoria}`;
  return p.tipo;
}

// Dentro do bloco EPI, subdivide por parte do corpo/função — mesma
// classificação da planilha "EPIs Mínimos" do Matheus (CABEÇA, OLHOS/FACE,
// AUDIÇÃO...). Sem isso, itens parecidos mas de proteção diferente (ex.:
// MANGOTE e MANGOTE DE MALHA FIBRA ARAMIDA, ou os 2 tipos de respirador)
// ficam espalhados em ordem alfabética junto com tudo mais, parecendo
// duplicidade só de bater o olho.
const CATEGORIA_EPI_ORDEM = ["CABEÇA", "OLHOS/FACE", "AUDIÇÃO", "RESPIRATÓRIO", "TRONCO", "BRAÇOS", "MÃOS", "PERNAS", "PÉS", "PELE"];
// Fardamento também se divide por categoria (camisa, calça, kit). Item de EPI/Fardamento sem categoria reconhecida aparece em
// "SEM CATEGORIA" só para ficar visível e ser corrigido — o catálogo oficial não tem nenhum.
const SUBGRUPOS_POR_BLOCO: Record<string, string[]> = { EPI: CATEGORIA_EPI_ORDEM, FARDAMENTO: ["CAMISA", "CALÇA", "KIT"] };
const SEM_CATEGORIA = "SEM CATEGORIA";

function ProdutosTab() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [filtrosColuna, setFiltrosColuna] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [editandoFabricante, setEditandoFabricante] = useState<string | null>(null);
  const [rascunhoFabricante, setRascunhoFabricante] = useState("");
  const [editandoPct, setEditandoPct] = useState<string | null>(null);
  const [rascunhoPct, setRascunhoPct] = useState("");
  const [escolhendoFoto, setEscolhendoFoto] = useState<string | null>(null);

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [blocosFechados, setBlocosFechados] = useState<Set<string>>(new Set());

  function toggleBloco(chave: string) {
    setBlocosFechados((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  function reload() {
    fetch("/api/epi/produtos").then((r) => r.json()).then(setProdutos).catch(() => {});
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

  const filtrados = useMemo(
    () =>
      produtos
        .filter(
          (p) =>
            p.ativo &&
            COLUNAS.every((c) => {
              const f = filtrosColuna[c.chave];
              return !f || c.valor(p).toLowerCase().includes(f.toLowerCase());
            })
        )
        .sort((a, b) => (a.codigo ?? "").localeCompare(b.codigo ?? "")),
    [produtos, filtrosColuna]
  );

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


  async function excluir(id: string) {
    if (!confirm("Remover este item do catálogo? Se já tiver movimentação registrada, ele só é desativado (não some do histórico).")) return;
    await fetch(`/api/epi/produtos/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-gray-400">{filtrados.length} de {produtos.filter((p) => p.ativo).length} códigos</span>
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          + Novo item
        </button>
      </div>

      {(() => {
        const edProps: LinhaEditProps = {
          editando,
          setEditando,
          rascunho,
          setRascunho,
          salvarValor,
          editandoFabricante,
          setEditandoFabricante,
          rascunhoFabricante,
          setRascunhoFabricante,
          salvarFabricante,
          editandoPct,
          setEditandoPct,
          rascunhoPct,
          setRascunhoPct,
          salvarPct,
          ajustarPct,
          setEscolhendoFoto,
          excluir,
        };
        return (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="max-h-[75vh] overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-max text-xs">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="whitespace-nowrap border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                    {COLUNAS.map((c) => (
                      <th key={c.chave} className="px-3 py-2">{c.rotulo}</th>
                    ))}
                    <th className="px-3 py-2" />
                  </tr>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {COLUNAS.map((c) => (
                      <th key={c.chave} className="px-3 pb-2">
                        <input
                          value={filtrosColuna[c.chave] ?? ""}
                          onChange={(e) => setFiltrosColuna((prev) => ({ ...prev, [c.chave]: e.target.value }))}
                          placeholder="filtrar..."
                          className="w-full rounded border border-gray-200 px-1.5 py-1 text-[11px] font-normal normal-case text-gray-600"
                        />
                      </th>
                    ))}
                    <th className="px-3 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((p) => (
                    <LinhaProduto key={p.id} p={p} {...edProps} />
                  ))}
                </tbody>
              </table>
            </div>
            {filtrados.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Nenhum item encontrado.</div>
            )}
          </div>
        );
      })()}

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

// Uma linha por item/tamanho, plana — uma célula por coluna de COLUNAS, texto
// simples, igual a planilha. Sem foto, sem cor, sem agrupar.
function LinhaProduto({ p, ...ed }: { p: Produto } & LinhaEditProps) {
  return (
    <tr className="whitespace-nowrap border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
      {COLUNAS.map((c) => (
        <td key={c.chave} className="px-3 py-2 text-gray-700">
          {c.valor(p) || <span className="text-gray-300">—</span>}
        </td>
      ))}
      <td className="px-3 py-2 text-right">
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
  ...ed
}: { grupo: Grupo; aberto: boolean; toggle: () => void } & LinhaEditProps) {
  const primeiro = grupo.itens[0];
  const cas = new Set(grupo.itens.map((i) => i.ca ?? ""));
  const skuCnsSet = new Set(grupo.itens.map((i) => i.skuCns ?? ""));
  const fabricantes = new Set(grupo.itens.map((i) => i.fabricante ?? ""));

  return (
    <>
      <tr className="whitespace-nowrap border-b border-gray-50 bg-brand-light/20 hover:bg-brand-light/30">
        <td className="px-4 py-2.5">
          <button onClick={toggle} className="flex items-center gap-2 text-left font-semibold text-gray-700 hover:text-brand-dark">
            <span className="text-xs text-brand-dark">{aberto ? "▾" : "▸"}</span>
            {grupo.nome}
          </button>
          {primeiro.descricao && (
            <p className="mt-0.5 max-w-xs whitespace-normal pl-5 text-[11px] font-normal text-gray-400" title={primeiro.descricao}>
              {primeiro.descricao.length > 110 ? `${primeiro.descricao.slice(0, 110)}…` : primeiro.descricao}
            </p>
          )}
        </td>
        <td className="px-4 py-2.5">
          {primeiro.codigo ? (
            <span className="rounded-md bg-brand-light px-2 py-1 font-mono text-xs font-semibold text-brand-dark" title="Código do modelo — cada tamanho tem o seu, com o tamanho no final">{familiaDoCodigo(primeiro.codigo)}-…</span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{TIPO_LABEL[primeiro.tipo]}</span>
          {primeiro.categoria && <span className="ml-1 text-xs text-gray-400">{primeiro.categoria}</span>}
        </td>
        <td className="px-4 py-2.5 text-gray-500">{cas.size === 1 ? [...cas][0] || "—" : "vário"}</td>
        <td className="px-4 py-2.5">
          {skuCnsSet.size === 1 && [...skuCnsSet][0]
            ? <span className="rounded-md bg-emerald-50 px-2 py-1 font-mono text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">{[...skuCnsSet][0]}</span>
            : <span className="text-xs text-gray-300">—</span>}
        </td>
        <td className="px-4 py-2.5 text-gray-500">{fabricantes.size === 1 ? [...fabricantes][0] || "—" : "vário"}</td>
        <td className="px-4 py-2.5">
          <button onClick={toggle} className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-dark hover:bg-brand/20">
            {rotuloDoGrupo(grupo.itens)}
          </button>
        </td>
        <td className="px-4 py-2.5 text-gray-500">{primeiro.unidade}</td>
        <td className="px-4 py-2.5 text-right text-gray-400">—</td>
        <td className="px-4 py-2.5 text-center text-gray-400">—</td>
        <td className="px-4 py-2.5" />
      </tr>
      {aberto && grupo.itens.map((item) => <LinhaProduto key={item.id} p={item} indentado {...ed} />)}
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
  const [skuCns, setSkuCns] = useState("");
  const [higienizado, setHigienizado] = useState(false);
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
        skuCns: skuCns.trim() || null,
        higienizado,
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

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">SKU Consominas (opcional)</span>
          <input
            value={skuCns}
            onChange={(e) => setSkuCns(e.target.value)}
            placeholder="ex: CNS-PES-TIPOB — agrupa com outras marcas do mesmo tipo/tamanho"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={higienizado} onChange={(e) => setHigienizado(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
          <span className="text-gray-600">Peça higienizada (lote lavado/reaproveitado, controlado à parte)</span>
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

