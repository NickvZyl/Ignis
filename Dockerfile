FROM node:20-slim AS base

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
FROM base AS runner
WORKDIR /app/web
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/web/public ./public
COPY --from=builder /app/web/.next/standalone ./
COPY --from=builder /app/web/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "web/server.js"]
