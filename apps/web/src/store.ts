/**
 * 全局状态与对局逻辑（zustand）：
 * - 界面导航、设置（localStorage 持久化）、toast；
 * - 本地 / 人机 / 在线三种对局会话；
 * - 权威逻辑：本地与 peer-host 用引擎就地执行；ws 与 peer-guest 只提交、等权威状态。
 */
import { create } from 'zustand';
import {
  checkAction,
  chooseAiAction,
  chooseAiRemoval,
  chooseRemoval,
  newMatch,
  otherSide,
  performAction,
  type Action,
  type AiLevel,
  type CardId,
  type MatchConfig,
  type MatchState,
  type Side,
} from '@moshou/engine';
import {
  clearCreds,
  connect,
  loadCreds,
  randomCode,
  type NetCallbacks,
  type NetHandle,
  type NetRole,
} from './net';

export type Screen =
  | 'menu'
  | 'localSetup'
  | 'aiSetup'
  | 'online'
  | 'rules'
  | 'cards'
  | 'settings'
  | 'game';

export type GameMode = 'local' | 'ai' | 'online';

export interface Settings {
  /** WebSocket 服务器地址（如 wss://your-host）；留空 = PeerJS 点对点 */
  server: string;
  animOn: boolean;
  aiLevel: AiLevel;
}

export const DEFAULT_SETTINGS: Settings = { server: '', animOn: true, aiLevel: 'easy' };

const SETTINGS_KEY = 'mscg:settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      server: typeof p.server === 'string' ? p.server : '',
      animOn: typeof p.animOn === 'boolean' ? p.animOn : true,
      aiLevel: p.aiLevel === 'medium' ? 'medium' : 'easy',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function persistSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 忽略存储失败 */
  }
}

export interface ToastMsg {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'ok';
}

export interface Session {
  mode: GameMode;
  /** 权威状态；在线开局前为 null */
  state: MatchState | null;
  redName: string;
  blueName: string;
  aiSide: Side | null;
  aiLevel: AiLevel;
  /** 房间配置（peer host 双方就绪后据此开局） */
  config: MatchConfig | null;
  role: NetRole | null;
  transport: 'ws' | 'peer' | null;
  code: string | null;
  peerName: string | null;
  peerPresent: boolean;
  localReady: boolean;
  remoteReady: boolean;
  reconnecting: boolean;
  connFailed: boolean;
}

export interface GameStore {
  screen: Screen;
  settings: Settings;
  session: Session | null;
  toasts: ToastMsg[];
  /** URL ?room=CODE 带入的房间码 */
  onlinePrefill: string | null;

  setScreen(screen: Screen): void;
  pushToast(text: string, kind?: ToastMsg['kind']): void;
  dismissToast(id: number): void;
  updateSettings(patch: Partial<Settings>): void;

  prefillRoom(code: string): void;
  clearPrefill(): void;

  startLocal(size: number, pool: number, redName: string, blueName: string): void;
  startAi(size: number, pool: number, mySide: Side, aiLevel: AiLevel, myName: string): void;
  rematch(): void;
  exitGame(): void;

  humanAct(action: Action): void;
  pickRemoval(card: CardId): void;

  hostRoom(size: number, pool: number, name: string): void;
  joinRoom(code: string, name: string): void;
  sendReady(): void;
  rejoinRoom(): void;
  leaveRoom(): void;

