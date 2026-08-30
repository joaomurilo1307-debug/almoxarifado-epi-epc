import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Almoxarifado EPI/EPC | Grupo Consominas",
  description: "Controle de estoque mínimo de EPI, EPC e fardamento, por contrato.",
};

export const viewport: Viewport = {
  themeColor: "#00A99D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
