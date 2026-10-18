import { describe, expect, it } from 'vitest';
import {
  applyAction,
  CARDS,
  chooseRemoval,
  makeSkillAction,
  newMatch,
  performAction,
  playableSkills,
  remainingCards,
} from '../src/index.js';
import { cellKey } from '../src/index.js';
import type { MatchState, Side } from '../src/index.js';

const V = (x: number, y: number) => cellKey({ d: 'V', x, y });
const H = (x: number, y: number) => cellKey({ d: 'H', x, y });

/** 帮红方直接摆出一条贯通线（走正规放置流程太慢，这里只做 setup） */
function giveRedPath(m: MatchState): void {
  for (let y = 0; y < 7; y++) m.round.cells[V(3, y)] = { side: 'red' };
}

describe('整场状态机', () => {
  it('开局双方各抽五张，全部公开且不重复、阵营正确', () => {
    const m = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed: 1 });
    expect(m.decks.red).toHaveLength(5);
    expect(m.decks.blue).toHaveLength(5);
    expect(new Set(m.decks.red).size).toBe(5);
    expect(new Set(m.decks.blue).size).toBe(5);
    for (const c of m.decks.red) expect(CARDS[c].side).toBe('red');
    for (const c of m.decks.blue) expect(CARDS[c].side).toBe('blue');
  });

  it('不同种子抽到不同组合（有变化性）', () => {
    const a = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed: 1 });
    const b = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed: 2 });
    expect(a.decks.red.join(',')).not.toBe(b.decks.red.join(','));
  });

  it('小局结束：败者为胜者选牌，胜利计入，开启下一小局', () => {
    const m = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed: 1 });
    giveRedPath(m);
    delete m.round.cells[V(3, 6)]; // 留最后一根
    m.round.turn = 'red';
    const res = performAction(m, { kind: 'place', side: 'red', cell: V(3, 6) });
    expect(res.roundEnd).toEqual({ winner: 'red', by: 'path' });
    expect(m.pendingRemoval).toEqual({ winner: 'red', loser: 'blue', by: 'path' });
    const winnerCard = m.decks.red[0]!;
    const r = chooseRemoval(m, 'blue', winnerCard);
    expect(r.matchEnded).toBe(false);
    expect(m.wins.red).toBe(1);
    expect(m.removed.red).toEqual([winnerCard]);
    expect(m.round.roundNumber).toBe(2);
    expect(m.round.pool).toBe(28);
    expect(Object.keys(m.round.cells)).toHaveLength(0);
    expect(m.round.turn).toBe('red');
  });

  it('只有败者可以弃牌，且只能移除胜者保留的牌', () => {
    const m = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed: 1 });
    giveRedPath(m);
    m.round.turn = 'red';
    delete m.round.cells[V(3, 6)];
    performAction(m, { kind: 'place', side: 'red', cell: V(3, 6) });
    expect(() => chooseRemoval(m, 'red', m.decks.red[0]!)).toThrow(); // 胜者不能自己弃
    expect(() => chooseRemoval(m, 'blue', m.decks.blue[0]!)).toThrow(); // 不能弃败者自己的牌
    const notInRedDeck = (
      ['chongche', 'yunti', 'juedi', 'muque', 'gouju', 'louche', 'juyin', 'zhuansheji', 'jigong'] as const
    ).find((c) => !m.decks.red.includes(c))!;
    expect(() => chooseRemoval(m, 'blue', notInRedDeck)).toThrow(); // 未抽到的牌不行
    expect(() => chooseRemoval(m, 'blue', m.decks.red[0]!)).not.toThrow();
  });

  it('技能牌每小局刷新：上一小局用过的牌下一小局恢复可用', () => {
    const m = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed: 1 });
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    m.decks.blue = ['yishou', 'pidi', 'jianbi', 'zhanti', 'moshou'];
    // 红方用冲车拆蓝方一根
    m.round.cells[H(2, 3)] = { side: 'blue' };
    applyAction(m, makeSkillAction(m, 'chongche', [H(2, 3)]));
    expect(m.round.usedThisRound.red).toContain('chongche');
    // 结束小局：红方摆贯通
    giveRedPath(m);
    m.round.turn = 'red';
    delete m.round.cells[V(3, 6)];
    performAction(m, { kind: 'place', side: 'red', cell: V(3, 6) });
    chooseRemoval(m, 'blue', m.decks.red[1]!); // 移除 yunti，保留冲车
    // 新小局：冲车恢复可用
    expect(m.round.usedThisRound.red).toHaveLength(0);
    m.round.cells[H(2, 3)] = { side: 'blue' };
    expect(playableSkills(m)).toContain('chongche');
  });

  it('被移除的技能牌在后续小局不可再用', () => {
    const m = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed: 1 });
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    m.decks.blue = ['yishou', 'pidi', 'jianbi', 'zhanti', 'moshou'];
    giveRedPath(m);
    m.round.turn = 'red';
    delete m.round.cells[V(3, 6)];
    performAction(m, { kind: 'place', side: 'red', cell: V(3, 6) });
    chooseRemoval(m, 'blue', 'chongche');
    expect(remainingCards(m, 'red')).not.toContain('chongche');
    m.round.cells[H(2, 3)] = { side: 'blue' };
    expect(playableSkills(m)).not.toContain('chongche');
  });

  it('率先赢得五个小局的一方获得整场胜利', () => {
    const m = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed: 1 });
    let cardIdx = 0;
    for (let w = 1; w <= 5; w++) {
      giveRedPath(m);
      m.round.turn = 'red';
      delete m.round.cells[V(3, 6)];
      performAction(m, { kind: 'place', side: 'red', cell: V(3, 6) });
      const remaining = remainingCards(m, 'red');
      const card = remaining[cardIdx % remaining.length]!;
      const r = chooseRemoval(m, 'blue', card);
      cardIdx++;
      if (w < 5) expect(r.matchEnded).toBe(false);
      else expect(r.matchEnded).toBe(true);
    }
    expect(m.wins.red).toBe(5);
    expect(m.matchWinner).toBe('red');
    // 比赛结束后不能再行动
    expect(() => performAction(m, { kind: 'place', side: 'red', cell: H(0, 1) })).toThrow();
  });

  it('胜负最多九个小局（4:4 后决胜局）', () => {
    const m = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed: 1 });
    const winners: Side[] = ['red', 'blue', 'red', 'blue', 'red', 'blue', 'red', 'blue', 'red'];
    for (let i = 0; i < winners.length; i++) {
      const w = winners[i]!;
      if (w === 'red') giveRedPath(m);
      else {
        for (let x = 1; x <= 7; x++) m.round.cells[V(x, 3)] = { side: 'blue' };
      }
      m.round.turn = w;
      if (w === 'red') {
        delete m.round.cells[V(3, 6)];
        performAction(m, { kind: 'place', side: 'red', cell: V(3, 6) });
      } else {
        performAction(m, { kind: 'place', side: 'blue', cell: H(0, 1) }); // 蓝方已横贯？不能——横贯会立即判胜
      }
      if (m.matchWinner) break;
      const loser = w === 'red' ? 'blue' : 'red';
      const remaining = remainingCards(m, w);
      if (remaining.length) chooseRemoval(m, loser, remaining[0]!);
    }
    expect(m.matchWinner).toBe('red');
    expect(m.wins.red).toBe(5);
    expect(m.history).toHaveLength(9);
  });
});
