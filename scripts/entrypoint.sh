#!/bin/sh

# En producción no necesitamos esperar por un host local de Postgres
# La conexión se manejará directamente por Prisma usando DATABASE_URL

echo "🚀 Running schema synchronization..."
npx prisma@6.19.2 db push --accept-data-loss

echo "🔥 Starting application..."
node main.js
