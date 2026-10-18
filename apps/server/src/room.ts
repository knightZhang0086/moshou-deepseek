/**
 * 房间与注册表：房间码/token 生成、玩家席位、超时与清理策略。
 *
 * 生命周期约定：
 * - 断线不立刻移除玩家：席位保留 RECONNECT_WINDOW_MS，凭 token 重连恢复；
 * - 整场结束后房间保留 FINISHED_KEEP_MS 再清理；
 * - 每 60s 由 index.ts 调用 sweep 巡检；
 * - 未开局且从未有 guest 入场的房间在 IDLE_ROOM_MAX_MS 后回收（防泄漏）。
 */
import { randomBytes, randomInt } from 'node:crypto';
import type { MatchConfig, MatchState, Side } from '@moshou/engine';
import type { WebSocket } from 'ws';

/** 房间码字符集（无易混淆字符，见 docs/PROTOCOL.md） */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** 断线后席位保留时长（凭 token 重连窗口） */
export const RECONNECT_WINDOW_MS = 5 * 60 * 1000;
/** 整场结束后房间保留时长 */
export const FINISHED_KEEP_MS = 30 * 60 * 1000;
/** 未开局且从未有 guest 入场的房间最长存活时间（防泄漏） */
export const IDLE_ROOM_MAX_MS = 60 * 60 * 1000;

export interface Player {
  name: string;
  token: string;
  side: Side;
  /** 当前 WebSocket 连接；离线时为 null（席位仍保留在重连窗口内） */
  socket: WebSocket | null;
  present: boolean;
  ready: boolean;
  disconnectAt: number | null;
}

export class Room {
  readonly code: string;
  readonly config: MatchConfig;
  readonly createdAt: number;
  readonly players: { red: Player | null; blue: Player | null } = { red: null, blue: null };
  /** 权威比赛状态；null = 尚未开局 */
  state: MatchState | null = null;
  /** 是否曾有 guest 入场（用于空闲房间回收判断） */
  guestEver = false;
  /** 整场结束时间（matchWinner 确定时设置） */
  finishedAt: number | null = null;

  constructor(code: string, config: MatchConfig) {
    this.code = code;
    this.config = config;
    this.createdAt = Date.now();
  }

  get empty(): boolean {
    return this.players.red === null && this.players.blue === null;
  }
}

function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
  }
  return out;
}

export function generateToken(): string {
  return randomBytes(24).toString('hex');
}

export interface TokenTarget {
  room: Room;
  side: Side;
}

export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly tokenIndex = new Map<string, TokenTarget>();

  /** 创建房间并分配唯一 6 位房间码（已存在则重试） */
  create(config: MatchConfig): Room {
    for (let i = 0; i < 128; i++) {
      const code = generateCode();
      if (!this.rooms.has(code)) {
        const room = new Room(code, config);
        this.rooms.set(code, room);
        return room;
      }
    }
    // 32^6 ≈ 1.07e9 的码空间，正常不可能发生；防御性兜底
    throw new Error('无法分配房间码');
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  findByToken(token: string): TokenTarget | undefined {
    return this.tokenIndex.get(token);
  }

  /** 登记席位并索引 token */
  seat(room: Room, side: Side, player: Player): void {
    room.players[side] = player;
    this.tokenIndex.set(player.token, { room, side });
  }

  /** 移除席位并注销 token */
  unseat(room: Room, side: Side): void {
    const p = room.players[side];
    if (p) this.tokenIndex.delete(p.token);
    room.players[side] = null;
  }

  /** 关闭房间内所有现存连接 */
  closeRoom(room: Room): void {
    for (const side of ['red', 'blue'] as const) {
      const p = room.players[side];
      if (p?.socket) {
        try {
          p.socket.close(1001, 'room closed');
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** 删除房间并注销全部 token */
  delete(room: Room): void {
    for (const side of ['red', 'blue'] as const) {
      const p = room.players[side];
      if (p) this.tokenIndex.delete(p.token);
    }
    this.rooms.delete(room.code);
  }

  /**
   * 巡检（每 60s 调用一次）：
   * 1. 整场结束超过保留期 → 关闭并删除房间；
   * 2. 未开局且从未有 guest 的闲置房间超时 → 关闭并删除；
   * 3. 断线超过重连窗口的玩家 → 移除席位；
   * 4. 空房间 → 删除。
   */
  sweep(now: number): number {
    let cleaned = 0;
    for (const room of [...this.rooms.values()]) {
      if (room.finishedAt !== null && now - room.finishedAt >= FINISHED_KEEP_MS) {
        this.closeRoom(room);
        this.delete(room);
        cleaned += 1;
        continue;
      }
      if (!room.state && !room.guestEver && now - room.createdAt >= IDLE_ROOM_MAX_MS) {
        this.closeRoom(room);
        this.delete(room);
        cleaned += 1;
        continue;
      }
      for (const side of ['red', 'blue'] as const) {
        const p = room.players[side];
        if (
          p &&
          !p.present &&
          p.disconnectAt !== null &&
          now - p.disconnectAt >= RECONNECT_WINDOW_MS
        ) {
          this.unseat(room, side);
          cleaned += 1;
        }
      }
      if (room.empty) {
        this.delete(room);
        cleaned += 1;
      }
    }
    return cleaned;
  }

  get size(): number {
    return this.rooms.size;
  }
}
