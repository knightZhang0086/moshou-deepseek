import { describe, expect, it } from 'vitest';
import {
  applyAction,
  checkAction,
  chooseAiAction,
  chooseAiRemoval,
  chooseRemoval,
  legalBaseActions,
  makeSkillAction,
  mulberry32,
  newMatch,
  performAction,
  pickRandom,
  playableSkills,
  redPath,
  bluePath,
  skillTargets,
  type Action,
} from '../src/index.js';
import type { MatchState } from '../src/index.js';

/** 随机挑一个合法行动 */
function randomAction(m: MatchState, rng: () => number): Action {
  const side = m.round.turn;
  // 基础行动（放置 + 易械）
  const options: Action[] = legalBaseActions(m);
  // 技能行动（随机参数）
  for (const card of playableSkills(m)) {
    const targets = skillTargets(m, card, []);
    if (targets.length === 0) {
      options.push(makeSkillAction(m, card, []));
    } else if (skillTargets(m, card, [targets[0]!]).length === 0) {
      options.push(makeSkillAction(m, card, [targets[0]!]));
    } else {
      const c1 = pickRandom(targets, rng);
      const c2s = skillTargets(m, card, [c1]);
      if (c2s.length) options.push(makeSkillAction(m, card, [c1, pickRandom(c2s, rng)]));
      else options.push(makeSkillAction(m, card, [c1]));
    }
  }
  if (options.length === 0) throw new Error('无合法行动');
  return pickRandom(options, rng);
}

describe('不变量模糊测试', () => {
  it('随机对局中：总量守恒、双方不同时贯通、行动始终合法', () => {
    for (let game = 0; game < 8; game++) {
      const m = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed: 1000 + game });
      const rng = mulberry32(2000 + game);
      const total = 28;
      let actions = 0;
      while (!m.pendingRemoval && !m.matchWinner && actions < 80) {
        const a = randomAction(m, rng);
        const ck = checkAction(m, a);
        if (!ck.ok) throw new Error(`随机行动不合法: ${ck.reason} ${JSON.stringify(a)}`);
        const res = applyAction(m, a);
        if (res.roundEnd) m.pendingRemoval = { winner: res.roundEnd.winner, loser: res.roundEnd.winner === 'red' ? 'blue' : 'red', by: res.roundEnd.by };
        actions++;
        // 总量守恒
        const onBoard = Object.keys(m.round.cells).length;
        expect(m.round.pool + m.round.discard + onBoard).toBe(total);
        // 双方不可能同时贯通
        const rp = redPath(m);
        const bp = bluePath(m);
        expect(rp.complete && bp.complete).toBe(false);
        // 回合交替
        if (!res.roundEnd) expect(m.round.turn).not.toBe(a.side);
      }
      expect(actions).toBeGreaterThan(0);
    }
  });

  it('随机对局最终必然结束（池耗尽或贯通）', () => {
    for (let game = 0; game < 4; game++) {
      const m = newMatch({ size: 7, pool: 20, firstTurn: 'red', seed: 3000 + game });
      const rng = mulberry32(4000 + game);
      let actions = 0;
      let ended = false;
      while (actions < 60) {
        const res = applyAction(m, randomAction(m, rng));
        actions++;
        if (res.roundEnd) {
          ended = true;
          break;
        }
      }
      expect(ended).toBe(true);
    }
  });

  it('整场随机对局可以打到分出胜负', () => {
    const m = newMatch({ size: 7, pool: 24, firstTurn: 'red', seed: 5 });
    const rng = mulberry32(6);
    let rounds = 0;
    while (!m.matchWinner) {
      if (m.pendingRemoval) {
        const loser = m.pendingRemoval.loser;
        const winner = m.pendingRemoval.winner;
        const remaining = m.decks[winner].filter((c) => !m.removed[winner].includes(c));
        chooseRemoval(m, loser, pickRandom(remaining, rng));
        continue;
      }
      let actions = 0;
      let ended = false;
      while (actions < 60) {
        const res = applyAction(m, randomAction(m, rng));
        actions++;
        if (res.roundEnd) {
          m.pendingRemoval = {
            winner: res.roundEnd.winner,
            loser: res.roundEnd.winner === 'red' ? 'blue' : 'red',
            by: res.roundEnd.by,
          };
          ended = true;
          break;
        }
      }
      if (!ended) throw new Error('小局未能在 60 步内结束');
      rounds++;
      expect(rounds).toBeLessThanOrEqual(9);
    }
    expect(m.matchWinner).toBeTruthy();
    expect(m.wins.red + m.wins.blue).toBe(5);
  });
});

describe('AI', () => {
  it('AI 选择的行动全部合法且对局可完整结束', () => {
    const m = newMatch({ size: 7, pool: 24, firstTurn: 'red', seed: 11 });
    const rng = mulberry32(12);
    let actions = 0;
    while (!m.matchWinner) {
      if (m.pendingRemoval) {
        const card = chooseAiRemoval(m, rng)!;
        chooseRemoval(m, m.pendingRemoval.loser, card);
        continue;
      }
      const a = chooseAiAction(m, 'easy', rng);
      expect(a).not.toBeNull();
      const ck = checkAction(m, a!);
      if (!ck.ok) throw new Error(`AI 行动不合法: ${ck.reason} ${JSON.stringify(a)}`);
      performAction(m, a!);
      actions++;
      expect(actions).toBeLessThan(400);
    }
    expect(m.matchWinner).toBeTruthy();
  });

  it('中等难度 AI 也保持合法（几步抽查）', () => {
    const m = newMatch({ size: 7, pool: 24, firstTurn: 'red', seed: 13 });
    const rng = mulberry32(14);
    for (let i = 0; i < 8 && !m.pendingRemoval; i++) {
      const a = chooseAiAction(m, 'medium', rng);
      expect(a).not.toBeNull();
      expect(checkAction(m, a!).ok).toBe(true);
      performAction(m, a!);
    }
  });
});
