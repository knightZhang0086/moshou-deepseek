/**
 * 协议层工具：信封解析、字段校验与发送辅助。
 * 消息信封与错误码见 docs/PROTOCOL.md。
 */
import { WebSocket } from 'ws';
import type { RawData } from 'ws';
import type { Action, CardId, MatchConfig, SkillParams } from '@moshou/engine';

/** 单条消息最大字节数（超出即断开） */
export const MAX_MESSAGE_BYTES = 64 * 1024;
/** 单连接每秒最大消息数（超出即断开） */
export const RATE_LIMIT_PER_SECOND = 20;
/** 昵称最大长度（字符） */
export const NAME_MAX_LENGTH = 24;
/** 公共木片池上限（合理正整数） */
export const MAX_POOL = 400;

export type ErrorCode =
  | 'NO_ROOM'
  | 'ROOM_FULL'
  | 'BAD_TOKEN'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL'
  | 'BAD_SEQ'
  | 'NOT_STARTED';

export function send(ws: WebSocket, msg: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function sendError(ws: WebSocket, code: ErrorCode, message: string): void {
  send(ws, { t: 'error', code, message });
}

export type EnvelopeResult =
  | { ok: true; msg: Record<string, unknown> }
  | { ok: false; oversize: boolean };

/** 解析 JSON 信封；非法 JSON / 非对象 / 超长返回失败 */
export function parseEnvelope(data: RawData): EnvelopeResult {
  let buf: Buffer;
  if (Array.isArray(data)) buf = Buffer.concat(data);
  else if (Buffer.isBuffer(data)) buf = data;
  else buf = Buffer.from(data);
  if (buf.byteLength > MAX_MESSAGE_BYTES) return { ok: false, oversize: true };
  try {
    const obj: unknown = JSON.parse(buf.toString('utf8'));
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      return { ok: false, oversize: false };
    }
    return { ok: true, msg: obj as Record<string, unknown> };
  } catch {
    return { ok: false, oversize: false };
  }
}

/** 昵称：非空字符串，去除首尾空白后 1-24 字符 */
export function parseName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (name.length === 0 || name.length > NAME_MAX_LENGTH) return null;
  return name;
}

/**
 * 校验 create 的棋盘配置：
 * size ∈ {5,7,9}；pool 为 1-MAX_POOL 的整数；firstTurn ∈ {red,blue}；seed 可选有限数。
 */
export function parseConfig(raw: unknown): MatchConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  const size = c['size'];
  if (size !== 5 && size !== 7 && size !== 9) return null;
  const pool = c['pool'];
  if (typeof pool !== 'number' || !Number.isInteger(pool) || pool < 1 || pool > MAX_POOL) {
    return null;
  }
  const firstTurn = c['firstTurn'];
  if (firstTurn !== 'red' && firstTurn !== 'blue') return null;
  let seed: number | undefined;
  if (c['seed'] !== undefined) {
    if (typeof c['seed'] !== 'number' || !Number.isFinite(c['seed'])) return null;
    seed = Math.trunc(c['seed']);
  }
  return { size, pool, firstTurn, seed };
}

/**
 * 轻量校验 action 信封形状（kind/side/字段类型）。
 * 规则合法性由引擎 checkAction/performAction 权威判定（非法行动会 throw）。
 */
export function parseAction(raw: unknown): Action | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  const kind = a['kind'];
  if (kind !== 'place' && kind !== 'convert' && kind !== 'skill') return null;
  const side = a['side'];
  if (side !== 'red' && side !== 'blue') return null;
  if (kind === 'place' || kind === 'convert') {
    if (typeof a['cell'] !== 'string') return null;
    return { kind, side, cell: a['cell'] };
  }
  const card = a['card'];
  if (typeof card !== 'string') return null;
  let params: SkillParams = {};
  const rawParams = a['params'];
  if (rawParams !== undefined) {
    if (typeof rawParams !== 'object' || rawParams === null || Array.isArray(rawParams)) {
      return null;
    }
    params = rawParams as SkillParams;
  }
  return { kind: 'skill', side, card: card as CardId, params };
}
