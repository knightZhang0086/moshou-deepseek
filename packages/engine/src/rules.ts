/**
 * 核心规则：行动合法性判定、行动执行、胜负判定。
 *
 * 基础行动：
 * - 放置：消耗 1 根池，在空位放己方木片。
 * - 易械：消耗 1 根池（该根进弃置区），把一根敌方木片旋转 90° 翻为己方。
 *   条件：有援（至少一个新端点与己方已有木片相连）、可夺（目标非稳固）、
 *   禁连（不能连续两次易械）、禁劫（不能立即夺回对手刚易械的同一根木片）。
 *
 * 稳固：木片两个端点各自都有至少一根同阵营木片相连；带“坚守”标记视为稳固。
 *
 * 每次行动后：先检查行动方的线路贯通，再检查公共池是否耗尽（耗尽则墨子胜）。
 */
import {
  allCells,
  blueEndpoints,
  blueNodeKey,
  buildNodeIndex,
  isValidCellKey,
  redEndpoints,
  redNodeKey,
  type NodeIndex,
} from './board.js';
import { bluePathInfo, redPathInfo } from './pathfind.js';
import { CARDS, CARDS_BY_SIDE } from './skills.js';
import {
  otherSide,
  parseCellKey,
  type Action,
  type CardId,
  type MatchState,
  type RoundState,
  type Side,
  type SkillParams,
} from './types.js';

export type CheckResult = { ok: true } | { ok: false; reason: string };
const OK: CheckResult = { ok: true };
function fail(reason: string): CheckResult {
  return { ok: false, reason };
}

// ---------- 判定辅助 ----------

/** 目标木片是否处于稳固状态（双端接应，或带坚守标记） */
export function isSturdy(round: RoundState, cell: string, idx?: NodeIndex): boolean {
  const stick = round.cells[cell];
  if (!stick) return false;
  if (stick.fortified) return true;
  const index = idx ?? buildNodeIndex(round.size);
  const c = parseCellKey(cell);
  const eps = stick.side === 'red' ? redEndpoints(c) : blueEndpoints(c);
  const byNode = stick.side === 'red' ? index.redByNode : index.blueByNode;
  const nodeKey = stick.side === 'red' ? redNodeKey : blueNodeKey;
  for (const ep of eps) {
    const nk = nodeKey(ep);
    const touching = (byNode.get(nk) ?? []).filter((k) => k !== cell);
    if (!touching.some((k) => round.cells[k]?.side === stick.side)) return false;
  }
  return true;
}

/** 有援：假设 cell 的敌方木片被转换为 forSide，至少一个新端点与 forSide 已有木片相连 */
export function hasAnchor(round: RoundState, cell: string, forSide: Side, idx?: NodeIndex): boolean {
  const index = idx ?? buildNodeIndex(round.size);
  const c = parseCellKey(cell);
  const eps = forSide === 'red' ? redEndpoints(c) : blueEndpoints(c);
  const byNode = forSide === 'red' ? index.redByNode : index.blueByNode;
  const nodeKey = forSide === 'red' ? redNodeKey : blueNodeKey;
  for (const ep of eps) {
    const nk = nodeKey(ep);
    const touching = byNode.get(nk) ?? [];
    if (touching.some((k) => k !== cell && round.cells[k]?.side === forSide)) return true;
  }
  return false;
}

export interface ConvertOptions {
  /** 无视稳固（掘地/反间） */
  bypassSturdy?: boolean;
  /** 无视有援（木鹊/伏弩） */
  bypassAnchor?: boolean;
  /** 无视禁劫（疾攻/塞门） */
  bypassKo?: boolean;
  /** 无视禁连（疾攻/塞门） */
  bypassChain?: boolean;
  /** 禁劫参照的标记（钩拒第二根时传入原标记） */
  ko?: { by: Side | null; cells: string[] };
}

