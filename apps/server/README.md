# @moshou/server

《墨守成规》在线对战 WebSocket 房间服务器（权威校验）。
服务器持有权威 `MatchState`，用 `@moshou/engine` 校验每一行动后广播全量状态。
协议见 [`docs/PROTOCOL.md`](../../docs/PROTOCOL.md)。

## 本地运行

```bash
# 依赖已随 workspace 安装；先构建引擎与服务器
pnpm --filter @moshou/engine build
pnpm --filter @moshou/server build

# 启动（默认 0.0.0.0:8787）
pnpm --filter @moshou/server start

# 开发模式（tsx watch）
pnpm --filter @moshou/server dev

# 类型检查
pnpm --filter @moshou/server typecheck

# 冒烟测试（自行拉起/复用本机服务器，通过输出 SMOKE OK）
pnpm --filter @moshou/server smoke
# 或：node apps/server/scripts/smoke.mjs
```

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | HTTP/WS 监听端口（Render/Fly 等平台会注入） |
| `HOST` | `0.0.0.0` | 监听地址 |

## 接口

- `GET /healthz` → `{"ok":true}`
- `WS /ws`：消息信封 `{t, ...}`，支持 `create` / `join` / `reconnect` / `ready` / `action` / `remove` / `ping`，详见 PROTOCOL.md。

### 房间码的传输（join）

PROTOCOL 中 `join` 只携带 `name`，未指定房间码的传输方式；本服务器按以下任一方式接收（两者可并存）：

- 连接地址查询参数：`ws://host/ws?code=XXXXXX`（推荐）；
- `join` 消息内的可选字段：`{ "t": "join", "name": "…", "code": "XXXXXX" }`。

`create` 由服务器生成 6 位房间码（字符集 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`）并随 `created` 下发——客户端应以 `created.code` 为准展示/分享。

## 服务器策略

- 双方 `ready` 且在线后开局（同一房间一场，开局后禁止重新开局）；
- 断线不立刻移除玩家：席位保留 **5 分钟**，凭 `token` 重连后收到 `resync` 恢复原身份；
- 整场结束后房间保留 **30 分钟** 再清理；
- 每 **60 秒** 巡检清理；未开局且从未有 guest 入场的闲置房间 **60 分钟** 后回收（防泄漏）；
- 单连接每秒最多 **20 条** 消息、单条消息 ≤ **64 KB**，超出即断开；
- 错误消息不包含任何其他房间的信息。

## 部署

### Docker

```bash
# 在仓库根目录执行（构建上下文 = 仓库根）
docker build -f apps/server/Dockerfile -t mscg-server .
docker run --rm -p 8787:8787 mscg-server
```

### Render（免费档）

仓库内已提供 [`render.yaml`](./render.yaml)，或在 Render 控制台手动配置：

1. New → Web Service → 选择仓库；
2. Dockerfile Path：`apps/server/Dockerfile`；
3. Health Check Path：`/healthz`；
4. Render 自动注入 `PORT`（免费档 10000），服务器按 `PORT` 监听，无需额外配置。

### Fly.io

```bash
fly launch --name mscg-server --no-deploy   # 检测到 Dockerfile，生成 fly.toml
# 注意端口一致性：Fly 注入 PORT=8080，
# 请把 fly.toml 中 services.internal_port 设为 8080（或把 [env] PORT 设为 8787 与 internal_port 一致）
fly deploy
fly open /healthz    # 验证 {"ok":true}
```

## 目录

- `src/index.ts` —— HTTP + WebSocket 入口与全部消息处理；
- `src/room.ts` —— 房间/注册表/房间码与 token 生成/清理策略；
- `src/protocol.ts` —— 信封解析、字段校验与发送辅助；
- `scripts/smoke.mjs` —— 冒烟测试（Node + ws，无需编译，但需先 build 出 `dist/`）。
