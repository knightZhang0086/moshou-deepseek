/**
 * 在线对战传输层：WebSocket（权威服务器）与 PeerJS（点对点）双通道，
 * 共用 docs/PROTOCOL.md 定义的消息信封。本层只负责传输与消息路由，
 * 引擎权威（校验/应用/广播状态）由 store 与服务器各自实现。
 */
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Action, CardId, MatchConfig, MatchState } from '@moshou/engine';

export type NetRole = 'host' | 'guest';
export type NetTransport = 'ws' | 'peer';

export interface NetCallbacks {
  /** 房间建立：host 拿到房间码；guest 加入成功 */
  onOpen(code: string): void;
  /** 权威状态快照（null = 未开局）。全量替换本地状态。 */
  onState(state: MatchState | null): void;
  /** 对手上线/离线 */
  onPeer(name: string, present: boolean): void;
  /** 仅 PeerJS host：收到 guest 提交的行动（host 本地引擎校验后广播 state） */
  onRemoteAction(seq: number, action: Action): void;
  /** 仅 PeerJS host：收到 guest 的弃牌选择 */
  onRemoteRemoval(card: CardId): void;
  /** 仅 PeerJS host：guest 已准备 */
  onRemoteReady(): void;
  /** 错误（code 见 PROTOCOL.md） */
  onError(message: string, code?: string): void;
  /** 连接关闭（可尝试重连） */
  onClosed(): void;
}

export interface NetHandle {
  readonly role: NetRole;
  readonly transport: NetTransport;
  sendReady(): void;
  sendAction(seq: number, action: Action): void;
  sendRemoval(card: CardId): void;
  broadcastState(state: MatchState): void; // 仅 peer host 使用
  close(): void;
}

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(len = 6): string {
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[arr[i]! % CODE_ALPHABET.length];
  return out;
}

export interface StoredCreds {
  code: string;
  token: string;
  role: NetRole;
  name: string;
  server: string | null;
  config?: MatchConfig;
}

const CREDS_KEY = 'mscg:creds';
export function saveCreds(c: StoredCreds): void {
  localStorage.setItem(CREDS_KEY, JSON.stringify(c));
}
export function loadCreds(): StoredCreds | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? (JSON.parse(raw) as StoredCreds) : null;
  } catch {
    return null;
  }
}
export function clearCreds(): void {
  localStorage.removeItem(CREDS_KEY);
}

export function wsUrl(server: string): string {
  return `${server.replace(/\/+$/, '')}/ws`;
}

// ---------- 消息信封 ----------

export type ClientMsg =
  | { t: 'create'; name: string; config: MatchConfig }
  | { t: 'join'; name: string }
  | { t: 'reconnect'; token: string }
  | { t: 'ready' }
  | { t: 'action'; seq: number; action: Action }
  | { t: 'remove'; card: CardId }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'created'; code: string; token: string }
  | { t: 'joined'; token: string; state: MatchState | null }
  | { t: 'resync'; state: MatchState | null }
  | { t: 'state'; state: MatchState }
  | { t: 'peer'; name: string; present: boolean }
  | { t: 'error'; code: string; message: string }
  | { t: 'pong' };

// ---------- WebSocket 实现 ----------

class WsSession implements NetHandle {
  readonly transport: NetTransport = 'ws';
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectTries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly role: NetRole,
    private readonly server: string,
    private code: string,
    private readonly name: string,
    private readonly config: MatchConfig | null,
    private readonly cb: NetCallbacks,
  ) {
    this.dial();
  }

  private dial(): void {
    if (this.closed) return;
    // 房间码随连接 URL 传给服务器（create 时服务器会另发正式码，join 时定位房间）
    this.ws = new WebSocket(`${wsUrl(this.server)}?code=${encodeURIComponent(this.code)}`);
    this.ws.onopen = () => {
      this.reconnectTries = 0;
      const creds = loadCreds();
      const msg: ClientMsg =
        creds && creds.code === this.code
          ? { t: 'reconnect', token: creds.token }
          : this.role === 'host'
            ? { t: 'create', name: this.name, config: this.config! }
            : { t: 'join', name: this.name };
      this.send(msg);
    };
    this.ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        return;
      }
      switch (msg.t) {
        case 'created':
          this.adoptCode(msg.code);
          saveCreds({
            code: msg.code,
            token: msg.token,
            role: this.role,
            name: this.name,
            server: this.server,
            config: this.config ?? undefined,
          });
          this.cb.onOpen(msg.code);
          break;
        case 'joined':
          saveCreds({
            code: this.code,
            token: msg.token,
            role: this.role,
            name: this.name,
            server: this.server,
            config: this.config ?? undefined,
          });
          this.cb.onOpen(this.code);
          this.cb.onState(msg.state);
          break;
        case 'resync':
          this.cb.onState(msg.state);
          break;
        case 'state':
          this.cb.onState(msg.state);
          break;
        case 'peer':
          this.cb.onPeer(msg.name, msg.present);
          break;
        case 'error':
          this.cb.onError(msg.message, msg.code);
          break;
      }
    };
    this.ws.onclose = () => {
      if (this.closed) return;
      this.cb.onClosed();
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      /* onclose 会随后触发 */
    };
  }

  /** 采用服务器下发的正式房间码 */
  private adoptCode(code: string): void {
    this.code = code;
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTries >= 12) {
      this.cb.onError('连接失败，请检查网络后重试。', 'CONN_LOST');
      return;
    }
    const delay = Math.min(500 * 2 ** this.reconnectTries, 8000);
    this.reconnectTries++;
    this.reconnectTimer = setTimeout(() => this.dial(), delay);
  }

  private send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendReady(): void {
    this.send({ t: 'ready' });
  }
  sendAction(seq: number, action: Action): void {
    this.send({ t: 'action', seq, action });
  }
  sendRemoval(card: CardId): void {
    this.send({ t: 'remove', card });
  }
  broadcastState(): void {
    /* ws 模式下由服务器广播 */
  }
  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

