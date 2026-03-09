#!/bin/sh

# Esperar a que la DB esté lista (segunda capa de seguridad tras el healthcheck de docker-compose)
until nc -z postgres-test 5432; do
  echo "Waiting for postgres..."
  sleep 1
done

echo "🚀 Running schema synchronization..."
npx prisma@6.19.2 db push --accept-data-loss

echo "🌱 Running database seed..."
npx tsx scripts/seed-data.ts

echo "🔥 Starting application..."
node main.js
