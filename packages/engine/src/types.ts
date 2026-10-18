/**
 * 《墨守成规》核心类型定义。
 * 阵营：red = 公输盘（南→北攻城），blue = 墨子（西→东守御）。
 */

export type Side = 'red' | 'blue';

export function otherSide(s: Side): Side {
  return s === 'red' ? 'blue' : 'red';
}

export const SIDE_NAMES: Record<Side, string> = {
  red: '公输盘',
  blue: '墨子',
};

/** 木片：占据某个交叉位置 */
export interface Stick {
  side: Side;
  /** 墨守（九拒·墨守）加持：本小局内视为稳固 */
  fortified?: boolean;
}

/**
 * 交叉位置（木片可放置的位置）。
 * H(x,y)：红面连接顶点 (x,y)-(x+1,y)（横），蓝面连接格心 (x,y-1)-(x,y)（竖）；
 * V(x,y)：红面连接顶点 (x,y)-(x,y+1)（竖），蓝面连接格心 (x-1,y)-(x,y)（横）。
 * 合法范围：H 的 x∈[0,N-1]、y∈[1,N-1]；V 的 x∈[1,N-1]、y∈[0,N-1]。
 */
export interface CellId {
  d: 'H' | 'V';
  x: number;
  y: number;
}

export function cellKey(c: CellId): string {
  return `${c.d}${c.x},${c.y}`;
}

export function parseCellKey(key: string): CellId {
  const m = /^([HV])(\d+),(\d+)$/.exec(key);
  if (!m) throw new Error(`非法位置标识: ${key}`);
  return { d: m[1] as 'H' | 'V', x: Number(m[2]), y: Number(m[3]) };
}

/** 技能效果类别 */
export type SkillKind =
  /** 冲车/斩梯：拆除一根非稳固敌方木片 */
  | 'remove'
  /** 楼车：拆除任意敌方木片并在原位放置己方木片 */
  | 'removeAndPlace'
  /** 云梯/坚壁：一次放置两根 */
  | 'placeTwo'
  /** 掘地/反间：易械无视稳固 */
  | 'convertBypassSturdy'
  /** 木鹊/伏弩：易械无视有援 */
  | 'convertBypassAnchor'
  /** 疾攻/塞门：易械无视禁连禁劫 */
  | 'convertBypassKo'
  /** 钩拒：一次易械两根 */
  | 'convertTwo'
  /** 移守/转射机：移动己方木片 */
  | 'moveOwn'
  /** 疲敌：额外弃置一根公共木片 */
  | 'exhaust'
  /** 距堙/积备：弃置区回收两根，公共池净增一根 */
  | 'recycle'
  /** 墨守：给己方木片加坚守标记 */
  | 'fortify';

export type CardId =
  // 九攻（公输盘）
  | 'chongche'
  | 'yunti'
  | 'juedi'
  | 'muque'
  | 'gouju'
  | 'louche'
  | 'juyin'
  | 'zhuansheji'
  | 'jigong'
  // 九拒（墨子）
  | 'yishou'
  | 'pidi'
  | 'jianbi'
  | 'zhanti'
  | 'jibei'
  | 'funu'
  | 'fanjian'
  | 'saimen'
  | 'moshou';

export interface CardDef {
  id: CardId;
  side: Side;
  name: string;
  /** 本次行动消耗的公共木片数 */
  cost: number;
  kind: SkillKind;
  /** 一句话效果 */
  short: string;
  /** 完整说明 */
  long: string;
  /** 典故/风味 */
  flavor: string;
}

/** 技能参数（按牌的效果类别解释） */
export type SkillParams =
  | { cell: string }
  | { cells: string[] }
  | { from: string; to: string }
  | {};

export type Action =
  | { kind: 'place'; side: Side; cell: string }
  | { kind: 'convert'; side: Side; cell: string }
  | { kind: 'skill'; side: Side; card: CardId; params: SkillParams };

export interface LogEntry {
  seq: number;
  side: Side;
  action: Action;
  poolAfter: number;
}

/** 单个小局的状态 */
export interface RoundState {
  size: number;
  initialPool: number;
  /** 公共木片池剩余 */
  pool: number;
  /** 弃置区木片数 */
  discard: number;
  /** 已占用位置：cellKey -> Stick */
  cells: Record<string, Stick>;
  turn: Side;
  firstTurn: Side;
  roundNumber: number;
  /** 禁连：该方上一次行动是否为“易械”（含执行易械的技能） */
  lastMoveConvert: { red: boolean; blue: boolean };
  /** 禁劫：上一次易械的执行方与目标 */
  lastConvertedBy: Side | null;
  lastConvertedCells: string[];
  /** 本小局已使用过的技能牌 */
  usedThisRound: { red: CardId[]; blue: CardId[] };
  log: LogEntry[];
}

export interface MatchConfig {
  /** 棋盘规格 N（5/7/9），交叉位置数 = 2N(N-1) */
  size: number;
  /** 每小局公共木片池数量 */
  pool: number;
  /** 每小局先手 */
  firstTurn: Side;
  seed?: number;
}

export interface RoundResult {
  roundNumber: number;
  winner: Side;
  by: 'path' | 'timeout';
  /** 由败者选定的、胜者被移除的技能牌 */
  removedCard: CardId | null;
}

/** 整场比赛状态（纯数据，可 JSON 序列化） */
export interface MatchState {
  version: 1;
  config: MatchConfig;
  /** 本场抽中的五张牌（双方各五张，公开） */
  decks: { red: CardId[]; blue: CardId[] };
  /** 已被败者移除的牌 */
  removed: { red: CardId[]; blue: CardId[] };
  wins: { red: number; blue: number };
  round: RoundState;
  /** 小局结束、等待败者为胜者选择弃牌 */
  pendingRemoval: { winner: Side; loser: Side; by: 'path' | 'timeout' } | null;
  matchWinner: Side | null;
  history: RoundResult[];
}
