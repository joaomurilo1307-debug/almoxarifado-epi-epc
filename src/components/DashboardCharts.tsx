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
  estoqueMinimo: number;
  necessidade: number;
};

// Matriz de materialidade adaptada pra compras: em vez de "impacto x
// probabilidade" (ESG clássico), aqui é "quantidade a comprar x urgência"
// (o quanto já passou do mínimo) — mesma lógica de priorização, adaptada pro
// que o sistema realmente sabe medir (não inventa "impacto financeiro" pra
// item que não tem valor unitário cadastrado).
export function MatrizMaterialidade({ itens, labelCategoria }: { itens: ItemCritico[]; labelCategoria: (tipo: string, categoria: string | null) => string }) {
  if (itens.length === 0) return null;

  const W = 640;
  const H = 360;
  const PAD_L = 56;
  const PAD_B = 44;
  const PAD_T = 16;
  const PAD_R = 20;

  const pontos = itens.map((it) => {
    const urgencia = it.estoqueMinimo > 0 ? Math.min(100, (it.necessidade / it.estoqueMinimo) * 100) : 100;
    return { ...it, urgencia, label: labelCategoria(it.tipo, it.categoria) };
  });
  const maxNecessidade = Math.max(1, ...pontos.map((p) => p.necessidade));

  const x = (v: number) => PAD_L + (v / maxNecessidade) * (W - PAD_L - PAD_R);
  const y = (v: number) => H - PAD_B - (v / 100) * (H - PAD_B - PAD_T);
  const midX = x(maxNecessidade / 2);
  const midY = y(50);

  const categoriasUnicas = [...new Set(pontos.map((p) => p.label))];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* fundo dos quadrantes */}
        <rect x={midX} y={PAD_T} width={W - PAD_R - midX} height={midY - PAD_T} fill="#fee2e2" opacity={0.5} />
        <rect x={PAD_L} y={PAD_T} width={midX - PAD_L} height={midY - PAD_T} fill="#fef3c7" opacity={0.5} />
        <rect x={midX} y={midY} width={W - PAD_R - midX} height={H - PAD_B - midY} fill="#dbeafe" opacity={0.4} />
        <rect x={PAD_L} y={midY} width={midX - PAD_L} height={H - PAD_B - midY} fill="#f3f4f6" opacity={0.6} />

        {/* linhas de eixo */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#d1d5db" strokeWidth={1} />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#d1d5db" strokeWidth={1} />
        <line x1={midX} y1={PAD_T} x2={midX} y2={H - PAD_B} stroke="#e5e7eb" strokeDasharray="4 4" />
        <line x1={PAD_L} y1={midY} x2={W - PAD_R} y2={midY} stroke="#e5e7eb" strokeDasharray="4 4" />

        {/* rótulos de quadrante */}
        <text x={W - PAD_R - 6} y={PAD_T + 16} textAnchor="end" fontSize={11} fontWeight={700} fill="#b91c1c">
          🔴 Resolver já
        </text>
        <text x={PAD_L + 6} y={PAD_T + 16} textAnchor="start" fontSize={11} fontWeight={700} fill="#b45309">
          🟡 Urgente, pouca qtd.
        </text>
        <text x={W - PAD_R - 6} y={H - PAD_B - 8} textAnchor="end" fontSize={11} fontWeight={700} fill="#1d4ed8">
          🔵 Grande volume
        </text>
        <text x={PAD_L + 6} y={H - PAD_B - 8} textAnchor="start" fontSize={11} fontWeight={700} fill="#6b7280">
          Baixa prioridade
        </text>

        {/* pontos */}
        {pontos.map((p, i) => {
          const raio = 4 + Math.min(9, (p.necessidade / maxNecessidade) * 11);
          return (
            <circle key={i} cx={x(p.necessidade)} cy={y(p.urgencia)} r={raio} fill={corCategoria(p.label, categoriasUnicas.indexOf(p.label))} fillOpacity={0.75} stroke="white" strokeWidth={1.5}>
              <title>{`${p.produto} (${p.contrato}) — comprar ${p.necessidade}, ${Math.round(p.urgencia)}% do mínimo em falta`}</title>
            </circle>
          );
        })}

        {/* eixos */}
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#9ca3af">
          Quantidade a comprar →
        </text>
        <text x={-H / 2} y={14} textAnchor="middle" fontSize={11} fill="#9ca3af" transform="rotate(-90)">
          Urgência (% do mínimo em falta) →
        </text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-3">
        {categoriasUnicas.map((cat, i) => (
          <span key={cat} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: corCategoria(cat, i) }} />
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}
