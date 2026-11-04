// Chave canônica de um item de estoque: nome-base + CA + tamanho + higienizada. Serve para reconhecer o MESMO item escrito de jeitos diferentes
// ("CAMISA DE MALHA GG (HIGIENIZADA)", "CAMISA DE MALHA" tamanho GG higienizada, "CAMISA DE MALHA TAMANHO GG"...). Sem acesso a banco: roda no navegador também.

export type Canon = { key: string; base: string; nomeExibicao: string; ca: string | null; tam: string | null; hig: boolean };

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const SINONIMO_TAMANHO: Record<string, string> = { EXG: "XXG", EGG: "XXG", EG: "XG" };
// erros de digitação que aparecem na planilha (só em palavras sem acento, para valer na chave e na exibição)
const ERROS_DE_DIGITACAO: [RegExp, string][] = [
  [/\bBRNACO\b/g, "BRANCO"],
  [/\bCAPACE\b/g, "CAPACETE"],
  [/METARARSO/g, "METATARSO"],
];

type Par = { o: string; s: string }; // o = texto com acento (exibição), s = sem acento (chave); mesmo comprimento

function tirar(par: Par, re: RegExp): { par: Par; m: RegExpExecArray | null } {
  const m = re.exec(par.s);
  if (!m) return { par, m: null };
  const i = m.index, n = m[0].length;
  return { par: { o: par.o.slice(0, i) + " " + par.o.slice(i + n), s: par.s.slice(0, i) + " " + par.s.slice(i + n) }, m };
}

const normTam = (t: string) => SINONIMO_TAMANHO[t] ?? t;

export function canonizar(nome: string, tamanhoCampo?: string | null, higienizadoCampo = false): Canon {
  let o = nome.toUpperCase().replace(/\s+/g, " ").trim();
  for (const [re, novo] of ERROS_DE_DIGITACAO) o = o.replace(re, novo);
  let par: Par = { o, s: sem(o) };

  // higienizada: "(HIGIENIZADA)", "HIGENIZAÇÃO"... em qualquer ponto do nome ou do campo tamanho
  let hig = higienizadoCampo;
  for (let guarda = 0; guarda < 5; guarda++) {
    const r = tirar(par, /\(?\s*HIGI?ENIZ[A-Z]*\s*\)?/);
    if (!r.m) break;
    par = r.par;
    hig = true;
  }
  // CA (CA25687, CA 52864, CA - 498)
  let ca: string | null = null;
  const rc = tirar(par, /\bCA\s*[-:.]?\s*(\d{3,7})\b/);
  if (rc.m) { par = rc.par; ca = rc.m[1]; }

  // tamanho
  let tam: string | null = null;
  const campo = tamanhoCampo ? sem(tamanhoCampo.toUpperCase()).replace(/\(?\s*HIGI?ENIZ[A-Z]*\s*\)?/g, " ").replace(/^TAMANHO\s+/, "").trim() : "";
  if (tamanhoCampo && /HIGI?ENIZ/.test(sem(tamanhoCampo.toUpperCase()))) hig = true;
  if (campo) {
    tam = normTam(campo);
  } else {
    const palavra = tirar(par, /\bTAMANHO\s+([A-Z0-9]{1,4})\b/);
    if (palavra.m) { par = palavra.par; tam = normTam(palavra.m[1]); }
    else {
      const letra = tirar(par, /(?<=\s)(PP|XXG|EXG|EGG|XG|EG|GG|G|P|M)(?=\s|$|-)/);
      if (letra.m) { par = letra.par; tam = normTam(letra.m[1]); }
      else if (/\b(BOTA|CALCA|SAPAT|BOTINA)/.test(par.s)) {
        const num = tirar(par, /\b(3[2-9]|4\d|5[0-8])\b/);
        if (num.m) { par = num.par; tam = num.m[1]; }
      }
    }
  }

  const limparChave = (s: string) => s.replace(/[().,;:]/g, " ").replace(/\s[-–]\s/g, " ").replace(/\s[-–]$/g, "").replace(/\s+/g, " ").trim();
  const limparExib = (s: string) => s.replace(/\s+[-–]\s*$/g, "").replace(/\s+/g, " ").trim();
  const base = limparChave(par.s);
  const baseExib = limparExib(par.o.replace(/[().,;:]/g, " ").replace(/\s+/g, " "));
  return {
    key: [base, ca ?? "", tam ?? "", hig ? "H" : ""].join("|"),
    base,
    nomeExibicao: baseExib + (ca ? ` - CA${ca}` : ""),
    ca,
    tam,
    hig,
  };
}

const ORDEM_LETRAS: Record<string, number> = { PP: 0, P: 1, M: 2, G: 3, GG: 4, XG: 5, XXG: 6, EXG: 6 };
/** Ordem natural de tamanho: PP, P, M, G, GG, XG, XXG; números em ordem crescente; sem tamanho primeiro. */
export function ordemTamanho(t: string | null | undefined): number {
  if (!t) return -1;
  const u = t.toUpperCase().trim();
  if (u in ORDEM_LETRAS) return ORDEM_LETRAS[u];
  const n = Number(u);
  return Number.isNaN(n) ? 999 : 100 + n;
}
export function compararItens(a: { nome: string; tamanho: string | null; higienizado: boolean }, b: { nome: string; tamanho: string | null; higienizado: boolean }): number {
  return a.nome.localeCompare(b.nome, "pt-BR") || ordemTamanho(a.tamanho) - ordemTamanho(b.tamanho) || Number(a.higienizado) - Number(b.higienizado);
}
