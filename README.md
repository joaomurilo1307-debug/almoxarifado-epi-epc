# Almoxarifado EPI/EPC — Grupo Consominas

Controle de estoque mínimo de EPI, EPC e fardamento, por contrato — colaboradores,
catálogo, regras de EPI por função, movimentações de entrada/saída e dashboard,
tudo em um sistema separado (pensado pra depois ser incorporado ao sistema de
chamados).

Stack: Next.js 14 (App Router) + TypeScript + Tailwind + Prisma/PostgreSQL + NextAuth,
mesmo padrão visual e de deploy do consominas-gestao.

## Rodar localmente

```bash
cp .env.example .env   # preencha as variáveis
docker compose up --build
```

## Deploy

Build automático via GitHub Actions (`.github/workflows/docker-build.yml`) publica a
imagem em `ghcr.io/<owner>/almoxarifado-epi-epc:latest`; o `docker-compose.yaml` é
aplicado na VPS via Hostinger, mesmo servidor do consominas-gestao, sob o domínio
`almoxarifado.srv1834707.hstgr.cloud`.