/** 单次易械合法性（带具体原因） */
export function convertCheck(
  round: RoundState,
  side: Side,
  cell: string,
  opts: ConvertOptions = {},
): CheckResult {
  const stick = round.cells[cell];
  if (!stick) return fail('该位置没有木片');
  if (stick.side === side) return fail('目标必须是敌方木片');
  if (!opts.bypassChain && round.lastMoveConvert[side]) return fail('禁连：你上一次行动已使用易械');
  const ko = opts.ko ?? { by: round.lastConvertedBy, cells: round.lastConvertedCells };
  if (!opts.bypassKo && ko.by === otherSide(side) && ko.cells.includes(cell)) {
    return fail('禁劫：不能立即夺回对手刚刚易械的同一根木片');
  }
  if (!opts.bypassSturdy && isSturdy(round, cell)) {
    return fail('目标处于稳固状态，不能易械');
  }
  if (!opts.bypassAnchor && !hasAnchor(round, cell, side)) {
    return fail('无援：转换后没有任何端点与你的木片相连');
  }
  return OK;
}

/** 当前可易械的敌方木片（用于高亮与 AI） */
export function convertTargets(round: RoundState, side: Side, opts: ConvertOptions = {}): string[] {
  const out: string[] = [];
  const idx = buildNodeIndex(round.size);
  for (const key of Object.keys(round.cells)) {
    if (convertCheck(round, side, key, opts).ok) out.push(key);
  }
  return out;
}

// ---------- 技能牌目标 ----------

/** 指定技能牌 + 已选参数后，下一步可选的合法位置 */
export function skillTargets(m: MatchState, card: CardId, picked: string[]): string[] {
  const r = m.round;
  const side = r.turn;
  const def = CARDS[card];
  const idx = buildNodeIndex(r.size);
  switch (def.kind) {
    case 'remove': {
      const out: string[] = [];
      for (const key of Object.keys(r.cells)) {
        const st = r.cells[key]!;
        if (st.side !== side && !isSturdy(r, key, idx)) out.push(key);
      }
      return out;
    }
    case 'removeAndPlace': {
      return Object.keys(r.cells).filter((key) => r.cells[key]!.side !== side);
    }
    case 'placeTwo': {
      return allCells(r.size)
        .map((c) => `${c.d}${c.x},${c.y}`)
        .filter((k) => !r.cells[k] && !picked.includes(k));
    }
    case 'convertBypassSturdy':
      return convertTargets(r, side, { bypassSturdy: true });
    case 'convertBypassAnchor':
      return convertTargets(r, side, { bypassAnchor: true });
    case 'convertBypassKo':
      return convertTargets(r, side, { bypassKo: true, bypassChain: true });
    case 'convertTwo': {
      if (picked.length === 0) return convertTargets(r, side, {});
      if (picked.length === 1) {
        const first = picked[0]!;
        const tmp = cloneRound(r);
        doConvert(tmp, side, first);
        const ko = { by: r.lastConvertedBy, cells: r.lastConvertedCells };
        return convertTargets(tmp, side, { ko }).filter((k) => k !== first);
      }
      return [];
    }
    case 'moveOwn': {
      if (picked.length === 0) return Object.keys(r.cells).filter((k) => r.cells[k]!.side === side);
      if (picked.length === 1) {
        return allCells(r.size)
          .map((c) => `${c.d}${c.x},${c.y}`)
          .filter((k) => !r.cells[k] && k !== picked[0]);
      }
      return [];
    }
    case 'fortify': {
      return Object.keys(r.cells).filter((k) => {
        const st = r.cells[k]!;
        return st.side === side && !st.fortified;
      });
    }
    case 'exhaust':
    case 'recycle':
      return [];
  }
}

