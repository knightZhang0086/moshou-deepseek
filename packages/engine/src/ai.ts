/**
 * 启发式 AI（无需深度学习）：
 * - 优先立即获胜；
 * - 阻断对手一步/两步获胜；
 * - 以双方最短贯通距离、对手最短路径上的木片/空位、剩余池、易械收益综合评分；
 * - 红方（攻）偏重推进与夺路，蓝方（守）偏重拖延与封锁；
 * - 简单/中等两档（中等对前几个候选做一层对手回复模拟）。
 */
import { buildNodeIndex } from './board.js';
import {
  blueEndpoints,
  blueNodeKey,
  redEndpoints,
  redNodeKey,
} from './board.js';
import { bluePathInfo, redPathInfo, type PathInfo } from './pathfind.js';
import { pickRandom } from './random.js';
import {
  applyAction,
  convertTargets,
  legalBaseActions,
  makeSkillAction,
  playableSkills,
  skillTargets,
} from './rules.js';
import { CARDS } from './skills.js';
import {
  otherSide,
  parseCellKey,
  type Action,
  type CardId,
  type MatchState,
  type RoundState,
  type Side,
} from './types.js';

export type AiLevel = 'easy' | 'medium';

const WIN = 1e9;

function pathOf(m: MatchState, side: Side): PathInfo {
  const idx = buildNodeIndex(m.round.size);
  const r = m.round;
  return side === 'red'
    ? redPathInfo(r.size, r.cells, idx)
    : bluePathInfo(r.size, r.cells, idx);
}

function cloneMatch(m: MatchState): MatchState {
  return structuredClone(m);
}

/** 判断行动是否为“抢占对手最短路径上的木片” */
function hitsOpponentPath(action: Action, oppPathCells: Set<string>): boolean {
  const cells: string[] = [];
  if (action.kind === 'convert') cells.push(action.cell);
  else if (action.kind === 'skill') {
    const p = action.params as Record<string, unknown>;
    const cell = p.cell as string | undefined;
    if (cell) cells.push(cell);
    const list = p.cells as string[] | undefined;
    if (list) cells.push(...list);
  }
  return cells.some((c) => oppPathCells.has(c));
}

/** 行动后新增/归属己方的位置 */
function ownCellsOf(a: Action): string[] {
  if (a.kind === 'place') return [a.cell];
  if (a.kind === 'convert') return [a.cell];
  if (a.kind === 'skill') {
    const p = a.params as Record<string, unknown>;
    const cell = p.cell as string | undefined;
    const cells = p.cells as string[] | undefined;
    const to = p.to as string | undefined;
    const kind = CARDS[a.card].kind;
    if (kind === 'remove') return [];
    if (kind === 'removeAndPlace' && cell) return [cell];
    if (kind === 'placeTwo' && cells) return cells;
    if (kind === 'moveOwn' && to) return [to];
    if (cell) return [cell];
    if (cells) return cells;
  }
  return [];
}

/** 连贯性：落点与己方线路相连的端点数（鼓励沿一条线推进而非四处撒点） */
function cohesionBonus(round: RoundState, side: Side, cells: string[]): number {
  let n = 0;
  const idx = buildNodeIndex(round.size);
  for (const k of cells) {
    const c = parseCellKey(k);
    const eps = side === 'red' ? redEndpoints(c) : blueEndpoints(c);
    const byNode = side === 'red' ? idx.redByNode : idx.blueByNode;
    const nodeKey = side === 'red' ? redNodeKey : blueNodeKey;
    for (const ep of eps) {
      const nk = nodeKey(ep);
      const touching = (byNode.get(nk) ?? []).filter((kk) => kk !== k);
      if (touching.some((kk) => round.cells[kk]?.side === side)) n++;
    }
  }
  return n * 22;
}

/** 行动评分 */
function scoreAction(m: MatchState, a: Action, rng: () => number): number {
  const side = m.round.turn;
  const opp = otherSide(side);
  const beforeOpp = pathOf(m, opp);
  const beforeMy = pathOf(m, side);
  const oppPathSet = new Set(beforeOpp.pathCells);
  const clone = cloneMatch(m);
  let res;
  try {
    res = applyAction(clone, a);
  } catch {
    return -Infinity;
  }
  if (res.roundEnd) return WIN; // 立即获胜
  if (clone.round.pool <= 0) {
    return side === 'blue' ? WIN - 1 : -(WIN - 1); // 池尽 → 墨子胜
  }
  const myDist = pathOf(clone, side).dist;
  const oppDist = pathOf(clone, opp).dist;
  if (!Number.isFinite(oppDist)) return 7e8 + rng(); // 彻底堵死对方
  const actionsLeftForMe = Math.ceil(clone.round.pool / 2);
  const poolUsed = m.round.initialPool - clone.round.pool;

  let score = 0;
  if (side === 'red') {
    // 攻方：推进为纲，威胁对方路线
    score -= myDist * 16;
    score += oppDist * 11;
    if (myDist > actionsLeftForMe) score -= 320; // 时间不够，大势已去
  } else {
    // 守方：封锁为纲，时间在我
    score -= myDist * 10;
    score += oppDist * 13;
    if (myDist > actionsLeftForMe) score += 80 + poolUsed * 4; // 转拖延
  }

  // 连贯性：沿己方线路推进
  score += cohesionBonus(clone.round, side, ownCellsOf(a));

  // 路径跟随：落点在己方当前最短路径上（强引导，避免改道散落）
  const myPathAfter = pathOf(clone, side);
  const myPathSet = new Set(myPathAfter.pathCells);
  if (ownCellsOf(a).some((k) => myPathSet.has(k))) score += 45;

  // 夺路/断路加成：作用于对手当前最短路径上的位置
  if (hitsOpponentPath(a, oppPathSet)) {
    if (a.kind === 'convert' || a.kind === 'skill') score += 130;
    else score += 110; // 放置封锁
  }
  // 威胁解除：对手一步/两步获胜时，必须抬高其距离
  if (Number.isFinite(beforeOpp.dist) && beforeOpp.dist <= 2 && oppDist > beforeOpp.dist) {
    score += (oppDist - beforeOpp.dist) * 260;
  }
  // 自己一步之遥时，优先落子在自己的最短路径上
  if (beforeMy.dist <= 2 && myDist < beforeMy.dist) {
    score += (beforeMy.dist - myDist) * 200;
  }
  score += rng() * 1.2;
  return score;
}

