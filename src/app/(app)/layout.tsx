"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import ConsominasLogo from "@/components/ConsominasLogo";

const tabs = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/estoque", label: "Estoque" },
  { href: "/movimentacoes", label: "Movimentações" },
  { href: "/colaboradores", label: "Colaboradores" },
  { href: "/catalogo", label: "Catálogo por função" },
  { href: "/metricas", label: "Métricas" },
  { href: "/importar", label: "Importar planilha" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="glass shadow-soft sticky top-0 z-40 border-b border-white/60 px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <ConsominasLogo size={28} />
            <div>
              <p className="text-sm font-semibold text-ink">Almoxarifado EPI/EPC</p>
              <p className="text-xs text-gray-400">Grupo Consominas</p>
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-xs font-medium text-gray-400 hover:text-accent">
            Sair
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-wrap gap-1 border-b border-gray-200">
          {tabs.map((t) => {
            const active = pathname?.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                  active ? "border-b-2 border-brand text-brand-dark" : "border-b-2 border-transparent text-gray-500 hover:text-brand-dark"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </div>
  );
}
