FROM node:24-bookworm-slim AS builder

WORKDIR /app

RUN npm install -g pnpm@11.25.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps
COPY tsconfig*.json ./

RUN pnpm install --frozen-lockfile

RUN pnpm --filter "./packages/*" build && \
    pnpm --filter @latex-collab/collab build && \
    pnpm --filter @latex-collab/jobs build && \
    pnpm --filter @latex-collab/api build

FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app /app

EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]