/** 当前行动方可使用的技能牌（前提全部满足且至少有一种目标组合） */
export function playableSkills(m: MatchState): CardId[] {
  const r = m.round;
  const side = r.turn;
  const out: CardId[] = [];
  for (const def of side === 'red' ? CARDS_BY_SIDE.red : CARDS_BY_SIDE.blue) {
    if (m.removed[side].includes(def.id)) continue;
    if (!m.decks[side].includes(def.id)) continue;
    if (r.usedThisRound[side].includes(def.id)) continue;
    if (r.pool < def.cost) continue;
    if (def.kind === 'exhaust' || def.kind === 'recycle') {
      if (def.kind === 'recycle' && r.discard < 2) continue;
      out.push(def.id);
      continue;
    }
    const first = skillTargets(m, def.id, []);
    if (first.length === 0) continue;
    if (def.kind === 'placeTwo' || def.kind === 'convertTwo' || def.kind === 'moveOwn') {
      const any = first.some((c) => skillTargets(m, def.id, [c]).length > 0);
      if (!any) continue;
    }
    out.push(def.id);
  }
  return out;
}

/** 组装技能行动 */
export function makeSkillAction(m: MatchState, card: CardId, picked: string[]): Action {
  const def = CARDS[card];
  let params: SkillParams;
  switch (def.kind) {
    case 'remove':
    case 'removeAndPlace':
    case 'convertBypassSturdy':
    case 'convertBypassAnchor':
    case 'convertBypassKo':
    case 'fortify':
      params = { cell: picked[0]! };
      break;
    case 'placeTwo':
    case 'convertTwo':
      params = { cells: [picked[0]!, picked[1]!] };
      break;
    case 'moveOwn':
      params = { from: picked[0]!, to: picked[1]! };
      break;
    case 'exhaust':
    case 'recycle':
      params = {};
      break;
  }
  return { kind: 'skill', side: m.round.turn, card, params };
}

// ---------- 行动合法性（唯一权威入口） ----------

export function checkAction(m: MatchState, a: Action): CheckResult {
  if (m.matchWinner) return fail('比赛已结束');
  if (m.pendingRemoval) return fail('小局已结束，等待败者弃牌');
  const r = m.round;
  if (a.side !== r.turn) return fail('不是当前行动方');
  if (r.pool <= 0) return fail('公共木片池已耗尽');

  switch (a.kind) {
    case 'place': {
      if (!isValidCellKey(r.size, a.cell)) return fail('位置不合法');
      if (r.cells[a.cell]) return fail('该位置已有木片');
      if (r.pool < 1) return fail('木片不足');
      return OK;
    }
    case 'convert': {
      return convertCheck(r, a.side, a.cell);
    }
    case 'skill': {
      const def = CARDS[a.card];
      if (!def) return fail('未知技能牌');
      if (def.side !== a.side) return fail('不是己方技能牌');
      if (!m.decks[a.side].includes(a.card)) return fail('本场未抽到该技能牌');
      if (m.removed[a.side].includes(a.card)) return fail('该技能牌已被移除');
      if (r.usedThisRound[a.side].includes(a.card)) return fail('本小局已使用过该技能牌');
      if (r.pool < def.cost) return fail(`木片不足（需 ${def.cost} 根）`);
      const p = a.params as Record<string, unknown>;
      switch (def.kind) {
        case 'remove': {
          const cell = p.cell as string;
          const st = r.cells[cell];
          if (!st || st.side === a.side) return fail('目标必须是敌方木片');
          if (isSturdy(r, cell)) return fail('目标处于稳固状态，不能拆除');
          return OK;
        }
        case 'removeAndPlace': {
          const cell = p.cell as string;
          const st = r.cells[cell];
          if (!st || st.side === a.side) return fail('目标必须是敌方木片');
          return OK;
        }
        case 'placeTwo': {
          const cells = p.cells as string[] | undefined;
          if (!Array.isArray(cells) || cells.length !== 2) return fail('需要选择两个不同位置');
          if (cells[0] === cells[1]) return fail('两个位置不能相同');
          for (const c of cells) {
            if (!isValidCellKey(r.size, c)) return fail('位置不合法');
            if (r.cells[c]) return fail('所选位置必须为空');
          }
          return OK;
        }
        case 'convertBypassSturdy':
          return convertCheck(r, a.side, p.cell as string, { bypassSturdy: true });
        case 'convertBypassAnchor':
          return convertCheck(r, a.side, p.cell as string, { bypassAnchor: true });
        case 'convertBypassKo':
          return convertCheck(r, a.side, p.cell as string, { bypassKo: true, bypassChain: true });
        case 'convertTwo': {
          const cells = p.cells as string[] | undefined;
          if (!Array.isArray(cells) || cells.length !== 2) return fail('需要选择两根敌方木片');
          if (cells[0] === cells[1]) return fail('两个目标不能相同');
          const c1 = convertCheck(r, a.side, cells[0]!, {});
          if (!c1.ok) return fail(`第一根不合法：${c1.reason}`);
          const tmp = cloneRound(r);
          doConvert(tmp, a.side, cells[0]!);
          // 禁连按行动前的历史判定，不受同一行动内第一步的影响
          tmp.lastMoveConvert[a.side] = r.lastMoveConvert[a.side];
          const c2 = convertCheck(tmp, a.side, cells[1]!, {
            ko: { by: r.lastConvertedBy, cells: r.lastConvertedCells },
          });
          if (!c2.ok) return fail(`第二根不合法：${c2.reason}`);
          return OK;
        }
        case 'moveOwn': {
          const from = p.from as string;
          const to = p.to as string;
          const st = r.cells[from];
          if (!st || st.side !== a.side) return fail('必须选择己方木片');
          if (!isValidCellKey(r.size, to)) return fail('目标位置不合法');
          if (r.cells[to]) return fail('目标位置必须为空');
          if (from === to) return fail('位置不能相同');
          return OK;
        }
        case 'exhaust':
          return OK;
        case 'recycle': {
          if (r.discard < 2) return fail('弃置区不足两根木片');
          return OK;
        }
        case 'fortify': {
          const cell = p.cell as string;
          const st = r.cells[cell];
          if (!st || st.side !== a.side) return fail('必须选择己方木片');
          if (st.fortified) return fail('该木片已有坚守标记');
          return OK;
        }
      }
    }
  }
}

