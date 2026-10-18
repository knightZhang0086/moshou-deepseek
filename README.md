# 墨守成规 · 九攻九拒

取材《墨子·公输》的双人连线策略桌游。公输盘从南侧楚营向北侧宋城修筑红色攻城线；墨子自西境向东境铺设蓝色防线，或以木片池耗尽拖垮攻城。双方木片红蓝双面，一械可易，九攻九拒。

- 完整规则见 [RULES.md](RULES.md)（游戏内也可随时查阅）
- 平衡测试记录见 [docs/BALANCE.md](docs/BALANCE.md)
- 部署说明见 [docs/DEPLOY.md](docs/DEPLOY.md)
- 联机协议见 [docs/PROTOCOL.md](docs/PROTOCOL.md)

## 目录结构

```
packages/engine   # 核心规则引擎（纯 TS，零依赖；棋盘图/易械/十八张技能牌/整场状态机/AI）
apps/web          # 浏览器客户端（React + Vite + zustand；热座/人机/在线）
apps/server       # 在线对战 WebSocket 房间服务器（权威校验；Node + ws）
```

## 本地运行

要求：Node.js ≥ 20，pnpm ≥ 9。

```bash
pnpm install          # 安装全部依赖（Windows 沙箱环境需 $env:CI="true"; pnpm install --no-frozen-lockfile）
pnpm build            # 编译引擎 + 构建前端
pnpm test             # 引擎单元测试（56 项，含不变量模糊测试与 AI 合法性测试）
```

### 本地热座 / 人机

```bash
pnpm dev:web          # Vite 开发服务器 http://localhost:5173
```

### 在线对战（本机验证）

```bash
pnpm dev:server       # 房间服务器 ws://localhost:8787（生产：pnpm --filter @moshou/server build && pnpm --filter @moshou/server start）
```

前端「设置 → 服务器地址」填入 `ws://localhost:8787` 即走服务器模式；留空则走 PeerJS 点对点直连（测试通道，静态部署也能联机）。两个浏览器标签页即可完整验证创建/加入/对战/断线重连。

### 平衡模拟（AI vs AI）

```bash
pnpm sim -- --games 100 --level easy            # 默认 7×7 池 28
pnpm sim -- --sweep --games 40 --level medium   # 扫描 5/7/9 规格与多档池数量
```

## 测试

```bash
pnpm test
```

覆盖：南北/东西贯通与转角线路、易械后线路更新、稳固双端保护、禁连/禁劫、技能消耗与恢复、木片池耗尽、最后一根木片贯通、小局弃牌、五胜整场胜负、重复提交与越权行动拒绝、总量守恒模糊测试、AI 全对局合法性。

## 部署

见 [docs/DEPLOY.md](docs/DEPLOY.md)。静态前端可部署 GitHub Pages（在线对战自动走 PeerJS）；完整在线体验可另部署 apps/server（Render / Fly.io 示例配置已备好）。

## 许可

MIT
