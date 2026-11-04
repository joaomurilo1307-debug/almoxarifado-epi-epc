#!/bin/sh
set -e

echo "Aplicando schema no banco..."
npx prisma db push --skip-generate --accept-data-loss

if [ "$RUN_SEED" = "true" ]; then
  echo "Rodando seed..."
  npx tsx prisma/seed.ts || true
fi

echo "Carregando o catalogo unico de itens (uma unica vez)..."
npx tsx scripts/carregar-catalogo.ts || true

echo "Preenchendo fotos de referencia do catalogo (uma unica vez)..."
npx tsx scripts/preencher-fotos.ts || true

echo "Conferindo cadastros duplicados (mesmo item com tamanho/higienizada no nome)..."
npx tsx scripts/unificar-duplicados.ts || true

echo "Iniciando aplicacao..."
exec npx next start -p 3000