// ---------- PeerJS 实现 ----------

class PeerSession implements NetHandle {
  readonly transport: NetTransport = 'peer';
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private closed = false;

  constructor(
    readonly role: NetRole,
    private readonly code: string,
    private readonly name: string,
    private readonly cb: NetCallbacks,
    peer: Peer,
  ) {
    this.peer = peer;
    this.bindPeer();
  }

  /** 绑定数据通道（guest 在 peer open 之后才能拨号成功） */
  attachConn(conn: DataConnection): void {
    this.conn = conn;
    this.bindConn(conn);
  }

  private bindPeer(): void {
    this.peer!.on('open', (id) => {
      console.info('[mscg-peer] open', this.role, id);
      if (this.role === 'host' && !this.opened) {
        this.opened = true;
        this.cb.onOpen(this.code); // host 创建即可拿到房间码
      }
    });
    this.peer!.on('error', (err) => {
      if (this.closed) return;
      const type = String((err as { type?: string }).type ?? '');
      console.warn('[mscg-peer] error', this.role, type, String((err as { message?: string }).message ?? ''));
      if (type === 'peer-unavailable') {
        this.cb.onError('房间不存在或房主已离线。', 'NO_ROOM');
      } else if (type === 'unavailable-id') {
        this.cb.onError('房间标识冲突，请重开房间。', 'ID_TAKEN');
      } else {
        this.cb.onError('网络错误：' + type);
      }
    });
    this.peer!.on('disconnected', () => {
      console.info('[mscg-peer] disconnected', this.role);
      if (!this.closed) this.peer?.reconnect();
    });
    this.peer!.on('connection', (c) => {
      console.info('[mscg-peer] incoming connection', this.role);
      if (this.role === 'host') {
        this.attachConn(c);
      }
    });
  }

  private opened = false;

  private bindConn(conn: DataConnection): void {
    conn.on('open', () => {
      console.info('[mscg-peer] conn open', this.role);
      if (this.role === 'host') {
        this.opened = true;
        this.cb.onPeer(this.guestName(), true);
      } else {
        this.send({ t: 'join', name: this.name });
      }
    });
    conn.on('data', (raw) => {
      let msg: ClientMsg | ServerMsg;
      try {
        msg = JSON.parse(String(raw)) as ClientMsg | ServerMsg;
      } catch {
        return;
      }
      if (this.role === 'host') {
        this.handleHostMsg(msg);
      } else {
        this.handleGuestMsg(msg);
      }
    });
    conn.on('close', () => {
      if (this.closed) return;
      this.cb.onPeer(this.guestName(), false);
      this.cb.onClosed();
      // 短暂延迟后尝试重连（guest 重拨，host 等待）
      setTimeout(() => {
        if (!this.closed) this.reconnectPeer();
      }, 1200);
    });
    conn.on('error', () => {
      /* close 会随后触发 */
    });
  }

  private guestName(): string {
    return this.role === 'host' ? '对手' : '房主';
  }

  private handleHostMsg(msg: ClientMsg | ServerMsg): void {
    switch (msg.t) {
      case 'join':
        this.cb.onPeer(msg.name, true);
        this.cb.onState(null);
        this.send({ t: 'joined', token: this.code, state: null } as ServerMsg);
        break;
      case 'ready':
        this.cb.onRemoteReady();
        break;
      case 'action':
        this.cb.onRemoteAction(msg.seq, msg.action);
        break;
      case 'remove':
        this.cb.onRemoteRemoval(msg.card);
        break;
      case 'ping':
        this.send({ t: 'pong' } as ServerMsg);
        break;
    }
  }

