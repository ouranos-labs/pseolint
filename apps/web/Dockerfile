# Build from the repo root: docker build -f apps/web/Dockerfile .
FROM node:24.22.1-slim AS build
COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --linker=hoisted
# NEXT_PUBLIC_* are inlined at build time; everything else is read at runtime.
ARG NEXT_PUBLIC_SITE_URL=https://pseolint.dev
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_GOOGLE_INDEXING_ENABLED
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun x turbo run build --filter=@pseolint/web

FROM node:24.22.1-slim
# Coolify's healthcheck runs curl (or wget) inside the container.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && apt-get clean
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS -o /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "apps/web/server.js"]
