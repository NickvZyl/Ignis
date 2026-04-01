FROM node:20 AS base

# Install dependencies
FROM base AS deps
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY src ./src
COPY web ./web
COPY --from=deps /app/web/node_modules ./web/node_modules
WORKDIR /app/web
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

# Production
FROM node:20-slim AS runner
WORKDIR /app
COPY --from=builder /app/src ./src
COPY --from=builder /app/web ./web
WORKDIR /app/web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
