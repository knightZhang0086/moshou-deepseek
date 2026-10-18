# ---------- 构建阶段 ----------
FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.7.0

# 仅复制构建服务器所需的 workspace 部分（apps/web 不进入服务器镜像）
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/tsconfig.json packages/engine/
COPY packages/engine/src packages/engine/src
COPY apps/server/package.json apps/server/tsconfig.json apps/server/
COPY apps/server/src apps/server/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @moshou/engine build
RUN pnpm --filter @moshou/server build

# ---------- 运行阶段 ----------
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/engine packages/engine
COPY --from=build /app/apps/server apps/server
EXPOSE 8787
CMD ["node", "apps/server/dist/index.js"]
