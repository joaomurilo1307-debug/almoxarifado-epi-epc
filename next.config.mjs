/** @type {import('next').NextConfig} */
const nextConfig = {
  // Abas do sistema antigo que não existem mais: quem tinha o link salvo cai no Estoque.
  async redirects() {
    return ["/dashboard", "/estoque-minimo", "/conferencia-estoque", "/movimentacoes", "/colaboradores", "/metricas", "/importar"].map((source) => ({
      source,
      destination: "/estoque",
      permanent: false,
    }));
  },
};

export default nextConfig;
