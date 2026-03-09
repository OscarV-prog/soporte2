# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY nx.json ./
COPY tsconfig.base.json ./

RUN npm install

COPY . .

# Generate Prisma Client (needed for build)
RUN npx prisma generate --schema=apps/quetzaltic-api/prisma/schema.prisma

# Build API
RUN npx nx build quetzaltic-api --prod

# Stage 2: Production
FROM node:20-alpine

# Install netcat (for entrypoint wait)
RUN apk add --no-cache netcat-openbsd

WORKDIR /app

# Copy built assets
COPY --from=builder /app/dist/apps/quetzaltic-api ./
# Copy prisma schema and migrations
COPY --from=builder /app/apps/quetzaltic-api/prisma ./prisma
# Copy scripts for seed/reset
COPY --from=builder /app/scripts ./scripts
# Copy root package.json for npx commands
COPY package*.json ./

# Install production dependencies + ts-node for scripts
RUN npm install --omit=dev pino-pretty && npm install tsx typescript -g
RUN npx prisma@6.19.2 generate --schema=./prisma/schema.prisma

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Entrypoint setup
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { if (res.statusCode === 200) process.exit(0); else process.exit(1); })"

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
