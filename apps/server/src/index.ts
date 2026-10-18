/**
 * 《墨守成规》在线对战 WebSocket 房间服务器（权威校验）。
 *
 * - HTTP  GET /healthz → {"ok":true}
 * - WS    /ws         → 消息信封 {t, ...}，协议见 docs/PROTOCOL.md
 *
 * 服务器持有权威 MatchState，用 @moshou/engine 校验一切行动后广播全量状态。
 */
import http from 'node:http';
import { chooseRemoval, newMatch, performAction } from '@moshou/engine';
import type { CardId, MatchState, Side } from '@moshou/engine';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import { Room, RoomRegistry, generateToken } from './room.js';
import type { Player } from './room.js';
import {
  MAX_MESSAGE_BYTES,
  RATE_LIMIT_PER_SECOND,
  parseAction,
  parseConfig,
  parseEnvelope,
  parseName,
  send,
  sendError,
} from './protocol.js';

const PORT = (() => {
  const raw = Number.parseInt(process.env['PORT'] ?? '8787', 10);
  return Number.isInteger(raw) && raw >= 1 && raw <= 65535 ? raw : 8787;
})();
const HOST = process.env['HOST'] ?? '0.0.0.0';
const SWEEP_INTERVAL_MS = 60 * 1000;

const registry = new RoomRegistry();

// ---------- HTTP（健康检查） ----------

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end('{"ok":true}');
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

// ---------- WebSocket ----------

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: MAX_MESSAGE_BYTES,
});

interface ConnState {
  ws: WebSocket;
  /** 连接 URL 携带的房间码（join 用） */
  urlCode: string | null;
  room: Room | null;
  side: Side | null;
  rateWindowStart: number;
  rateCount: number;
}

/** 向对手发送上线/离线通知 */
function notifyPeer(room: Room, side: Side): void {
  const other: Side = side === 'red' ? 'blue' : 'red';
  const mine = room.players[side];
  const theirs = room.players[other];
  if (mine && theirs?.socket) {
    send(theirs.socket, { t: 'peer', name: mine.name, present: mine.present });
  }
}

/** 向房间内所有在线玩家广播 */
function broadcast(room: Room, msg: object): void {
  for (const side of ['red', 'blue'] as const) {
    const p = room.players[side];
    if (p?.socket) send(p.socket, msg);
  }
}

/** 双方就绪且在线则开局（同一房间一场，开局后不再重开） */
function maybeStart(room: Room): void {
  if (room.state !== null) return;
  const red = room.players.red;
  const blue = room.players.blue;
  if (red?.ready && blue?.ready && red.present && blue.present) {
    room.state = newMatch(room.config);
    broadcast(room, { t: 'state', state: room.state });
  }
}

function onSocketClose(conn: ConnState): void {
  const room = conn.room;
  if (!room || !conn.side) return;
  const player = room.players[conn.side];
  // 该席位已被顶号/重连替换或已移除时，旧连接关闭不触发离线广播
  if (!player || player.socket !== conn.ws) return;
  player.present = false;
  player.disconnectAt = Date.now();
  player.socket = null;
  notifyPeer(room, conn.side);
}

function onMessage(conn: ConnState, data: RawData, isBinary: boolean): void {
  const ws = conn.ws;
  if (ws.readyState !== WebSocket.OPEN) return;
  if (isBinary) {
    sendError(ws, 'ILLEGAL', '只接受文本消息');
    ws.close(1003, 'text frames only');
    return;
  }
  // 限速：单连接每秒最多 RATE_LIMIT_PER_SECOND 条消息
  const now = Date.now();
  if (now - conn.rateWindowStart >= 1000) {
    conn.rateWindowStart = now;
    conn.rateCount = 0;
  }
  conn.rateCount += 1;
  if (conn.rateCount > RATE_LIMIT_PER_SECOND) {
    ws.close(1008, 'rate limit exceeded');
    return;
  }
  const parsed = parseEnvelope(data);
  if (!parsed.ok) {
    sendError(ws, 'ILLEGAL', '消息必须是合法的 JSON 信封');
    ws.close(parsed.oversize ? 1009 : 1003, parsed.oversize ? 'message too big' : 'bad envelope');
    return;
  }
  handle(conn, parsed.msg);
}