  scheduleAi(): void;
  clearAiTimer(): void;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

let net: NetHandle | null = null;
let aiTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 0;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

export const useGame = create<GameStore>()((set, get) => {
  function makeNetCallbacks(): NetCallbacks {
    return {
      onOpen: (code) => {
        set((s) => {
          if (!s.session || s.session.mode !== 'online') return s;
          return { session: { ...s.session, code, reconnecting: false, connFailed: false } };
        });
      },
      onState: (state) => {
        const cur = get();
        const sess = cur.session;
        if (!sess || sess.mode !== 'online') return;
        if (state === null) {
          // peer host：guest 加入（含重连）→ 若对局进行中，立即重发权威状态补同步
          if (sess.transport === 'peer' && sess.role === 'host' && sess.state) {
            net?.broadcastState(sess.state);
            set({ session: { ...sess, reconnecting: false } });
            return;
          }
          set({ session: { ...sess, state: null, reconnecting: false } });
          return;
        }
        set({ session: { ...sess, state, reconnecting: false } });
        if (cur.screen === 'online') set({ screen: 'game' });
      },
      onPeer: (name, present) => {
        set((s) => {
          if (!s.session || s.session.mode !== 'online') return s;
          const next: Session = { ...s.session, peerName: present ? name : null, peerPresent: present };
          if (present && name && name !== '对手' && name !== '房主') {
            if (next.role === 'host') next.blueName = name;
            else next.redName = name;
          }
          if (!present) next.reconnecting = true;
          return { session: next };
        });
      },
      onRemoteAction: (seq, action) => {
        const s = get().session;
        if (!s || !s.state) return;
        const st = s.state;
        if (seq !== st.round.log.length) {
          get().pushToast('对手行动序号不符，已要求其同步。', 'error');
          net?.broadcastState(st);
          return;
        }
        const ck = checkAction(st, action);
        if (!ck.ok) {
          get().pushToast(`对手行动非法：${ck.reason}`, 'error');
          net?.broadcastState(st);
          return;
        }
        const clone = structuredClone(st);
        performAction(clone, action);
        set({ session: { ...s, state: clone } });
        net?.broadcastState(clone);
      },
      onRemoteRemoval: (card) => {
        const s = get().session;
        if (!s || !s.state || s.role !== 'host') return;
        const st = s.state;
        const pr = st.pendingRemoval;
        if (!pr || pr.loser !== 'blue') {
          get().pushToast('收到无效弃牌，已要求同步。', 'error');
          net?.broadcastState(st);
          return;
        }
        const clone = structuredClone(st);
        try {
          chooseRemoval(clone, 'blue', card);
        } catch (e) {
          get().pushToast(`对手弃牌非法：${errText(e)}`, 'error');
          net?.broadcastState(st);
          return;
        }
        set({ session: { ...s, state: clone } });
        net?.broadcastState(clone);
      },
      onRemoteReady: () => {
        set((s) =>
          s.session && s.session.mode === 'online'
            ? { session: { ...s.session, remoteReady: true } }
            : s,
        );
        maybeStartPeer();
      },
      onError: (message, code) => {
        get().pushToast(message, 'error');
        if (code === 'CONN_LOST' || code === 'NO_ROOM' || code === 'BAD_TOKEN' || code === 'ID_TAKEN') {
          set((s) =>
            s.session && s.session.mode === 'online'
              ? { session: { ...s.session, connFailed: true, reconnecting: false } }
              : s,
          );
        }
      },
      onClosed: () => {
        set((s) =>
          s.session && s.session.mode === 'online'
            ? { session: { ...s.session, reconnecting: true } }
            : s,
        );
      },
    };
  }

  /** peer host：双方就绪后开局并广播 */
  function maybeStartPeer() {
    const s = get().session;
    if (!s || s.mode !== 'online' || s.transport !== 'peer' || s.role !== 'host') return;
    if (!s.localReady || !s.remoteReady) return;
    if (!s.config || s.state) return;
    const state = newMatch(s.config);
    set({ session: { ...s, state }, screen: 'game' });
    net?.broadcastState(state);
  }

  return {
    screen: 'menu',
    settings: loadSettings(),
    session: null,
    toasts: [],
    onlinePrefill: null,

    setScreen: (screen) => set({ screen }),

    pushToast: (text, kind = 'info') => {
      const id = ++toastId;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
      const t = setTimeout(() => get().dismissToast(id), 2800);
      toastTimers.set(id, t);
    },

    dismissToast: (id) => {
      const t = toastTimers.get(id);
      if (t) {
        clearTimeout(t);
        toastTimers.delete(id);
      }
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    },

    updateSettings: (patch) => {
      set((s) => {
        const next = { ...s.settings, ...patch };
        persistSettings(next);
        return { settings: next };
      });
    },

    prefillRoom: (code) => set({ onlinePrefill: code, screen: 'online' }),
    clearPrefill: () => set({ onlinePrefill: null }),

    startLocal: (size, pool, redName, blueName) => {
      get().clearAiTimer();
      const config: MatchConfig = { size, pool, firstTurn: 'red' };
      const state = newMatch(config);
      set({
        screen: 'game',
        session: {
          mode: 'local',
          state,
          redName,
          blueName,
          aiSide: null,
          aiLevel: get().settings.aiLevel,
          config,
          role: null,
          transport: null,
          code: null,
          peerName: null,
          peerPresent: false,
          localReady: false,
          remoteReady: false,
          reconnecting: false,
          connFailed: false,
        },
      });
    },

    startAi: (size, pool, mySide, aiLevel, myName) => {
      get().clearAiTimer();
      const config: MatchConfig = { size, pool, firstTurn: 'red' };
      const state = newMatch(config);
      const aiSide = otherSide(mySide);
      set({
        screen: 'game',
        session: {
          mode: 'ai',
          state,
          redName: mySide === 'red' ? myName : '公输盘',
          blueName: mySide === 'blue' ? myName : '墨子',
          aiSide,
          aiLevel,
          config,
          role: null,
          transport: null,
          code: null,
          peerName: null,
          peerPresent: false,
          localReady: false,
          remoteReady: false,
          reconnecting: false,
          connFailed: false,
        },
      });
    },

    rematch: () => {
      const s = get().session;
      if (!s || (s.mode !== 'local' && s.mode !== 'ai')) return;
      const cfg = s.config ?? s.state?.config;
      if (!cfg) return;
      const state = newMatch({ size: cfg.size, pool: cfg.pool, firstTurn: cfg.firstTurn });
      set({ session: { ...s, state } });
    },

    exitGame: () => {
      get().clearAiTimer();
      const s = get().session;
      if (s?.mode === 'online') {
        net?.close();
        net = null;
        clearCreds();
      }
      set({ session: null, screen: 'menu' });
    },

    humanAct: (action) => {
      const s = get().session;
      if (!s || !s.state) return;
      const st = s.state;
      if (st.matchWinner || st.pendingRemoval) return;

      if (s.mode === 'online') {
        const ck = checkAction(st, action);
        if (!ck.ok) {
          get().pushToast(ck.reason, 'error');
          return;
        }
        if (s.transport === 'ws' || s.role === 'guest') {
          net?.sendAction(st.round.log.length, action);
          return;
        }
        // peer host：本地权威
        const clone = structuredClone(st);
        performAction(clone, action);
        set({ session: { ...s, state: clone } });
        net?.broadcastState(clone);
        return;
      }

      // 本地 / 人机
      const ck = checkAction(st, action);
      if (!ck.ok) {
        get().pushToast(ck.reason, 'error');
        return;
      }
      const clone = structuredClone(st);
      performAction(clone, action);
      set({ session: { ...s, state: clone } });
    },

    pickRemoval: (card) => {
      const s = get().session;
      if (!s || !s.state) return;
      const st = s.state;
      const pr = st.pendingRemoval;
      if (!pr) return;

      if (s.mode === 'online') {
        if (s.transport === 'ws' || s.role === 'guest') {
          net?.sendRemoval(card);
          return;
        }
        // peer host 自己作为败者
        if (pr.loser !== 'red') {
          get().pushToast('只有败者可以为胜者选择弃牌。', 'error');
          return;
        }
        const clone = structuredClone(st);
        try {
          chooseRemoval(clone, 'red', card);
        } catch (e) {
          get().pushToast(errText(e), 'error');
          return;
        }
        set({ session: { ...s, state: clone } });
        net?.broadcastState(clone);
        return;
      }

      const clone = structuredClone(st);
      try {
        chooseRemoval(clone, pr.loser, card);
      } catch (e) {
        get().pushToast(errText(e), 'error');
        return;
      }
      set({ session: { ...s, state: clone } });
    },

    hostRoom: (size, pool, name) => {
      get().clearAiTimer();
      const { settings } = get();
      const config: MatchConfig = { size, pool, firstTurn: 'red' };
      const code = randomCode();
      net?.close();
      set({
        screen: 'online',
        session: {
          mode: 'online',
          state: null,
          redName: name,
          blueName: '对手',
          aiSide: null,
          aiLevel: settings.aiLevel,
          config,
          role: 'host',
          transport: settings.server ? 'ws' : 'peer',
          code: null,
          peerName: null,
          peerPresent: false,
          localReady: false,
          remoteReady: false,
          reconnecting: false,
          connFailed: false,
        },
      });
      net = connect(
        { role: 'host', server: settings.server || null, code, name, config },
        makeNetCallbacks(),
      );
    },

    joinRoom: (code, name) => {
      get().clearAiTimer();
      const { settings } = get();
      net?.close();
      set({
        screen: 'online',
        session: {
          mode: 'online',
          state: null,
          redName: '房主',
          blueName: name,
          aiSide: null,
          aiLevel: settings.aiLevel,
          config: null,
          role: 'guest',
          transport: settings.server ? 'ws' : 'peer',
          code: null,
          peerName: null,
          peerPresent: false,
          localReady: false,
          remoteReady: false,
          reconnecting: false,
          connFailed: false,
        },
      });
      net = connect(
        { role: 'guest', server: settings.server || null, code, name },
        makeNetCallbacks(),
      );
    },

    sendReady: () => {
      const s = get().session;
      if (!s || s.mode !== 'online' || s.localReady) return;
      set({ session: { ...s, localReady: true } });
      net?.sendReady();
      maybeStartPeer();
    },

    rejoinRoom: () => {
      const creds = loadCreds();
      if (!creds) {
        get().pushToast('没有可用的重连凭据，请回到「加入房间」重新加入。', 'error');
        return;
      }
      const s = get().session;
      if (!s || s.mode !== 'online') return;
      net?.close();
      set({ session: { ...s, reconnecting: true, connFailed: false } });
      net = connect(
        {
          role: creds.role,
          server: creds.server,
          code: creds.code,
          name: creds.name,
          config: creds.config,
        },
        makeNetCallbacks(),
      );
    },

    leaveRoom: () => {
      get().clearAiTimer();
      net?.close();
      net = null;
      clearCreds();
      set({ session: null, screen: 'menu' });
    },

    scheduleAi: () => {
      if (aiTimer) return;
      const s = get().session;
      if (!s || s.mode !== 'ai' || !s.state) return;
      const st = s.state;
      const aiSide = s.aiSide;
      if (!aiSide) return;
      const needRemoval = !!st.pendingRemoval && st.pendingRemoval.loser === aiSide;
      const needMove = !st.matchWinner && !st.pendingRemoval && st.round.turn === aiSide;
      if (!needRemoval && !needMove) return;
      aiTimer = setTimeout(
        () => {
          aiTimer = null;
          const cur = get().session;
          if (!cur || !cur.state || cur.mode !== 'ai') return;
          const cst = cur.state;
          const side = cur.aiSide;
          if (!side) return;

          if (needRemoval) {
            if (!cst.pendingRemoval || cst.pendingRemoval.loser !== side) return;
            const clone = structuredClone(cst);
            const card = chooseAiRemoval(clone);
            if (!card) return;
            chooseRemoval(clone, side, card);
            set({ session: { ...cur, state: clone } });
            get().scheduleAi();
            return;
          }
          if (cst.matchWinner || cst.pendingRemoval || cst.round.turn !== side) return;
          const clone = structuredClone(cst);
          const action = chooseAiAction(clone, cur.aiLevel);
          if (!action) return;
          performAction(clone, action);
          set({ session: { ...cur, state: clone } });
          get().scheduleAi();
        },
        needRemoval ? 900 : 650,
      );
    },

    clearAiTimer: () => {
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }
    },
  };
});
