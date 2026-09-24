# ==============================================================
# Multi-stage Dockerfile for Binance Real-time Trading Terminal
# Optimized for Ubuntu Server / Debian Linux (x86_64 and arm64)
# ==============================================================

# --------------------------------------------------------------
# Stage 1: Build Stage (Vite Frontend + Esbuild Backend Bundle)
# --------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# 安装底层原生编译组件（better-sqlite3 与 esbuild 所需）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖清单并安装全部依赖（包含 devDependencies 构建工具）
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# 复制项目源代码
COPY . .

# 执行打包：编译前端 React SPA 到 dist 目录，并将 server.ts 打包为 dist/server.cjs
RUN npm run build

# --------------------------------------------------------------
# Stage 2: Production Minimal Runtime
# --------------------------------------------------------------
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# 默认环境变量配置（可通过 docker-compose 或 .env 覆盖）
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/trading.db \
    AUDIO_UPLOAD_DIR=/app/uploads/audio \
    TZ=Asia/Shanghai

# 安装运行时基础依赖：
# - ca-certificates: 确保连接币安 HTTPS / WSS 证书可信
# - curl: 供 Docker 容器健康检查（HEALTHCHECK）探针使用
# - tzdata: 确保系统日志与结算倒计时时区对齐（默认 Asia/Shanghai）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    tzdata \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

# 安装生产环境依赖（仅包含 dependencies）
COPY package.json package-lock.json* ./
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && (npm ci --omit=dev || npm install --omit=dev) \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# 复制 Stage 1 构建产物（前端静态资源 + 服务端打包产物 dist/server.cjs）
COPY --from=builder /app/dist ./dist

# 创建持久化数据与音频上传目录
RUN mkdir -p /app/data /app/uploads/audio

# 暴露服务端口
EXPOSE 3000

# 容器心跳与健康自愈检测
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/server-info || exit 1

# 启动量化交易终端服务端
CMD ["node", "dist/server.cjs"]
