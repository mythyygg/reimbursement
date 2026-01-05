# syntax=docker/dockerfile:1

# 1. Install all dependencies (including dev) for building
FROM node:24-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

# 2. Re-install only production dependencies
# We need a separate stage because pruning 'deps' is complex in monorepos
FROM node:24-slim AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci --omit=dev

# 3. Build the application
FROM deps AS build
WORKDIR /app

COPY tsconfig.base.json ./
COPY apps/api/tsconfig.json apps/api/tsconfig.json

COPY apps/api/src apps/api/src

RUN npm --workspace apps/api run build

# 4. Final Production Image
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Only copy necessary package files for runtime checks (not for install)
COPY package.json ./
COPY apps/api/package.json apps/api/package.json

# Copy production dependencies from prod-deps stage
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules

# Copy built application
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle

EXPOSE 8787

CMD ["node", "apps/api/dist/server.js"]
