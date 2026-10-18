/**
 * 启发式 AI（无需深度学习）：
 * - 优先立即获胜；
 * - 阻断对手一步获胜；
 * - 以双方最短贯通距离、剩余池、易械收益综合评分；
 * - 简单/中等两档（中等对前几个候选做一层对手回复模拟）。
 */
import { buildNodeIndex } from './board.js';
import { bluePathInfo, redPathInfo } from './pathfind.js';
import { pickRandom } from './random.js';
import {
  applyAction,
  checkAction,
  convertTargets,
  legalBaseActions,
  makeSkillAction,
  playableSkills,
  skillTargets,
} from './rules.js';
import { CARDS } from './skills.js';
import {
  otherSide,
  type Action,
  type CardId,
  type MatchState,
  type Side,
} from './types.js';

export type AiLevel = 'easy' | 'medium';

const WIN = 1e9;

function distOf(m: MatchState, side: Side): number {
  const idx = buildNodeIndex(m.round.size);
  const r = m.round;
  return side === 'red'
    ? redPathInfo(r.size, r.cells, idx).dist
    : bluePathInfo(r.size, r.cells, idx).dist;
}

function cloneMatch(m: MatchState): MatchState {
  return structuredClone(m);
}

/** 行动评分：返回 [得分, 是否立即获胜] */
function scoreAction(m: MatchState, a: Action, rng: () => number): number {
  const side = m.round.turn;
  const opp = otherSide(side);
  const beforeOppDist = distOf(m, opp);
  const clone = cloneMatch(m);
  let res;
  try {
    res = applyAction(clone, a);
  } catch {
    return -Infinity;
  }
  if (res.roundEnd) return WIN; // 立即获胜
  if (clone.round.pool <= 0) {
    // 池耗尽 → 墨子胜
    return side === 'blue' ? WIN - 1 : -(WIN - 1);
  }
  const myDist = distOf(clone, side);
  const oppDist = distOf(clone, opp);
  if (!Number.isFinite(oppDist)) return 7e8 + rng(); // 彻底堵死对方
  const actionsLeftForMe = Math.ceil(clone.round.pool / 2);
  let score = 0;
  score -= myDist * 14; // 己方越接近贯通越好
  score += oppDist * 9; // 对方越远越好
  // 对手一步获胜的威胁：必须解除
  if (beforeOppDist <= 1 && oppDist > 1) score += 600;
  if (side === 'red') {
    if (myDist > actionsLeftForMe) score -= 260; // 红方时间不够
  } else if (myDist > actionsLeftForMe) {
    score += 60 + (m.round.initialPool - clone.round.pool) * 3; // 蓝方转拖延
  }
  score += rng() * 1.2; // 打破平分
  return score;
}

function generateCandidates(m: MatchState, rng: () => number): Action[] {
  const r = m.round;
  const side = r.turn;
  const out: Action[] = legalBaseActions(m);

  for (const card of playableSkills(m)) {
    const def = CARDS[card];
    if (def.kind === 'exhaust' || def.kind === 'recycle') {
      out.push(makeSkillAction(m, card, []));
      continue;
    }
    if (def.kind === 'placeTwo' || def.kind === 'convertTwo' || def.kind === 'moveOwn') {
      // 双参牌：用启发式挑选有限组合，避免全枚举
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
  // 去重（按 JSON 序列化）
  const seen = new Set<string>();
  return out.filter((a) => {
    const k = JSON.stringify(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 单格启发值：用于双参牌的候选裁剪 */
function cellHeuristic(m: MatchState, card: CardId, cell: string): number {
  const r = m.round;
  const side = r.turn;
  let s = rngCell(m) ?? 0;
  void side;
  void card;
  const stick = r.cells[cell];
  if (stick) {
    // 抢占敌方木片：位于对方短路径上的更值钱
    if (stick.side !== side && (card === 'gouju' || card === 'jigong' || card === 'saimen' || card === 'funu' || card === 'muque' || card === 'juedi' || card === 'fanjian')) {
      s += 3;
    }
  }
  return s;
}

// 简单随机扰动（保持确定性来源单一）
let cellRngSeed = 0x9e3779b9;
function rngCell(m: MatchState): number {
  cellRngSeed = (cellRngSeed * 1103515245 + 12345 + m.round.log.length) | 0;
  return (cellRngSeed >>> 0) / 4294967296;
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
    const opp = otherSide(m.round.turn);
    let best: { a: Action; s: number } | null = null;
    for (const { a, s } of top) {
      if (s >= WIN) return a; // 能赢直接赢
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

  // easy：直接取最高分
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