/** 当前行动方全部基础行动（放置 + 普通易械） */
export function legalBaseActions(m: MatchState): Action[] {
  const r = m.round;
  if (r.pool < 1) return [];
  const side = r.turn;
  const out: Action[] = [];
  for (const c of allCells(r.size)) {
    const k = `${c.d}${c.x},${c.y}`;
    if (!r.cells[k]) out.push({ kind: 'place', side, cell: k });
  }
  for (const k of convertTargets(r, side)) {
    out.push({ kind: 'convert', side, cell: k });
  }
  return out;
}

export function emptyCells(m: MatchState): string[] {
  const r = m.round;
  return allCells(r.size)
    .map((c) => `${c.d}${c.x},${c.y}`)
    .filter((k) => !r.cells[k]);
}

// ---------- 执行 ----------

function cloneRound(r: RoundState): RoundState {
  return structuredClone(r);
}

/** 仅在合法性与执行内部使用：翻转一根木片（不负责记账） */
function doConvert(round: RoundState, side: Side, cell: string): void {
  const stick = round.cells[cell]!;
  stick.side = side;
  delete stick.fortified;
  round.lastMoveConvert[side] = true;
}

export interface ApplyResult {
  roundEnd: { winner: Side; by: 'path' | 'timeout' } | null;
}

