# 部署说明

## 静态前端：GitHub Pages

仓库自带 Actions 工作流（`.github/workflows/deploy-pages.yml`）：推送到 main 后自动构建 `apps/web` 并发布到 Pages。

要点：

- 前端使用相对路径（`base: './'`），可部署在 `https://<用户名>.github.io/<仓库名>/` 任意子路径。
- **不配置服务器地址时，在线对战自动走 PeerJS 点对点直连**（公开的 PeerJS 云信令，无密钥、无后端）。这是「测试通道」：可用但依赖公共信令服务，稳定性不保证。
- 若需稳定联机，按下一节部署自建房间服务器，并在前端「设置 → 服务器地址」填入 `wss://你的域名`（路径自动补 `/ws`）。

### 首次启用 Pages

仓库 `Settings → Pages → Build and deployment → Source: GitHub Actions`。推送后 Actions 自动发布。

## 在线房间服务器：Render 示例

1. Render 新建 **Web Service**，连接本仓库；
2. Root Directory 填 `apps/server`；Build Command 保持 Dockerfile 方式或使用 `pnpm install && pnpm --filter @moshou/server build`，Start Command `pnpm --filter @moshou/server start`；
3. 环境变量 `PORT` 由平台注入（无需设置）；
4. Health Check Path 填 `/healthz`。

Fly.io 示例：

```bash
fly launch --name moshou-server --dockerfile apps/server/Dockerfile
fly deploy
```

## 本地自托管服务器

```bash
pnpm --filter @moshou/server build
PORT=8787 node apps/server/dist/index.js
```

服务器无状态、无数据库：房间保存在内存，空闲 2 小时自动清理；适合个人/小规模联机。若需要横向扩展，可按 docs/PROTOCOL.md 用 Redis 替换房间存储（未实现，欢迎贡献）。
