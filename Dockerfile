FROM node:24.18-alpine

RUN corepack enable pnpm && corepack install -g pnpm@11.20.0

WORKDIR /app

ENV NODE_ENV production

RUN apk update --no-cache && apk upgrade --no-cache

# pnpm fetch does require only lockfile
COPY patches ./patches
# pnpm-workspace.yaml must be present BEFORE fetch: pnpm 11 reads its
# supply-chain policies (minimumReleaseAge=0, etc.) from it, and they are
# enforced at fetch time. Without it, fetch falls back to the v11 defaults
# (minimumReleaseAge=1440) and rejects freshly published lockfile entries.
COPY .pnpmfile.cjs pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY package.json ./
COPY scripts ./scripts
RUN pnpm fetch --prod

COPY api/package.json ./api/

# As we're going to deploy, we want only the minimal production dependencies.
RUN pnpm install --config.confirmModulesPurge=false --offline --frozen-lockfile --prod

COPY api/src ./api/src

WORKDIR /app/api
EXPOSE 3610
ENV PORT=3610
ENV TZ=Europe/Berlin
ARG API_VERSION
ENV API_VERSION=${API_VERSION:-docker_default}
ENV SENTRY_RELEASE=${API_VERSION:-docker_default}

CMD ["pnpm", "start"]
