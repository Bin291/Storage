# syntax=docker/dockerfile:1
# NestJS API — build cho Google Cloud Run.
#
# Dùng node:*-bookworm-slim (glibc), KHÔNG dùng alpine: sharp, @napi-rs/canvas
# và ffmpeg-static tải/link native binary build sẵn cho glibc, trên musl (alpine)
# dễ thiếu bản build tương ứng hoặc lỗi runtime khó debug.
#
# Cloud Run tự set PORT (mặc định 8080) và gọi container trên 0.0.0.0 — main.ts
# đã đọc process.env.PORT (xem config/configuration.ts) nên không cần sửa gì.
ARG NODE_VERSION=24.12.0

# ---------- base: cài openssl trước ở MỌI stage ----------
# Prisma `generate` tự dò libssl của container đang chạy để chọn đúng query-engine
# binary. Nếu stage build thiếu openssl, nó sẽ đoán đại (vd: openssl-1.1.x) trong khi
# stage runtime lại có openssl 3.0 (bookworm) -> lệch bản, engine load lỗi lúc chạy.
# Cài openssl ở base dùng chung cho cả build lẫn runtime để luôn khớp nhau.
FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---------- deps: cài toàn bộ dependency (kể cả dev) để build ----------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build: compile TypeScript + generate Prisma Client ----------
FROM deps AS build
WORKDIR /app
COPY . .
RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build

# ---------- prod-deps: chỉ cài dependency production (nhẹ hơn cho image cuối) ----------
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- runtime ----------
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Chạy bằng user thường (không phải root) — thực hành bảo mật tốt trên Cloud Run.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nestjs

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

USER nestjs

# Cloud Run bỏ qua EXPOSE (dùng $PORT) nhưng vẫn hữu ích khi chạy local bằng `docker run`.
EXPOSE 8080

CMD ["node", "dist/main.js"]