/** 执行行动（就地修改 match.round）。必须先通过 checkAction，否则抛错。 */
export function applyAction(m: MatchState, a: Action): ApplyResult {
  const ck = checkAction(m, a);
  if (!ck.ok) throw new Error(`非法行动：${ck.reason}`);
  const r = m.round;
  const side = a.side;
  const converted: string[] = [];
  const place = (cell: string) => {
    r.cells[cell] = { side };
  };

  // 木片账目（池/弃置区/棋盘三处总和守恒）：
  // - 放置/云梯/坚壁：消耗的木片摆上棋盘；
  // - 易械类/疲敌/墨守：消耗的木片进弃置区；
  // - 冲车/斩梯：被拆的木片也进弃置区；
  // - 楼车：一根进弃置区、一根成为替换木片，被拆木片进弃置区。
  switch (a.kind) {
    case 'place':
      r.pool -= 1;
      place(a.cell);
      r.lastMoveConvert[side] = false;
      break;
    case 'convert':
      r.pool -= 1;
      r.discard += 1;
      doConvert(r, side, a.cell);
      converted.push(a.cell);
      break;
    case 'skill': {
      const def = CARDS[a.card];
      r.usedThisRound[side].push(a.card);
      const p = a.params as Record<string, unknown>;
      switch (def.kind) {
        case 'remove': {
          r.pool -= 1;
          r.discard += 1;
          delete r.cells[p.cell as string];
          r.discard += 1; // 被拆的木片进入弃置区
          r.lastMoveConvert[side] = false;
          break;
        }
        case 'removeAndPlace': {
          r.pool -= 2;
          r.discard += 1; // 消耗两根：一根成为替换木片
          delete r.cells[p.cell as string];
          r.discard += 1; // 被拆的木片进入弃置区
          place(p.cell as string);
          r.lastMoveConvert[side] = false;
          break;
        }
        case 'placeTwo': {
          r.pool -= 2;
          for (const c of p.cells as string[]) place(c);
          r.lastMoveConvert[side] = false;
          break;
        }
        case 'convertBypassSturdy':
        case 'convertBypassAnchor':
        case 'convertBypassKo': {
          r.pool -= def.cost;
          r.discard += def.cost;
          doConvert(r, side, p.cell as string);
          converted.push(p.cell as string);
          break;
        }
        case 'convertTwo': {
          r.pool -= 2;
          r.discard += 2;
          for (const c of p.cells as string[]) {
            doConvert(r, side, c);
            converted.push(c);
          }
          break;
        }
        case 'moveOwn': {
          r.pool -= 1;
          r.discard += 1;
          const from = p.from as string;
          const to = p.to as string;
          r.cells[to] = r.cells[from]!;
          delete r.cells[from];
          r.lastMoveConvert[side] = false;
          break;
        }
        case 'exhaust': {
          r.pool -= 2;
          r.discard += 2;
          r.lastMoveConvert[side] = false;
          break;
        }
        case 'recycle': {
          r.pool -= 1;
          r.discard += 1;
          r.pool += 2;
          r.discard -= 2;
          r.lastMoveConvert[side] = false;
          break;
        }
        case 'fortify': {
          r.pool -= 2;
          r.discard += 2;
          r.cells[p.cell as string]!.fortified = true;
          r.lastMoveConvert[side] = false;
          break;
        }
      }
      break;
    }
  }

  // 禁劫标记
  if (converted.length > 0) {
    r.lastConvertedBy = side;
    r.lastConvertedCells = converted;
  } else {
    r.lastConvertedBy = null;
    r.lastConvertedCells = [];
  }

  r.log.push({ seq: r.log.length + 1, side, action: a, poolAfter: r.pool });
  r.turn = otherSide(side);

  // 胜负判定：先检查线路贯通，再检查木片池耗尽
  const idx = buildNodeIndex(r.size);
  if (side === 'red' && redPathInfo(r.size, r.cells, idx).complete) {
    return { roundEnd: { winner: 'red', by: 'path' } };
  }
  if (side === 'blue' && bluePathInfo(r.size, r.cells, idx).complete) {
    return { roundEnd: { winner: 'blue', by: 'path' } };
  }
  if (r.pool <= 0) {
    return { roundEnd: { winner: 'blue', by: 'timeout' } };
  }
  return { roundEnd: null };
}

// ---------- 局况速览 ----------

export function redPath(m: MatchState): { complete: boolean; dist: number } {
  const idx = buildNodeIndex(m.round.size);
  const info = redPathInfo(m.round.size, m.round.cells, idx);
  return { complete: info.complete, dist: info.dist };
}

export function bluePath(m: MatchState): { complete: boolean; dist: number } {
  const idx = buildNodeIndex(m.round.size);
  const info = bluePathInfo(m.round.size, m.round.cells, idx);
  return { complete: info.complete, dist: info.dist };
}
