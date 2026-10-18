import { describe, expect, it } from 'vitest';
import {
  applyAction,
  checkAction,
  convertTargets,
  isSturdy,
  makeSkillAction,
  newMatch,
  playableSkills,
  skillTargets,
  type MatchState,
  type Side,
} from '../src/index.js';
import { cellKey } from '../src/index.js';

/** 构造测试对局：直接摆棋盘（setup 不走规则），可指定行动方 */
function setup(opts?: {
  pool?: number;
  turn?: Side;
  redSticks?: string[];
  blueSticks?: string[];
}): MatchState {
  const m = newMatch({ size: 7, pool: opts?.pool ?? 28, firstTurn: 'red', seed: 42 });
  for (const k of opts?.redSticks ?? []) m.round.cells[k] = { side: 'red' };
  for (const k of opts?.blueSticks ?? []) m.round.cells[k] = { side: 'blue' };
  if (opts?.turn) m.round.turn = opts.turn;
  return m;
}

const H = (x: number, y: number) => cellKey({ d: 'H', x, y });
const V = (x: number, y: number) => cellKey({ d: 'V', x, y });

describe('放置与木片池', () => {
  it('空位可以放置，占用位不能放置', () => {
    const m = setup();
    expect(checkAction(m, { kind: 'place', side: 'red', cell: H(2, 3) }).ok).toBe(true);
    applyAction(m, { kind: 'place', side: 'red', cell: H(2, 3) });
    expect(checkAction(m, { kind: 'place', side: 'blue', cell: H(2, 3) }).ok).toBe(false);
  });

  it('每步消耗一根木片；池耗尽后墨子获胜', () => {
    const m = setup({ pool: 1 });
    const res = applyAction(m, { kind: 'place', side: 'red', cell: H(2, 3) });
    expect(m.round.pool).toBe(0);
    expect(res.roundEnd).toEqual({ winner: 'blue', by: 'timeout' });
  });

  it('最后一根木片完成贯通：公输盘获胜（先查线路后查池）', () => {
    const m = setup({ pool: 1 });
    for (let y = 0; y <= 5; y++) m.round.cells[V(3, y)] = { side: 'red' };
    const res = applyAction(m, { kind: 'place', side: 'red', cell: V(3, 6) });
    expect(res.roundEnd).toEqual({ winner: 'red', by: 'path' });
  });

  it('易械消耗池并进弃置区，翻转后线路归属变化', () => {
    const m = setup({ redSticks: [V(2, 2)], blueSticks: [H(2, 3)] });
    expect(checkAction(m, { kind: 'convert', side: 'red', cell: H(2, 3) }).ok).toBe(true);
    applyAction(m, { kind: 'convert', side: 'red', cell: H(2, 3) });
    expect(m.round.cells[H(2, 3)]!.side).toBe('red');
    expect(m.round.pool).toBe(27);
    expect(m.round.discard).toBe(1);
  });

  it('易械后线路更新：蓝方横贯被夺走一格即断开', () => {
    const m = setup({ blueSticks: [V(1, 3), V(2, 3), V(3, 3), V(4, 3), V(5, 3), V(6, 3)] });
    // 蓝方已横贯；红方有援夺 V(3,3)：V(3,3) 红端点 (3,3),(3,4)；红 V(3,2) 接 (3,3)
    m.round.cells[V(3, 2)] = { side: 'red' };
    m.round.turn = 'red';
    // V(3,3) 稳固吗？蓝端点格心 (2,3),(3,3)：左右各有蓝木片 → 稳固，普通易械不可
    expect(isSturdy(m.round, V(3, 3))).toBe(true);
    expect(checkAction(m, { kind: 'convert', side: 'red', cell: V(3, 3) }).ok).toBe(false);
    // 拆掉一侧接应后不再稳固
    delete m.round.cells[V(2, 3)];
    expect(isSturdy(m.round, V(3, 3))).toBe(false);
    expect(checkAction(m, { kind: 'convert', side: 'red', cell: V(3, 3) }).ok).toBe(true);
    applyAction(m, { kind: 'convert', side: 'red', cell: V(3, 3) });
    expect(m.round.cells[V(3, 3)]!.side).toBe('red');
  });
});

