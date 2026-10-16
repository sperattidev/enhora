# syntax=docker/dockerfile:1.7
# Static apps (comercios + panel, cadete) served by Caddy. Build from the repository root:
#   docker build -f infra/docker/web.Dockerfile -t enhora-web .

FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --offline
# The API lives on its own origin; the apps call it with credentials (same site, so the
# SameSite=Strict refresh cookie still travels).
ARG VITE_API_URL=https://api.enhora.net.ar
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm turbo run build --filter=@enhora/web --filter=@enhora/rider

FROM caddy:2-alpine AS runtime
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv/web
COPY --from=build /repo/apps/rider/dist /srv/rider
