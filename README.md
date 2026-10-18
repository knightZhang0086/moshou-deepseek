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
pnpm test        # 引擎单元测试 59 项
pnpm e2e         # 浏览器端到端 21 项（需本机 Chrome/Edge；先构建 web 与 server）
```

- **引擎单元测试（59 项）**：南北/东西贯通与转角线路、易械后线路更新、稳固双端保护与城墙接应、禁连/禁劫、技能消耗与恢复、木片池耗尽、最后一根木片贯通、小局弃牌、五胜整场胜负、重复提交与越权行动拒绝、总量守恒模糊测试、AI 全对局合法性。
- **浏览器端到端（23 项，playwright-core + 系统浏览器）**：主菜单与本地对局（91 桥位、红/蓝落子、横竖朝向、规则与牌库弹窗、易械可用性）、**完整五局三胜整场对局**（小局结束→败者弃牌→下一小局→整场结算）、人机对战（AI 应手与命名）、**WebSocket 联机**（建房/加入/准备/开局/双向同步/越权拒绝）、**PeerJS 点对点联机**（静态托管默认联机方式）、移动端视口（390×844）、页面无 JS 错误。
- **服务器冒烟（22 项）**：`node apps/server/scripts/smoke.mjs`（房间生命周期、seq 防重放、非法行动、断线重连、限流与超长消息）。

## 已验证状态（v0.5）

| 项目 | 验证方式 | 状态 |
| --- | --- | --- |
| 核心规则与胜负判定 | 引擎单元测试 + 模糊测试 | ✅ |
| 本地热座完整对局 | 浏览器 E2E（含五局三胜） | ✅ |
| 人机对战 | 浏览器 E2E + 引擎 AI 测试 | ✅ |
| 邀请码在线对战（服务器模式） | 浏览器 E2E 双上下文 + 服务器冒烟 22 项 | ✅ |
| 邀请码在线对战（点对点直连） | 浏览器 E2E（PeerJS 公共信令） | ✅ 已跑通；无 TURN 中继，对称 NAT 环境可能连不上，建议自建服务器 |
| 十八张技能牌 | 引擎单测逐张覆盖 | ✅ |
| 规则书与牌库 | 主菜单/对局内均可查阅 | ✅ |
| 移动端适配 | E2E 390×844 视口 | ✅（9×9 在窄屏热区偏小） |
| 攻守平衡 | AI 自我对战模拟（真实胜率需真人测试） | ⚠️ 见 docs/BALANCE.md |

## 部署

见 [docs/DEPLOY.md](docs/DEPLOY.md)。静态前端可部署 GitHub Pages（在线对战自动走 PeerJS）；完整在线体验可另部署 apps/server（Render / Fly.io 示例配置已备好）。

## 许可

MIT