function generateCandidates(m: MatchState, rng: () => number): Action[] {
  const side = m.round.turn;
  const out: Action[] = legalBaseActions(m);

  for (const card of playableSkills(m)) {
    const def = CARDS[card];
    if (def.kind === 'exhaust' || def.kind === 'recycle') {
      out.push(makeSkillAction(m, card, []));
      continue;
    }
    if (def.kind === 'placeTwo' || def.kind === 'convertTwo' || def.kind === 'moveOwn') {
      const firsts = skillTargets(m, card, []);
      const topFirsts = firsts
        .map((c) => ({ c, s: cellHeuristic(m, card, c) }))
        .sort((x, y) => y.s - x.s)
        .slice(0, def.kind === 'moveOwn' ? 10 : 8);
      for (const { c } of topFirsts) {
        const seconds = skillTargets(m, card, [c]);
        const topSeconds = seconds
          .map((c2) => ({ c2, s: cellHeuristic(m, card, c2) }))
          .sort((x, y) => y.s - x.s)
          .slice(0, def.kind === 'moveOwn' ? 8 : 6);
        for (const { c2 } of topSeconds) {
          out.push(makeSkillAction(m, card, [c, c2]));
        }
      }
      continue;
    }
    for (const c of skillTargets(m, card, [])) {
      out.push(makeSkillAction(m, card, [c]));
    }
  }
  const seen = new Set<string>();
  return out.filter((a) => {
    const k = JSON.stringify(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 单格启发值：用于双参牌候选裁剪（敌方木片/己方路径附近优先） */
function cellHeuristic(m: MatchState, card: CardId, cell: string): number {
  const r = m.round;
  const side = r.turn;
  const opp = otherSide(side);
  const stick = r.cells[cell];
  let s = Math.random() * 2;
  const oppPathSet = new Set(pathOf(m, opp).pathCells);
  if (oppPathSet.has(cell)) s += 4; // 对手路径上的位置最值钱
  const myPathSet = new Set(pathOf(m, side).pathCells);
  if (myPathSet.has(cell)) s += 2;
  if (stick && stick.side !== side) s += 3; // 敌方木片
  void card;
  return s;
}

/** 选择一个行动（保证合法；无行动时返回 null） */
export function chooseAiAction(
  m: MatchState,
  level: AiLevel,
  rng: () => number = Math.random,
): Action | null {
  const candidates = generateCandidates(m, rng);
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((a) => ({ a, s: scoreAction(m, a, rng) }))
    .sort((x, y) => y.s - x.s);

  if (level === 'medium') {
    const top = scored.slice(0, 5);
    let best: { a: Action; s: number } | null = null;
    for (const { a, s } of top) {
      if (s >= WIN) return a;
      const clone = cloneMatch(m);
      let res;
      try {
        res = applyAction(clone, a);
      } catch {
        continue;
      }
      if (res.roundEnd || clone.matchWinner) continue;
      const oppCands = generateCandidates(clone, rng);
      let oppBest = -Infinity;
      for (const oa of oppCands.slice(0, 60)) {
        const os = scoreAction(clone, oa, rng);
        if (os > oppBest) oppBest = os;
      }
      const final = s - 0.75 * Math.max(0, oppBest);
      if (!best || final > best.s) best = { a, s: final };
    }
    if (best) return best.a;
  }

  return scored[0]!.a;
}

/** AI 作为败者时为胜者选择弃牌：移除费用最高（威胁最大）的保留牌 */
export function chooseAiRemoval(m: MatchState, rng: () => number = Math.random): CardId | null {
  const pr = m.pendingRemoval;
  if (!pr) return null;
  const remaining = m.decks[pr.winner].filter((c) => !m.removed[pr.winner].includes(c));
  if (remaining.length === 0) return null;
  const maxCost = Math.max(...remaining.map((c) => CARDS[c].cost));
  const top = remaining.filter((c) => CARDS[c].cost === maxCost);
  return pickRandom(top, rng);
}
