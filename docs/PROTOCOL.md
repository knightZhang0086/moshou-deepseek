# 《墨守成规》在线对战协议（v1）

两个传输通道共用同一套 JSON 消息信封：

- **WebSocket**（正式通道）：连接 `wss://服务器/ws`，服务器持有权威 `MatchState`，校验一切行动。
- **PeerJS 点对点**（测试通道，静态部署可用）：房间创建者（host）持有权威状态，guest 通过 WebRTC 数据通道连接 host 的 peer id `mscg-<房间码>-0`。

消息信封统一为 `{ t: string, ... }`。房间码：6 位，字符集 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`（无易混淆字符）。

## 客户端 → 权威方

| 消息 | 字段 | 说明 |
| --- | --- | --- |
| `create` | `name, config: MatchConfig` | 创建房间；权威方生成 `code` 与 `token`，角色 host=red |
| `join` | `name` | guest 加入（连接建立后发送）；角色 guest=blue |
| `reconnect` | `token` | 断线后凭 token 恢复（仅 ws 模式） |
| `ready` | | 本方准备就绪 |
| `action` | `seq: number, action: Action` | 提交行动；`seq` 必须等于权威方 `round.log.length` |
| `remove` | `card: CardId` | 败者选择移除胜者的牌 |
| `ping` | | 保活 |

## 权威方 → 客户端

| 消息 | 字段 | 说明 |
| --- | --- | --- |
| `created` | `code, token` | 房间已创建（发给 host） |
| `joined` | `token, state: MatchState \| null` | guest 加入成功；`state` 为 null 表示尚未开局 |
| `resync` | `state: MatchState \| null` | 重连成功（ws 模式） |
| `state` | `state: MatchState` | 每次合法变更后的完整权威快照（幂等，全量替换） |
| `peer` | `name, present: boolean` | 对手上线/离线状态 |
| `error` | `code, message` | 错误：`NO_ROOM` / `ROOM_FULL` / `BAD_TOKEN` / `NOT_YOUR_TURN` / `ILLEGAL` / `BAD_SEQ` / `NOT_STARTED` |
| `pong` | | 保活应答 |

## 流程

1. host `create`（携带棋盘/木片池配置）→ `created`。
2. guest 凭房间码接入 → `join` → `joined`（双方互见 `peer`）。
3. 双方 `ready`；权威方在双方就绪后 `newMatch(config)` 并广播 `state`。
4. 轮流行动：当前行动方发送 `action`（`seq` 与权威方日志长度一致），权威方用引擎 `performAction` 校验并应用，广播 `state`。小局结束信息在 `state.pendingRemoval` 中。
5. 败者发送 `remove` 选择胜者被移除的牌，权威方 `chooseRemoval` 后广播 `state`；`state.matchWinner` 非空即整场结束。
6. 断线：ws 模式凭 `token` 重连后收到 `resync`；PeerJS 模式 guest 重新连接 host 的 peer id 并再次 `join`（host 以其为 resync）。

## 权威性

- ws 模式：服务器以 `@moshou/engine` 校验每一行动（防非法/重复/乱序提交）。
- PeerJS 模式：host 客户端以同一引擎校验 guest 提交；双方任何一步都来自引擎，不存在信任分歧。