  private handleGuestMsg(msg: ClientMsg | ServerMsg): void {
    switch (msg.t) {
      case 'joined':
        saveCreds({ code: this.code, token: msg.token, role: 'guest', name: this.name, server: null });
        this.cb.onOpen(this.code);
        this.cb.onState(msg.state);
        break;
      case 'state':
        this.cb.onState(msg.state);
        break;
      case 'peer':
        this.cb.onPeer(msg.name, msg.present);
        break;
      case 'error':
        this.cb.onError(msg.message, msg.code);
        break;
      case 'pong':
        break;
    }
  }

  private reconnectPeer(): void {
    if (this.role === 'host') return; // host 等待 guest 重拨
    if (!this.peer || this.peer.destroyed) return;
    const dial = () => {
      const conn = this.peer!.connect(hostPeerId(this.code), { reliable: true });
      this.attachConn(conn);
    };
    if (this.peer.open) dial();
    else this.peer.once('open', dial);
  }

  private send(msg: ClientMsg | ServerMsg): void {
    if (this.conn && this.conn.open) this.conn.send(JSON.stringify(msg));
  }

  sendReady(): void {
    this.send({ t: 'ready' });
  }
  sendAction(seq: number, action: Action): void {
    if (this.role === 'host') return; // host 自己本地应用后广播 state
    this.send({ t: 'action', seq, action });
  }
  sendRemoval(card: CardId): void {
    if (this.role === 'host') return;
    this.send({ t: 'remove', card });
  }
  broadcastState(state: MatchState): void {
    if (this.role === 'host') this.send({ t: 'state', state });
  }
  close(): void {
    this.closed = true;
    try {
      this.conn?.close();
    } catch {
      /* ignore */
    }
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.peer = null;
    this.conn = null;
  }
}

export function hostPeerId(code: string): string {
  return `mscg-${code}-0`;
}

/** PeerJS 云端信令配置（可在设置中覆盖） */
export interface PeerOptions {
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
}

/** 公共 STUN 服务器：PeerJS 的默认 ICE 配置会被自定义 init 覆盖，必须显式提供 */
const DEFAULT_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

/** 组装 PeerJS 构造参数：host/port/path/secure 与 config(ICE) 是并列字段 */
function peerInit(opts: PeerOptions): Record<string, unknown> {
  const init: Record<string, unknown> = {
    debug: 1,
    config: { iceServers: DEFAULT_ICE } as RTCConfiguration,
  };
  if (opts.host) {
    init.host = opts.host;
    if (opts.port !== undefined) init.port = opts.port;
    if (opts.path !== undefined) init.path = opts.path;
    if (opts.secure !== undefined) init.secure = opts.secure;
  }
  return init;
}

export function connectPeer(
  role: NetRole,
  code: string,
  name: string,
  cb: NetCallbacks,
  opts: PeerOptions = {},
): PeerSession {
  if (role === 'host') {
    const peer = new Peer(hostPeerId(code), peerInit(opts));
    return new PeerSession('host', code, name, cb, peer);
  }
  const peer = new Peer(peerInit(opts));
  const session = new PeerSession('guest', code, name, cb, peer);
  const dial = () => {
    if (session.role !== 'guest') return;
    const conn = peer.connect(hostPeerId(code), { reliable: true });
    session.attachConn(conn);
  };
  // 必须等 peer 与信令服务器建立连接（open）后再拨号，否则连接请求会被静默丢弃
  if (peer.open) dial();
  else peer.on('open', dial);
  return session;
}

// ---------- 统一入口 ----------

export interface ConnectOptions {
  role: NetRole;
  /** ws 服务器地址（如 wss://example.com / ws://localhost:8787）。null = PeerJS 模式 */
  server: string | null;
  code?: string;
  name: string;
  config?: MatchConfig;
  peerOptions?: PeerOptions;
}

/** 建立连接。server 非空走 WebSocket，否则走 PeerJS。 */
export function connect(opts: ConnectOptions, cb: NetCallbacks): NetHandle {
  if (opts.server) {
    if (opts.role === 'host') {
      const code = opts.code ?? randomCode();
      return new WsSession('host', opts.server, code, opts.name, opts.config ?? null, cb);
    }
    if (!opts.code) throw new Error('加入房间需要房间码');
    return new WsSession('guest', opts.server, opts.code, opts.name, null, cb);
  }
  if (opts.role === 'host') {
    const code = opts.code ?? randomCode();
    return connectPeer('host', code, opts.name, cb, opts.peerOptions);
  }
  if (!opts.code) throw new Error('加入房间需要房间码');
  return connectPeer('guest', opts.code, opts.name, cb, opts.peerOptions);
}
