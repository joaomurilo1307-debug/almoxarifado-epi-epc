export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/estoque/:path*",
    "/movimentacoes/:path*",
    "/colaboradores/:path*",
    "/catalogo/:path*",
    "/metricas/:path*",
    "/importar/:path*",
  ],
};
