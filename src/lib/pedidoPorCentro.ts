// Pedido de compra do estoque mínimo SEPARADO POR CENTRO DE CUSTO (contrato), igual à tela de Colaboradores.
//
// O pedido de cima (por destino) sai do estoque físico: o ECC abastece os contratos de código numérico (MRN) e o
// próprio "ECC"; o Geral abastece Sede e AGA. O estoque é um só por destino, então quanto COMPRAR é calculado por
// destino. Aqui a mesma compra é repartida entre os centros de custo na proporção de quantas pessoas ATIVAS de cada
// contrato usam o item (a mesma contagem que gerou o mínimo). A soma dos centros é sempre igual à compra do destino:
// o rateio usa o maior resto, então não sobra nem falta unidade por arredondamento.

export type GrupoCentro = "ECC" | "GERAL";

export type LinhaParaRateio = {
  produto: { id: string; nome: string; tamanho: string | null; higienizado: boolean; codigo: string | null; valorUnitario: number | null };
  contrato: { codigo: string } | null;
  necessidade: number;
  /** pessoas ativas que usam o item, por código de contrato, dentro do mesmo destino da linha */
  efetivoPorCentro: Record<string, number> | null;
};

export type LinhaRateada = {
  chave: string;
  produto: LinhaParaRateio["produto"];
  porCentro: Record<string, number>;
  total: number;
  valorTotal: number | null;
};

export type PedidoPorCentro = {
  centros: { codigo: string; grupo: GrupoCentro }[];
  linhas: LinhaRateada[];
  totalPorCentro: Record<string, number>;
  valorPorCentro: Record<string, number>;
  totalUnidades: number;
  totalValor: number;
  semValor: number;
};

/** Mesma regra do cálculo do mínimo (lib/epi.ts): ECC e contrato só com números abastecem pelo ECC; o resto (Sede, AGA...) pelo Geral. */
export function grupoDoCodigo(codigo: string): GrupoCentro {
  if (codigo === "ECC" || /^\d+$/.test(codigo)) return "ECC";
  return "GERAL";
}

/** Geral primeiro (Sede, AGA..., outros), depois o ECC (contratos numéricos em ordem e, por último, o próprio ECC). */
export function compararCentros(a: string, b: string): number {
  const ga = grupoDoCodigo(a), gb = grupoDoCodigo(b);
  if (ga !== gb) return ga === "GERAL" ? -1 : 1;
  if (ga === "ECC") {
    if (a === "ECC") return 1;
    if (b === "ECC") return -1;
    return Number(a) - Number(b);
  }
  if (a === "Sede") return -1;
  if (b === "Sede") return 1;
  return a.localeCompare(b, "pt-BR", { numeric: true });
}

/** Divide `total` (inteiro) na proporção dos pesos, pelo método do maior resto: a soma sempre fecha em `total`. */
export function distribuirProporcional(total: number, pesos: Record<string, number>): Record<string, number> {
  const itens = Object.entries(pesos).filter(([, p]) => p > 0);
  const somaPesos = itens.reduce((s, [, p]) => s + p, 0);
  const saida: Record<string, number> = {};
  if (total <= 0 || somaPesos <= 0) return saida;
  const partes = itens.map(([codigo, peso]) => {
    const exato = (total * peso) / somaPesos;
    return { codigo, peso, base: Math.floor(exato), resto: exato - Math.floor(exato) };
  });
  let faltam = total - partes.reduce((s, p) => s + p.base, 0);
  // maior resto primeiro; empate: quem tem mais gente, depois ordem dos centros (resultado sempre o mesmo)
  const ordem = [...partes].sort((x, y) => y.resto - x.resto || y.peso - x.peso || compararCentros(x.codigo, y.codigo));
  for (const p of ordem) {
    if (faltam <= 0) break;
    p.base += 1;
    faltam -= 1;
  }
  for (const p of partes) if (p.base > 0) saida[p.codigo] = p.base;
  return saida;
}

function chaveProduto(p: LinhaParaRateio["produto"]) {
  return `${p.nome}__${p.tamanho ?? ""}__${p.higienizado ? "H" : ""}`;
}

/**
 * `linhas` = as linhas de estoque que têm necessidade (> 0). `centrosCadastrados` = todos os contratos ativos, para a
 * coluna existir mesmo zerada (contrato novo aparece na hora).
 */
export function montarPedidoPorCentro(linhas: LinhaParaRateio[], centrosCadastrados: string[]): PedidoPorCentro {
  const mapa = new Map<string, LinhaRateada>();
  const usados = new Set<string>(centrosCadastrados);
  for (const l of linhas) {
    if (l.necessidade <= 0) continue;
    const pesos = l.efetivoPorCentro ?? {};
    let parte = distribuirProporcional(l.necessidade, pesos);
    if (Object.keys(parte).length === 0) {
      // sem contagem por contrato (não deveria ocorrer com necessidade > 0): a compra fica no contrato da própria linha
      parte = { [l.contrato?.codigo ?? "Geral"]: l.necessidade };
    }
    const chave = chaveProduto(l.produto);
    if (!mapa.has(chave)) mapa.set(chave, { chave, produto: l.produto, porCentro: {}, total: 0, valorTotal: l.produto.valorUnitario !== null ? 0 : null });
    const alvo = mapa.get(chave)!;
    for (const [codigo, qtd] of Object.entries(parte)) {
      alvo.porCentro[codigo] = (alvo.porCentro[codigo] ?? 0) + qtd;
      alvo.total += qtd;
      usados.add(codigo);
    }
  }
  const linhasFinais = [...mapa.values()].sort(
    (a, b) => a.produto.nome.localeCompare(b.produto.nome, "pt-BR") || (a.produto.tamanho ?? "").localeCompare(b.produto.tamanho ?? "", "pt-BR", { numeric: true })
  );
  for (const l of linhasFinais) if (l.valorTotal !== null) l.valorTotal = l.total * (l.produto.valorUnitario ?? 0);

  const centros = [...usados].sort(compararCentros).map((codigo) => ({ codigo, grupo: grupoDoCodigo(codigo) }));
  const totalPorCentro: Record<string, number> = {};
  const valorPorCentro: Record<string, number> = {};
  for (const c of centros) { totalPorCentro[c.codigo] = 0; valorPorCentro[c.codigo] = 0; }
  for (const l of linhasFinais) {
    for (const [codigo, qtd] of Object.entries(l.porCentro)) {
      totalPorCentro[codigo] += qtd;
      if (l.produto.valorUnitario !== null) valorPorCentro[codigo] += qtd * l.produto.valorUnitario;
    }
  }
  return {
    centros,
    linhas: linhasFinais,
    totalPorCentro,
    valorPorCentro,
    totalUnidades: linhasFinais.reduce((s, l) => s + l.total, 0),
    totalValor: linhasFinais.reduce((s, l) => s + (l.valorTotal ?? 0), 0),
    semValor: linhasFinais.filter((l) => l.valorTotal === null).length,
  };
}
