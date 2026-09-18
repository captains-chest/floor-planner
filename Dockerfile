# syntax=docker/dockerfile:1

FROM cgr.dev/chainguard/node:latest-dev AS build

USER root
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@12.4.2 --activate
USER node
WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY --chown=node:node angular.json tsconfig.json tsconfig.app.json ./
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src
RUN pnpm build

FROM cgr.dev/chainguard/nginx:latest

COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx/nginx.default.conf /etc/nginx/conf.d/nginx.default.conf
COPY deploy/nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist/floor-planner/browser /usr/share/nginx/html

EXPOSE 8080
