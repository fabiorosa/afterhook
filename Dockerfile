FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/console/package.json apps/console/package.json
COPY apps/destination/package.json apps/destination/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/delivery/package.json packages/delivery/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/orchestration/package.json packages/orchestration/package.json
RUN npm ci

COPY . .
RUN npm run build && npm --workspace @afterhook/console run build

ENV NODE_ENV=production
ENV HOST=::
CMD ["node", "scripts/dist/start-service.js"]
