#!/bin/sh
set -e

echo "Aplicando schema no banco..."
npx prisma db push --skip-generate --accept-data-loss

if [ "$RUN_SEED" = "true" ]; then
  echo "Rodando seed..."
  npx tsx prisma/seed.ts || true
fi

echo "Conferindo cadastros duplicados (mesmo item com tamanho/higienizada no nome)..."
npx tsx scripts/unificar-duplicados.ts || true

echo "Conferindo o estoque do ECC com o inventario de 14/09/2026..."
npx tsx scripts/conferir-estoque-ecc.ts || true

echo "Iniciando aplicacao..."
exec npx next start -p 3000