function handle(conn: ConnState, msg: Record<string, unknown>): void {
  switch (msg['t']) {
    case 'create':
      handleCreate(conn, msg);
      break;
    case 'join':
      handleJoin(conn, msg);
      break;
    case 'reconnect':
      handleReconnect(conn, msg);
      break;
    case 'ready':
      handleReady(conn);
      break;
    case 'action':
      handleAction(conn, msg);
      break;
    case 'remove':
      handleRemove(conn, msg);
      break;
    case 'ping':
      send(conn.ws, { t: 'pong' });
      break;
    default:
      sendError(conn.ws, 'ILLEGAL', `未知消息类型: ${String(msg['t'])}`);
      break;
  }
}

function handleCreate(conn: ConnState, msg: Record<string, unknown>): void {
  if (conn.room) {
    sendError(conn.ws, 'ILLEGAL', '此连接已加入房间');
    return;
  }
  const name = parseName(msg['name']);
  if (!name) {
    sendError(conn.ws, 'ILLEGAL', '昵称不合法（需为 1-24 字符）');
    return;
  }
  const config = parseConfig(msg['config']);
  if (!config) {
    sendError(conn.ws, 'ILLEGAL', '棋盘配置不合法：size 须为 5/7/9，pool 须为 1-400 的整数，firstTurn 须为 red 或 blue');
    return;
  }
  const room = registry.create(config);
  const token = generateToken();
  const player: Player = {
    name,
    token,
    side: 'red',
    socket: conn.ws,
    present: true,
    ready: false,
    disconnectAt: null,
  };
  registry.seat(room, 'red', player);
  conn.room = room;
  conn.side = 'red';
  send(conn.ws, { t: 'created', code: room.code, token });
}

function handleJoin(conn: ConnState, msg: Record<string, unknown>): void {
  if (conn.room) {
    sendError(conn.ws, 'ILLEGAL', '此连接已加入房间');
    return;
  }
  const name = parseName(msg['name']);
  if (!name) {
    sendError(conn.ws, 'ILLEGAL', '昵称不合法（需为 1-24 字符）');
    return;
  }
  // 房间码：连接 URL ?code= 或 join 消息内可选 code 字段
  const rawCode =
    typeof msg['code'] === 'string' && msg['code'].trim().length > 0 ? msg['code'] : conn.urlCode;
  if (!rawCode) {
    sendError(conn.ws, 'NO_ROOM', '缺少房间码（请通过 ?code= 查询参数或 join 消息的 code 字段传入）');
    return;
  }
  const code = rawCode.trim().toUpperCase();
  const room = registry.get(code);
  if (!room) {
    sendError(conn.ws, 'NO_ROOM', '房间不存在');
    return;
  }
  if (room.players.blue) {
    sendError(conn.ws, 'ROOM_FULL', '房间已满');
    return;
  }
  const host = room.players.red;
  if (!host) {
    sendError(conn.ws, 'NO_ROOM', '房间不存在');
    return;
  }
  if (host.name === name) {
    sendError(conn.ws, 'ILLEGAL', '昵称与房主重复');
    return;
  }
  const token = generateToken();
  const player: Player = {
    name,
    token,
    side: 'blue',
    socket: conn.ws,
    present: true,
    ready: false,
    disconnectAt: null,
  };
  registry.seat(room, 'blue', player);
  room.guestEver = true;
  conn.room = room;
  conn.side = 'blue';
  send(conn.ws, { t: 'joined', token, state: room.state });
  notifyPeer(room, 'blue'); // host 收到 guest 上线通知
  notifyPeer(room, 'red'); // guest 收到 host 在线状态
}

function handleReconnect(conn: ConnState, msg: Record<string, unknown>): void {
  if (conn.room) {
    sendError(conn.ws, 'ILLEGAL', '此连接已在房间中');
    return;
  }
  const token = msg['token'];
  if (typeof token !== 'string' || token === '') {
    sendError(conn.ws, 'BAD_TOKEN', 'token 无效');
    return;
  }
  const target = registry.findByToken(token);
  if (!target) {
    sendError(conn.ws, 'BAD_TOKEN', 'token 无效或席位已过期');
    return;
  }
  const { room, side } = target;
  const player = room.players[side];
  if (!player) {
    sendError(conn.ws, 'BAD_TOKEN', 'token 无效或席位已过期');
    return;
  }
  // 同一 token 重复连接：新连接顶掉旧连接
  if (player.socket && player.socket !== conn.ws) {
    try {
      player.socket.close(4001, 'replaced by new connection');
    } catch {
      /* ignore */
    }
  }
  player.socket = conn.ws;
  player.present = true;
  player.disconnectAt = null;
  conn.room = room;
  conn.side = side;
  send(conn.ws, { t: 'resync', state: room.state });
  notifyPeer(room, side); // 对手收到上线通知
  maybeStart(room);
}

