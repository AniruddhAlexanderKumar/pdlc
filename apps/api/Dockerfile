FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/shared-types/package*.json ./packages/shared-types/
COPY apps/api/package*.json ./apps/api/
COPY prisma ./prisma

RUN npm install

COPY packages/shared-types ./packages/shared-types
RUN npm run build --workspace=@nexgen/shared-types

COPY apps/api ./apps/api
RUN npx prisma generate
RUN npm run build --workspace=@nexgen/api

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

CMD ["node", "apps/api/dist/server.js"]
