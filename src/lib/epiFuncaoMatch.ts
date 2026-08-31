// Regras de cruzamento "colaborador -> quais EPI ele precisa", usadas SÓ
// pelo rebuild de EpiColaboradorItem (scripts/admin/rebuild-colaborador-item)
// — não mais em toda requisição de /api/epi/estoque, que agora só lê a
// tabela já pronta (ver lib/epi.ts). Extraído pra módulo próprio porque
// precisa ser importado tanto pelo endpoint de rebuild quanto (se algum dia
// precisar reprocessar) por scripts avulsos, sem duplicar a lista em dois
// lugares — foi exatamente duplicar/perder sincronismo que causou bug antes.

// Produtos cujo tamanho bate com um campo de verdade da ficha de cadastro
// do colaborador. BOTA/CALÇA/CAMISA (DE MALHA e JALECO) são universais —
// todo colaborador ativo com aquele campo preenchido usa o item, no
// tamanho da ficha, independente da função. "BOTA COM PROTEÇÃO DE
// METATARSO" é diferente: só quem BATE a função de motosserrista usa,
// mas no tamanho de bota da própria ficha (por isso fica de fora daqui e
// é tratada como caso especial no rebuild).
export const CAMPO_TAMANHO_POR_NOME: Record<string, "tamanhoBota" | "tamanhoCalca" | "tamanhoCamisa"> = {
  BOTA: "tamanhoBota",
  CALÇA: "tamanhoCalca",
  "CAMISA DE MALHA": "tamanhoCamisa",
  "CAMISA JALECO": "tamanhoCamisa",
};

// Nomes já 100% cobertos pela ficha (universal) — o rebuild não processa
// esses no loop de função, pra não tentar criar uma segunda linha
// colaborador+nome (violaria o @@unique) nem contar errado quem já foi
// contado via ficha.
export const NOMES_FICHA_UNIVERSAL = new Set(Object.keys(CAMPO_TAMANHO_POR_NOME));

// Pra EPI sem tamanho na ficha (capacete, colete, luva, óculos...), a
// matriz "Regras por função" (EpiFuncaoRegra, importada da aba "EPIs por
// Função") diz, por contrato, qual função usa qual EPI, em texto livre.
// Cruza por palavra-chave (testado linha a linha contra as 249 regras
// reais antes de subir) pra saber quem precisa daquele item. Cada padrão é
// "tem que conter todas as palavras de `inclui` e nenhuma de `exclui`"
// numa mesma LINHA da descrição (uma regra pode listar vários itens, um
// por linha — por isso o cruzamento é linha a linha, não na descrição
// inteira, senão "óculos incolor" e "óculos escuro" na mesma regra se
// misturariam). Item sem padrão aqui (acessório avulso, ou realmente sem
// regra de função — capa de chuva, protetor solar, macacão apicultor não
// estão na planilha de função) fica sem "quantidade em uso" real.
export type PadraoFuncao = { inclui: string[]; exclui?: string[] };
export const PADROES_FUNCAO: Record<string, PadraoFuncao[]> = {
  BALACLAVA: [{ inclui: ["balaclava"] }],
  "CAPACETE BRANCO": [{ inclui: ["capacete branco"] }],
  "CAPACETE AZUL": [{ inclui: ["capacete azul"] }],
  "CAPACETE LARANJA": [{ inclui: ["capacete laranja"] }],
  "CAPACETE CINZA": [{ inclui: ["capacete cinza"] }],
  CARNEIRA: [{ inclui: ["carneira"] }],
  "JUGULAR PARA CAPACETE": [{ inclui: ["jugular"] }],
  "TOUCA ÁRABE": [{ inclui: ["touca arabe"] }],
  "PROTETOR FACIAL TELADO": [{ inclui: ["protetor facial telado"] }],
  "ÓCULOS DE PROTEÇÃO INCOLOR": [{ inclui: ["oculos icolor"] }, { inclui: ["incolor"], exclui: ["banda elastica", "ampla visao", "sobrepor"] }],
  "ÓCULOS DE PROTEÇÃO ESCURO": [
    { inclui: ["oculos escuro"], exclui: ["banda elastica", "ampla visao", "sobrepor"] },
    { inclui: ["cinza"], exclui: ["banda elastica", "ampla visao", "sobrepor", "incolor"] },
  ],
  "ÓCULOS INCOLOR COM BANDA ELÁSTICA": [{ inclui: ["incolor", "banda elastica"] }],
  "ÓCULOS ESCURO COM BANDA ELÁSTICA": [{ inclui: ["cinza", "banda elastica"] }, { inclui: ["escuro", "banda elastica"] }],
  "COLETE REFLETIVO": [{ inclui: ["colete refletivo"] }],
  "COLETE SALVA-VIDAS": [{ inclui: ["colete salva"] }],
  "BLUSÃO DE OPERADOR DE MOTOSSERRA": [{ inclui: ["blusao de op"] }, { inclui: ["blusao operador"] }],
  "AVENTAL DE PVC": [{ inclui: ["avental"] }],
  "LUVA ANTICORTE": [{ inclui: ["anti corte"] }, { inclui: ["anticorte"] }],
  "LUVA DE OPERADOR DE MOTOSSERRA": [{ inclui: ["operador de motosserra"], exclui: ["calca", "blusao", "bota"] }],
  "LUVA DE LÁTEX": [{ inclui: ["latex"], exclui: ["descartaveis", "procedimento"] }],
  "LUVA DE LÁTEX DESCARTÁVEL": [{ inclui: ["latex", "descartaveis"] }, { inclui: ["latex", "procedimento"] }],
  "LUVA NITRILICA": [{ inclui: ["nitrilica"] }],
  "LUVA PU": [{ inclui: ["luva pu"] }],
  "LUVA DE VAQUETA": [{ inclui: ["vaqueta"], exclui: ["punho em raspa"] }],
  "LUVA DE RASPA CANO LONGO": [{ inclui: ["raspa cano longo"] }],
  "LUVA ANTI-IMPACTO": [{ inclui: ["impacto"] }], // fonte real: "luva anti - impacto - 5.774" (hífen com espaço nos dois lados)
  "LUVA ANTI-TÉRMICA": [{ inclui: ["agentes termicos"] }],
  "PERNEIRA COM PROTEÇÃO DE JOELHO": [{ inclui: ["protecao de joelho"] }],
  "PERNEIRA DE BIDIM": [{ inclui: ["perneira"], exclui: ["protecao de joelho"] }],
  "CALÇA DE OPERADOR DE MOTOSSERRA": [{ inclui: ["calca", "motosserra"] }],
  "BOTA COM PROTEÇÃO DE METATARSO": [{ inclui: ["protecao de metatars"] }],
};