function handleReady(conn: ConnState): void {
  if (!conn.room || !conn.side) {
    sendError(conn.ws, 'ILLEGAL', '尚未加入房间');
    return;
  }
  const player = conn.room.players[conn.side];
  if (!player) {
    sendError(conn.ws, 'ILLEGAL', '尚未加入房间');
    return;
  }
  player.ready = true;
  maybeStart(conn.room);
}

function handleAction(conn: ConnState, msg: Record<string, unknown>): void {
  const room = conn.room;
  const side = conn.side;
  if (!room || !side) {
    sendError(conn.ws, 'ILLEGAL', '尚未加入房间');
    return;
  }
  const state: MatchState | null = room.state;
  if (!state) {
    sendError(conn.ws, 'NOT_STARTED', '对局尚未开始');
    return;
  }
  if (state.matchWinner) {
    sendError(conn.ws, 'ILLEGAL', '比赛已结束');
    return;
  }
  if (state.round.turn !== side) {
    sendError(conn.ws, 'NOT_YOUR_TURN', '不是你的回合');
    return;
  }
  const seq = msg['seq'];
  if (typeof seq !== 'number' || !Number.isInteger(seq)) {
    sendError(conn.ws, 'BAD_SEQ', 'seq 必须是整数');
    return;
  }
  if (seq !== state.round.log.length) {
    sendError(conn.ws, 'BAD_SEQ', `行动序号错误：期望 ${state.round.log.length}，收到 ${seq}`);
    return;
  }
  const action = parseAction(msg['action']);
  if (!action) {
    sendError(conn.ws, 'ILLEGAL', '行动格式不合法');
    return;
  }
  try {
    performAction(state, action);
  } catch (err) {
    sendError(conn.ws, 'ILLEGAL', err instanceof Error ? err.message : '非法行动');
    return;
  }
  broadcast(room, { t: 'state', state });
}

function handleRemove(conn: ConnState, msg: Record<string, unknown>): void {
  const room = conn.room;
  const side = conn.side;
  if (!room || !side) {
    sendError(conn.ws, 'ILLEGAL', '尚未加入房间');
    return;
  }
  const state: MatchState | null = room.state;
  if (!state) {
    sendError(conn.ws, 'NOT_STARTED', '对局尚未开始');
    return;
  }
  const pending = state.pendingRemoval;
  if (!pending) {
    sendError(conn.ws, 'ILLEGAL', '当前没有待选择的弃牌');
    return;
  }
  if (pending.loser !== side) {
    sendError(conn.ws, 'NOT_YOUR_TURN', '只有败者可以为胜者选择弃牌');
    return;
  }
  const card = msg['card'];
  if (typeof card !== 'string') {
    sendError(conn.ws, 'ILLEGAL', '弃牌选择不合法');
    return;
  }
  try {
    const res = chooseRemoval(state, side, card as CardId);
    if (res.matchEnded) room.finishedAt = Date.now();
  } catch (err) {
    sendError(conn.ws, 'ILLEGAL', err instanceof Error ? err.message : '弃牌选择不合法');
    return;
  }
  broadcast(room, { t: 'state', state });
}

wss.on('connection', (ws, req) => {
  let urlCode: string | null = null;
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const c = url.searchParams.get('code');
    if (c) urlCode = c.trim().toUpperCase();
  } catch {
    urlCode = null;
  }

  const conn: ConnState = {
    ws,
    urlCode,
    room: null,
    side: null,
    rateWindowStart: Date.now(),
    rateCount: 0,
  };

  ws.on('error', () => {
    /* close 会随后触发 */
  });
  ws.on('message', (data, isBinary) => onMessage(conn, data, isBinary));
  ws.on('close', () => onSocketClose(conn));
});

wss.on('error', (err) => {
  console.error('[mscg] WebSocket 服务器错误:', err);
});

// ---------- 巡检与启动 ----------

setInterval(() => {
  const cleaned = registry.sweep(Date.now());
  if (cleaned > 0) console.log(`[mscg] 巡检清理 ${cleaned} 项`);
}, SWEEP_INTERVAL_MS);

server.on('error', (err) => {
  console.error('[mscg] HTTP 服务器错误:', err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[mscg] 《墨守成规》房间服务器已启动：http://${HOST}:${PORT}（WS /ws，健康检查 /healthz）`);
});
