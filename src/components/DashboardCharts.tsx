"use client";

// Gráficos do Dashboard — SVG puro, sem biblioteca externa (build tem que
// continuar sem depender de instalar nada novo). Paleta reaproveita as cores
// da marca (brand/accent do tailwind.config) mais alguns tons extras só pra
// dar contraste entre categorias.

export const PALETA_CATEGORIA: Record<string, string> = {
  EPI: "#00A99D",
  EPC: "#00847a",
  Fardamento: "#f59e0b",
  "Material de Escritório": "#3b82f6",
  "Itens Veicular": "#8b5cf6",
  "Insumos Alojamento": "#ec4899",
  "Depósito Geral": "#64748b",
};
const CORES_FALLBACK = ["#00A99D", "#E63329", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];

export function corCategoria(label: string, index: number) {
  return PALETA_CATEGORIA[label] ?? CORES_FALLBACK[index % CORES_FALLBACK.length];
}

// Donut simples via stroke-dasharray (sem lib de gráfico) — cada fatia é um
// círculo concêntrico com um pedaço do traço "recortado".
export function DonutChart({
  dados,
  centroLabel,
  centroValor,
}: {
  dados: { label: string; value: number; color: string }[];
  centroLabel: string;
  centroValor: number | string;
}) {
  const total = dados.reduce((s, d) => s + d.value, 0) || 1;
  const r = 68;
  const stroke = 26;
  const c = 2 * Math.PI * r;
  let acumulado = 0;

  return (
    <div className="relative mx-auto h-48 w-48 shrink-0">
      <svg viewBox="0 0 180 180" className="h-48 w-48 -rotate-90">
        <circle cx="90" cy="90" r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
        {dados.map((d, i) => {
          if (d.value <= 0) return null;
          const frac = d.value / total;
          const dash = frac * c;
          const offset = -acumulado;
          acumulado += dash;
          return (
            <circle
              key={i}
              cx="90"
              cy="90"
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={offset}
            >
              <title>{`${d.label}: ${d.value} (${Math.round(frac * 100)}%)`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-ink">{centroValor}</span>
        <span className="text-[10px] text-gray-400">{centroLabel}</span>
      </div>
    </div>
  );
}

export function LegendaDonut({ dados }: { dados: { label: string; value: number; color: string; sub?: string }[] }) {
  const total = dados.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="flex-1 space-y-1.5">
      {dados.map((d, i) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-2 text-gray-600">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            {d.label}
            {d.sub && <span className="font-medium text-accent">{d.sub}</span>}
          </span>
          <span className="font-medium text-gray-400">
            {d.value} · {Math.round((d.value / total) * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

type ItemCritico = {
  produto: string;
  tipo: string;
  categoria: string | null;
  contrato: string;
  estoqueMinimo: number | null;
  necessidade: number;
};

// Ranking direto — sem quadrante pra interpretar, sem eixo pra ler. Barra
// maior = comprar mais unidades. Ordem já vem certa da API (desc por
// necessidade), só pega os N primeiros.
export function RankingCompras({
  itens,
  labelCategoria,
  limite = 10,
}: {
  itens: ItemCritico[];
  labelCategoria: (tipo: string, categoria: string | null) => string;
  limite?: number;
}) {
  const top = itens.slice(0, limite);
  if (top.length === 0) return null;
  const max = Math.max(...top.map((i) => i.necessidade));
  const categoriasUnicas = [...new Set(itens.map((i) => labelCategoria(i.tipo, i.categoria)))];

  return (
    <div className="space-y-2.5">
      {top.map((it, i) => {
        const label = labelCategoria(it.tipo, it.categoria);
        const cor = corCategoria(label, categoriasUnicas.indexOf(label));
        return (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-gray-700">
                {it.produto} <span className="text-gray-400">· {it.contrato}</span>
              </span>
              <span className="font-semibold text-gray-600">{it.necessidade} un.</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full" style={{ width: `${Math.max(4, (it.necessidade / max) * 100)}%`, backgroundColor: cor }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Barra por contrato — quantos itens estão abaixo do mínimo em cada
// contrato, pra saber onde focar a reposição primeiro. Reaproveita o mesmo
// `porContrato` que já alimenta a barra de "itens monitorados".
export function BarrasAbaixoMinimoPorContrato({
  dados,
}: {
  dados: { label: string; total: number; abaixoMinimo: number }[];
}) {
  const comItem = dados.filter((d) => d.total > 0);
  if (comItem.length === 0) return null;
  const max = Math.max(1, ...comItem.map((d) => d.abaixoMinimo));

  return (
    <div className="space-y-2.5">
      {comItem.map((d, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-gray-700">{d.label}</span>
            <span className="font-semibold text-gray-500">
              {d.abaixoMinimo > 0 ? <span className="text-accent">{d.abaixoMinimo} abaixo do mín.</span> : <span className="text-brand-dark">tudo OK</span>} · {d.total} itens
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-dark"
              style={{ width: `${d.abaixoMinimo > 0 ? Math.max(4, (d.abaixoMinimo / max) * 100) : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