describe('易械条件：有援/可夺/禁连/禁劫', () => {
  it('无援不可易械', () => {
    const m = setup({ blueSticks: [H(2, 3)] });
    const res = checkAction(m, { kind: 'convert', side: 'red', cell: H(2, 3) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('无援');
  });

  it('有援即可易械（单端接应足够）', () => {
    const m = setup({ redSticks: [V(2, 2)], blueSticks: [H(2, 3)] });
    expect(checkAction(m, { kind: 'convert', side: 'red', cell: H(2, 3) }).ok).toBe(true);
  });

  it('稳固（双端接应）的敌方木片不可易械', () => {
    const m = setup({
      blueSticks: [H(2, 3), V(3, 2), V(3, 3)],
      redSticks: [V(2, 2)],
    });
    expect(isSturdy(m.round, H(2, 3))).toBe(true);
    const res = checkAction(m, { kind: 'convert', side: 'red', cell: H(2, 3) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('稳固');
  });

  it('单端接应的敌方木片不算稳固', () => {
    const m = setup({ blueSticks: [H(2, 3), V(3, 2)], redSticks: [V(2, 2)] });
    expect(isSturdy(m.round, H(2, 3))).toBe(false);
  });

  it('禁连：同一玩家不能连续两次易械', () => {
    const m = setup({ redSticks: [V(2, 2), V(4, 2)], blueSticks: [H(2, 3), H(4, 3)] });
    applyAction(m, { kind: 'convert', side: 'red', cell: H(2, 3) });
    applyAction(m, { kind: 'place', side: 'blue', cell: H(0, 1) });
    const res = checkAction(m, { kind: 'convert', side: 'red', cell: H(4, 3) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('禁连');
    expect(checkAction(m, { kind: 'place', side: 'red', cell: H(1, 2) }).ok).toBe(true);
  });

  it('禁劫：不能立即夺回对手刚易械的同一根木片', () => {
    const m = setup({
      redSticks: [V(2, 2), V(5, 4), H(2, 3)],
      blueSticks: [H(5, 5), V(3, 2)],
    });
    // 红方先放一根（保证红方上次行动不是易械）
    applyAction(m, { kind: 'place', side: 'red', cell: H(1, 1) });
    // 蓝方易械红木片 H(2,3)：蓝有援（V(3,2) 接其蓝端点格心 (2,2)），H(2,3) 非稳固
    expect(checkAction(m, { kind: 'convert', side: 'blue', cell: H(2, 3) }).ok).toBe(true);
    applyAction(m, { kind: 'convert', side: 'blue', cell: H(2, 3) });
    // 红方立即夺回同一根 → 禁劫
    const res = checkAction(m, { kind: 'convert', side: 'red', cell: H(2, 3) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('禁劫');
    // 夺回另一根 H(5,5) 不受禁劫限制（红 V(5,4) 有援，H(5,5) 非稳固，红方无禁连）
    expect(checkAction(m, { kind: 'convert', side: 'red', cell: H(5, 5) }).ok).toBe(true);
  });

  it('禁劫在对方作出其他行动后解除', () => {
    const m = setup({
      redSticks: [H(2, 3), V(2, 2)],
      blueSticks: [V(3, 2)],
    });
    applyAction(m, { kind: 'place', side: 'red', cell: H(1, 1) });
    // 蓝方易械红木片 H(2,3)（蓝 V(3,2) 接其蓝端点 (2,2)）
    applyAction(m, { kind: 'convert', side: 'blue', cell: H(2, 3) });
    // 红方改为放置（非易械行动），劫标记解除
    applyAction(m, { kind: 'place', side: 'red', cell: H(1, 2) });
    // 蓝方也作非易械行动
    applyAction(m, { kind: 'place', side: 'blue', cell: H(0, 2) });
    // 红方现在可以夺回 H(2,3)（红 V(2,2) 有援，H(2,3) 现为蓝方且非稳固）
    expect(checkAction(m, { kind: 'convert', side: 'red', cell: H(2, 3) }).ok).toBe(true);
  });
});

describe('技能牌：目标枚举与执行', () => {
  it('冲车：拆除非稳固敌方木片，稳固的不能拆', () => {
    const m = setup({ blueSticks: [H(2, 3), V(3, 2), V(3, 3)] });
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    const t = skillTargets(m, 'chongche', []);
    expect(t).not.toContain(H(2, 3)); // 双端接应 → 稳固
    expect(t).toContain(V(3, 2));
    expect(t).toContain(V(3, 3));
    const a = makeSkillAction(m, 'chongche', [V(3, 2)]);
    expect(checkAction(m, a).ok).toBe(true);
    applyAction(m, a);
    expect(m.round.cells[V(3, 2)]).toBeUndefined();
    expect(m.round.discard).toBe(2); // 消耗 1 + 被拆 1
    expect(m.round.pool).toBe(27);
  });

  it('掘地：可易械稳固目标（仍需有援）', () => {
    const m = setup({ blueSticks: [H(2, 3), V(3, 2), V(3, 3)], redSticks: [V(2, 2)] });
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    expect(isSturdy(m.round, H(2, 3))).toBe(true);
    const a = makeSkillAction(m, 'juedi', [H(2, 3)]);
    expect(checkAction(m, a).ok).toBe(true);
    applyAction(m, a);
    expect(m.round.cells[H(2, 3)]!.side).toBe('red');
    expect(m.round.pool).toBe(26);
  });

  it('掘地仍需有援', () => {
    const m = setup({ blueSticks: [H(2, 3), V(3, 2), V(3, 3)] });
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    const res = checkAction(m, makeSkillAction(m, 'juedi', [H(2, 3)]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('无援');
  });

  it('木鹊：可易械无援目标（仍需非稳固）', () => {
    const m = setup({ blueSticks: [H(2, 3)] });
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    const a = makeSkillAction(m, 'muque', [H(2, 3)]);
    expect(checkAction(m, a).ok).toBe(true);
    applyAction(m, a);
    expect(m.round.cells[H(2, 3)]!.side).toBe('red');
  });

  it('木鹊不能易械稳固目标', () => {
    const m = setup({ blueSticks: [H(2, 3), V(3, 2), V(3, 3)] });
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    const res = checkAction(m, makeSkillAction(m, 'muque', [H(2, 3)]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('稳固');
  });

  it('钩拒：依次易械两根，第二根可依托第一根的有援', () => {
    const m = setup({
      redSticks: [V(2, 2)],
      blueSticks: [H(2, 3), V(3, 3)],
    });
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    const a = makeSkillAction(m, 'gouju', [H(2, 3), V(3, 3)]);
    expect(checkAction(m, a).ok).toBe(true);
    applyAction(m, a);
    expect(m.round.cells[H(2, 3)]!.side).toBe('red');
    expect(m.round.cells[V(3, 3)]!.side).toBe('red');
    expect(m.round.pool).toBe(26);
    expect(m.round.lastConvertedCells).toEqual([H(2, 3), V(3, 3)]);
  });

  it('钩拒第二根稳固则整体不合法', () => {
    const m = setup({
      redSticks: [V(2, 2)],
      blueSticks: [H(2, 3), V(3, 3), H(3, 4), H(2, 4)],
    });
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    const res = checkAction(m, makeSkillAction(m, 'gouju', [H(2, 3), V(3, 3)]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('第二根');
  });

  it('楼车：无视稳固/坚守，拆除并原位补放', () => {
    const m = setup({ blueSticks: [H(2, 3), V(3, 2), V(3, 3)] });
    m.round.cells[H(2, 3)] = { side: 'blue', fortified: true };
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'louche'];
    const a = makeSkillAction(m, 'louche', [H(2, 3)]);
    expect(checkAction(m, a).ok).toBe(true);
    applyAction(m, a);
    expect(m.round.cells[H(2, 3)]!.side).toBe('red');
    expect(m.round.cells[H(2, 3)]!.fortified).toBeUndefined();
    expect(m.round.pool).toBe(26);
    expect(m.round.discard).toBe(2); // 消耗 2：一根进弃置区，一根成为替换木片；被拆 1 根进弃置区 → 共 2
  });

  it('云梯：一次放两根，需两个不同空位', () => {
    const m = setup();
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    const a = makeSkillAction(m, 'yunti', [H(1, 2), V(2, 2)]);
    expect(checkAction(m, a).ok).toBe(true);
    applyAction(m, a);
    expect(m.round.cells[H(1, 2)]!.side).toBe('red');
    expect(m.round.cells[V(2, 2)]!.side).toBe('red');
    expect(m.round.pool).toBe(26);
    expect(checkAction(m, makeSkillAction(m, 'yunti', [H(1, 2), H(1, 2)])).ok).toBe(false);
  });

  it('移守：移动己方木片，坚守标记随木片保留', () => {
    const m = setup({ blueSticks: [H(2, 3)] });
    m.round.cells[H(2, 3)] = { side: 'blue', fortified: true };
    m.round.turn = 'blue';
    m.decks.blue = ['yishou', 'pidi', 'jianbi', 'zhanti', 'moshou'];
    const a = makeSkillAction(m, 'yishou', [H(2, 3), V(4, 4)]);
    expect(checkAction(m, a).ok).toBe(true);
    applyAction(m, a);
    expect(m.round.cells[H(2, 3)]).toBeUndefined();
    expect(m.round.cells[V(4, 4)]).toEqual({ side: 'blue', fortified: true });
    expect(m.round.pool).toBe(27);
  });

  it('疲敌：共消耗两根，加速计时', () => {
    const m = setup({ pool: 10 });
    m.round.turn = 'blue';
    m.decks.blue = ['yishou', 'pidi', 'jianbi', 'zhanti', 'moshou'];
    const a = makeSkillAction(m, 'pidi', []);
    expect(checkAction(m, a).ok).toBe(true);
    applyAction(m, a);
    expect(m.round.pool).toBe(8);
    expect(m.round.discard).toBe(2);
  });

  it('距堙/积备：弃置区不足两根时不可用，使用后池净增一', () => {
    const m = setup({ pool: 10 });
    m.decks.blue = ['yishou', 'pidi', 'jianbi', 'zhanti', 'jibei'];
    m.round.turn = 'blue';
    expect(playableSkills(m)).not.toContain('jibei');
    m.round.discard = 2;
    const a = makeSkillAction(m, 'jibei', []);
    expect(checkAction(m, a).ok).toBe(true);
    applyAction(m, a);
    expect(m.round.pool).toBe(11);
    expect(m.round.discard).toBe(1);
  });

  it('墨守：坚守标记使木片视为稳固；掘地可破', () => {
    const m = setup({ blueSticks: [H(2, 3)], redSticks: [V(2, 2)] });
    m.round.turn = 'blue';
    m.decks.blue = ['yishou', 'pidi', 'jianbi', 'zhanti', 'moshou'];
    applyAction(m, makeSkillAction(m, 'moshou', [H(2, 3)]));
    expect(m.round.cells[H(2, 3)]!.fortified).toBe(true);
    expect(isSturdy(m.round, H(2, 3))).toBe(true);
    m.round.turn = 'red';
    expect(checkAction(m, { kind: 'convert', side: 'red', cell: H(2, 3) }).ok).toBe(false);
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    expect(checkAction(m, makeSkillAction(m, 'chongche', [H(2, 3)])).ok).toBe(false);
    expect(checkAction(m, makeSkillAction(m, 'juedi', [H(2, 3)])).ok).toBe(true);
  });

  it('疾攻：无视禁连与禁劫，可立即夺回', () => {
    const m = setup({
      redSticks: [V(2, 2), V(4, 5), H(4, 5)],
      blueSticks: [H(2, 3), V(5, 4)],
    });
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'jigong'];
    m.decks.blue = ['yishou', 'pidi', 'jianbi', 'zhanti', 'moshou'];
    applyAction(m, { kind: 'convert', side: 'red', cell: H(2, 3) }); // 红方刚易械（禁连）
    m.round.turn = 'blue';
    applyAction(m, { kind: 'convert', side: 'blue', cell: H(4, 5) }); // 蓝方夺走红方木片（禁劫标记）
    m.round.turn = 'red';
    const a = makeSkillAction(m, 'jigong', [H(4, 5)]);
    expect(checkAction(m, a).ok).toBe(true);
    applyAction(m, a);
    expect(m.round.cells[H(4, 5)]!.side).toBe('red');
    expect(m.round.pool).toBe(24); // 28-1-1-2
  });

  it('伏弩（蓝）无视有援', () => {
    const m = setup({ redSticks: [H(5, 5)] });
    m.round.turn = 'blue';
    m.decks.blue = ['yishou', 'pidi', 'jianbi', 'zhanti', 'funu'];
    // H(5,5) 无蓝方接应 → 伏弩可夺
    const a1 = makeSkillAction(m, 'funu', [H(5, 5)]);
    expect(checkAction(m, a1).ok).toBe(true);
    applyAction(m, a1);
    expect(m.round.cells[H(5, 5)]!.side).toBe('blue');
  });

  it('反间（蓝）无视稳固', () => {
    const m = setup({
      redSticks: [H(2, 3), V(2, 3), V(3, 3)],
      blueSticks: [H(2, 2)],
    });
    m.round.turn = 'blue';
    m.decks.blue = ['yishou', 'pidi', 'jianbi', 'zhanti', 'fanjian'];
    // H(2,3) 红端点 (2,3),(3,3) 均有红接应 → 稳固；蓝 H(2,2) 接其蓝端点 (2,2) → 有援
    expect(isSturdy(m.round, H(2, 3))).toBe(true);
    const a2 = makeSkillAction(m, 'fanjian', [H(2, 3)]);
    expect(checkAction(m, a2).ok).toBe(true);
    applyAction(m, a2);
    expect(m.round.cells[H(2, 3)]!.side).toBe('blue');
  });

  it('技能牌每小局只能用一次，未抽中/已移除的牌不可用', () => {
    const m = setup({ blueSticks: [H(2, 3)] });
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    m.round.turn = 'red';
    const a = makeSkillAction(m, 'muque', [H(2, 3)]);
    applyAction(m, a);
    // 木鹊已用，本小局内不能再用
    expect(checkAction(m, { kind: 'skill', side: 'red', card: 'muque', params: { cell: H(1, 1) } }).ok).toBe(
      false,
    );
  });
});

describe('行动权威性（联机防作弊/防重放）', () => {
  it('重复提交同一行动会被拒绝（回合已切换）', () => {
    const m = setup();
    const a = { kind: 'place', side: 'red', cell: H(2, 3) } as const;
    applyAction(m, a);
    expect(checkAction(m, a).ok).toBe(false);
    expect(() => applyAction(m, a)).toThrow();
  });

  it('非当前行动方不能行动', () => {
    const m = setup();
    expect(checkAction(m, { kind: 'place', side: 'blue', cell: H(2, 3) }).ok).toBe(false);
  });

  it('未知技能牌与未抽到的牌均被拒绝', () => {
    const m = setup();
    const bad = { kind: 'skill', side: 'red', card: 'notacard', params: {} } as never;
    expect(checkAction(m, bad).ok).toBe(false);
    m.decks.red = ['chongche', 'yunti', 'juedi', 'muque', 'gouju'];
    expect(
      checkAction(m, { kind: 'skill', side: 'red', card: 'jigong', params: { cell: H(1, 1) } }).ok,
    ).toBe(false);
  });

  it('convertTargets 与基础行动枚举一致', () => {
    const m = setup({ redSticks: [V(2, 2)], blueSticks: [H(2, 3), H(4, 3)] });
    const targets = convertTargets(m.round, 'red');
    expect(targets).toEqual([H(2, 3)]);
  });
});
