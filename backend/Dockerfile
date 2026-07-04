FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY config ./config
COPY src ./src
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations

RUN npx prisma generate
RUN npm run build

FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/config/tenant-defaults.json ./dist/src/config/tenant-defaults.json
COPY --from=builder /app/config ./config
COPY --from=builder /app/config ./dist/config
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations

EXPOSE 8080

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]




