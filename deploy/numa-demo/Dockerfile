FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_OPTIONS=--dns-result-order=ipv4first

COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
COPY scripts ./scripts

RUN npm ci

USER node

CMD ["node", "--import", "tsx", "packages/runtime/src/serve-installation.ts"]