// AUDIÇÃO, RESPIRATORIO e BRAÇOS só têm 1 item canônico cada na planilha de
// função (conferido nas 249 regras) — não precisa de palavra-chave, a
// categoria da regra já basta.
export const NOME_POR_CATEGORIA_UNICA: Record<string, string> = {
  "EPI - AUDIÇÃO": "PROTETOR AUDITIVO",
  "EPI - RESPIRATORIO": "PROTETOR RESPIRATÓRIO",
  "EPI - BRAÇOS": "MANGOTE",
};

export function normFuncaoTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function bateComPadrao(padroes: PadraoFuncao[], linhaNormalizada: string): boolean {
  return padroes.some((p) => p.inclui.every((s) => linhaNormalizada.includes(s)) && !(p.exclui ?? []).some((s) => linhaNormalizada.includes(s)));
}

// A função na ficha do colaborador tem sufixo de nível ("AUXILIAR DE CAMPO
// I, II E III") que a regra de EPI não tem ("AUXILIAR DE CAMPO") — comparar
// string exata zerava a contagem pra quase todo mundo (técnico de campo,
// biólogo, veterinário, analista ambiental...). Conferido nas 21 funções
// reais da ficha x 19 da regra: 8 só bateram depois de tirar acento e o
// sufixo de nível; 2 têm erro de digitação/abreviação na planilha de
// origem em si ("MÉD. VETERINARIO", "AUXILIAR DE LABORAÓRIO" sem o T) —
// corrigidas via alias pontual, não uma regra geral (evita casar coisa que
// não devia).
const ALIAS_FUNCAO: Record<string, string> = {
  "MED VETERINARIO": "MEDICO VETERINARIO",
  "AUXILIAR DE LABORAORIO": "AUXILIAR DE LABORATORIO",
};
export function normFuncaoNome(s: string): string {
  const base = s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
  return ALIAS_FUNCAO[base] ?? base;
}

// A função da regra ("AUXILIAR DE CAMPO") é a base — a da ficha
// ("AUXILIAR DE CAMPO I, II E III", "COORDENADOR DE CONTRATOS") só pode
// ser igual, ter só um "S" de plural a mais, ou continuar com espaço/vírgula
// (o sufixo de nível) — nunca uma palavra diferente colada sem separador.
export function funcaoColaboradorBateComRegra(funcaoColabNorm: string, funcaoRegraNorm: string): boolean {
  if (funcaoColabNorm === funcaoRegraNorm || funcaoColabNorm === funcaoRegraNorm + "S") return true;
  return funcaoColabNorm.startsWith(funcaoRegraNorm + " ") || funcaoColabNorm.startsWith(funcaoRegraNorm + ",");
}
