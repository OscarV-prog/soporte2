#!/bin/bash

# Script para ejecutar la suite E2E en un entorno aislado con Docker

echo "🐳 Levantando entorno de pruebas..."
docker-compose -f docker-compose.test.yml up -d --build

# Esperar a que la API esté saludable
echo "⏳ Esperando a que el sistema esté Ready..."
attempts=0
until $(curl --output /dev/null --silent --head --fail http://localhost:3000/api/health); do
    if [ $attempts -gt 30 ]; then
      echo "❌ Timeout esperando a la API"
      docker-compose -f docker-compose.test.yml down
      exit 1
    fi
    printf '.'
    attempts=$((attempts+1))
    sleep 2
done
echo "🚀 Sistema listo!"

# Ejecutar pruebas con Nx
echo "🧪 Ejecutando suite de Hardening..."
npx nx e2e quetzaltic-api-e2e

E2E_EXIT_CODE=$?

# Limpieza
echo "🧹 Limpiando contenedores..."
docker-compose -f docker-compose.test.yml down

if [ $E2E_EXIT_CODE -eq 0 ]; then
  echo "✅ Todas las pruebas pasaron!"
else
  echo "❌ Algunas pruebas fallaron."
fi

exit $E2E_EXIT_CODE
