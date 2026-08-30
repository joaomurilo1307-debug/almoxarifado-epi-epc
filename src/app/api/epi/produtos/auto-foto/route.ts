import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Casa cada produto do catálogo com uma FOTO DE REFERÊNCIA real (extraída do
// book de EPI oficial da empresa, EPI.xlsx — não é a foto exata daquele SKU/marca
// específico do estoque, é o tipo genérico do item, pra dar uma cara visual real
// ao catálogo sem inventar imagem nenhuma). Casamento por palavra-chave no nome,
// mais específico primeiro. Só preenche quem ainda não tem foto — não sobrescreve
// uma foto que o usuário já tenha definido manualmente.
const REGRAS: { re: RegExp; foto: string }[] = [
  { re: /BOTA.*(IMPERME|PVC|CANO LONGO)/i, foto: "009_Bota_de_seguran_a_imperme_vel.png" },
  { re: /(BOTA|BOTINA|COTURNO)/i, foto: "007_Bota_de_couro_com_biqueira_de_composite_Com_ou_sem.jpeg" },
  { re: /TOUCA/i, foto: "010_Touca_arabe.png" },
  { re: /CAPACETE/i, foto: "011_Capacete_aba_frontal_carneira_ajuste_f_cil.jpeg" },
  { re: /CARNEIRA/i, foto: "012_Carneira.png" },
  { re: /J[UÚ]LGULAR|JUGULAR/i, foto: "013_Julgular.png" },
  { re: /PERNEIRA/i, foto: "014_Perneira_com_prote_o_nos_joelhos.png" },
  { re: /LUVA.*MOTOSSERR/i, foto: "016_Luva_motosserrista_vaqueta.png" },
  { re: /LUVA.*(ANTI.?CORTE|CORTE)/i, foto: "022_Luva_para_prote_o_contra_agentes_t_rmicos_e_mec_ni.png" },
  { re: /LUVA.*(IMPACTO)/i, foto: "017_Luva_de_vaqueta_antimpacto.png" },
  { re: /LUVA.*T[ÉE]RMIC/i, foto: "019_Luva_termica.png" },
  { re: /LUVA.*(IMPERME|LATEX|L[ÁA]TEX|NITRIL)/i, foto: "020_Luva_imperme_vel.png" },
  { re: /LUVA.*VAQUETA/i, foto: "018_Luva_de_vaqueta.png" },
  { re: /LUVA.*PU\b/i, foto: "018_Luva_de_vaqueta.png" },
  { re: /MANGOTE/i, foto: "023_Mangote_de_prote_o.png" },
  { re: /[ÓO]CULOS.*(SOBREP)/i, foto: "024__culos_de_seguran_a_de_sobrepor.png" },
  { re: /[ÓO]CULOS.*(BANDA|EL[ÁA]STICA)/i, foto: "026__culos_de_seguran_a_com_banda_el_stica_claro_ou_es.png" },
  { re: /[ÓO]CULOS/i, foto: "025__culos_de_seguran_a_convenciona_claro_ou_escuro_.png" },
  { re: /ABAFADOR|PROTETOR AUDITIVO/i, foto: "027_Kit_Abafador_XLS.png" },
  { re: /M[ÁA]SCARA|RESPIRADOR|PFF ?2/i, foto: "028_Mascara_semifacial_descart_vel_particulados_.png" },
  { re: /PROTETOR SOLAR/i, foto: "029_PROTETOR_SOLAR_FPS_50_COM_REPELENTE_DE_INSETOS_SUN.png" },
  { re: /COLETE.*SALVA/i, foto: "032_Colete_salva_vidas.png" },
  { re: /COLETE/i, foto: "030_Colete_refletivo.png" },
  { re: /CAPA DE CHUVA/i, foto: "031_Capa_de_chuva.png" },
  { re: /BLUS[ÃA]O.*MOTOSSERRA|JAQUETA.*MOTOSSERRA/i, foto: "047_Blus_o_Jaqueta_operador_de_motosserra.png" },
  { re: /CAL[ÇC]A.*MOTOSSERRA|CAL[ÇC]A.*OPERADOR/i, foto: "048_Cal_a_operador_de_motosserra.png" },
  { re: /CAL[ÇC]A/i, foto: "044_Cal_a_brim_cinza_refletiva.jpeg" },
  { re: /CAMISA.*SOCIAL/i, foto: "045_Camisa_social.jpeg" },
  { re: /CAMISA.*POLO/i, foto: "046_Camisa_polo.png" },
  { re: /BLUSA/i, foto: "043_Blusa_refletiva.jpeg" },
];

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const produtos = await prisma.epiProduto.findMany({ where: { fotoUrl: null } });
  let atualizados = 0;
  for (const p of produtos) {
    const regra = REGRAS.find((r) => r.re.test(p.nome));
    if (!regra) continue;
    await prisma.epiProduto.update({ where: { id: p.id }, data: { fotoUrl: `/epi-fotos/${regra.foto}` } });
    atualizados++;
  }
  return NextResponse.json({ atualizados, semMatch: produtos.length - atualizados });
}
