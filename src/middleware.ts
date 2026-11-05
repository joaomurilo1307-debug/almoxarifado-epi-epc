export { default } from "next-auth/middleware";

// Telas que exigem login. As abas do sistema antigo (dashboard, movimentações, colaboradores...) foram removidas
// e redirecionam para /estoque (ver next.config.mjs).
export const config = {
  matcher: ["/estoque/:path*", "/catalogo/:path*"],
};
