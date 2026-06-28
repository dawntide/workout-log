# ironlog-api container (OPTIONAL alternative to the systemd path).
#
# ⚠️ BUILD CONTEXT = REPO ROOT (this image needs BOTH web/ and apps/api/, because
#    apps/api resolves @/* -> ../../web/src/* and the web source imports drizzle/pg
#    from web/node_modules at runtime). Build from the repo root:
#
#    docker build -f apps/api/deploy/Dockerfile -t ironlog-api .
#    docker run --rm -p 8787:8787 --env-file apps/api/.env ironlog-api
#
# ⚠️ Not build-tested in-session (no Docker here). Validate on your host. If tsx
#    fails resolving esbuild's binary under pnpm 11, the `pnpm rebuild esbuild`
#    line below is the fix (kept proactively).
#
# Note: this installs web's full deps (Next.js etc.) → a large image. For a
# leaner image, try `pnpm install --prod` for web (runtime deps only) and verify
# the server code path still resolves everything.

FROM node:24-slim

# pnpm via corepack (pinned to match the repo)
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

WORKDIR /app

# 1) web: runtime deps (drizzle, pg, zod, ...) + source, resolved via @/* alias.
COPY web/ ./web/
RUN cd web && pnpm install --frozen-lockfile

# 2) apps/api: hono + @hono/node-server + tsx.
COPY apps/api/ ./apps/api/
RUN cd apps/api && pnpm install --frozen-lockfile \
    && pnpm rebuild esbuild   # ensure tsx's esbuild binary is set up under pnpm 11

WORKDIR /app/apps/api
ENV PORT=8787
EXPOSE 8787

# `pnpm start` == `tsx src/index.ts`
CMD ["pnpm", "start"]
