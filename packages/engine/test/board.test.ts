import { describe, expect, it } from 'vitest';
import {
  allCells,
  blueLatticeEdges,
  bluePathInfo,
  buildNodeIndex,
  cellKey,
  isSturdy,
  isValidCellKey,
  newMatch,
  redLatticeEdges,
  redPathInfo,
  type MatchState,
  type Stick,
} from '../src/index.js';

function emptyCells(size: number): Record<string, Stick> {
  return {};
}

describe('棋盘几何', () => {
  it('交叉位置数量 = N(2N-1)（含东境出口列）', () => {
    expect(allCells(5).length).toBe(45);
    expect(allCells(7).length).toBe(91);
    expect(allCells(9).length).toBe(153);
  });

  it('位置标识与边界合法', () => {
    expect(isValidCellKey(7, 'H0,1')).toBe(true);
    expect(isValidCellKey(7, 'H6,6')).toBe(true);
    expect(isValidCellKey(7, 'V1,0')).toBe(true);
    expect(isValidCellKey(7, 'V6,6')).toBe(true);
    // 东境出口列（x=N）是交叉位置
    expect(isValidCellKey(7, 'V7,3')).toBe(true);
    // 西/北/南三侧最外圈红边（x=0 列与 y=0、y=N 行）不是交叉位置
    expect(isValidCellKey(7, 'H3,0')).toBe(false);
    expect(isValidCellKey(7, 'H3,7')).toBe(false);
    expect(isValidCellKey(7, 'V0,3')).toBe(false);
    expect(isValidCellKey(7, 'V8,3')).toBe(false);
    expect(isValidCellKey(7, 'X1,2')).toBe(false);
  });

  it('渲染边数量正确', () => {
    // 红网：N*(N+1) 横 + (N+1)*N 竖 = 112（N=7）
    expect(redLatticeEdges(7).length).toBe(112);
    // 蓝网：(N-1)*N 横 + N*(N-1) 竖 + N 出口边 = 84+7 = 91（N=7）
    expect(blueLatticeEdges(7).length).toBe(91);
  });

  it('节点索引覆盖所有交叉位置', () => {
    const idx = buildNodeIndex(7);
    let redCount = 0;
    let blueCount = 0;
    for (const arr of idx.redByNode.values()) redCount += arr.length;
    for (const arr of idx.blueByNode.values()) blueCount += arr.length;
    // 每个交叉位置恰有 2 个红端点与 2 个蓝端点
    expect(redCount).toBe(91 * 2);
    expect(blueCount).toBe(91 * 2);
  });
});

describe('连通性判定', () => {
  it('空棋盘：双方贯通均需 N 根（蓝方含东境出口）', () => {
    const idx = buildNodeIndex(7);
    const red = redPathInfo(7, emptyCells(7), idx);
    const blue = bluePathInfo(7, emptyCells(7), idx);
    expect(red.complete).toBe(false);
    expect(red.dist).toBe(7);
    expect(blue.complete).toBe(false);
    expect(blue.dist).toBe(7);
  });

  it('红方直通：7 根竖片贯通南北', () => {
    const cells: Record<string, Stick> = {};
    for (let y = 0; y < 7; y++) cells[cellKey({ d: 'V', x: 3, y })] = { side: 'red' };
    const idx = buildNodeIndex(7);
    const info = redPathInfo(7, cells, idx);
    expect(info.complete).toBe(true);
    expect(info.dist).toBe(0);
  });

  it('红方转角线路也可贯通', () => {
    const cells: Record<string, Stick> = {};
    // (3,0) 向下到 (3,3)，右转到 (4,3)，再向下到 (4,7)
    for (let y = 0; y <= 2; y++) cells[cellKey({ d: 'V', x: 3, y })] = { side: 'red' };
    cells[cellKey({ d: 'H', x: 3, y: 3 })] = { side: 'red' };
    for (let y = 3; y < 7; y++) cells[cellKey({ d: 'V', x: 4, y })] = { side: 'red' };
    const idx = buildNodeIndex(7);
    expect(redPathInfo(7, cells, idx).complete).toBe(true);
  });

  it('红方可贴东境城墙直下（出口列是红方合法的攻城路线）', () => {
    const cells: Record<string, Stick> = {};
    for (let y = 0; y < 7; y++) cells[cellKey({ d: 'V', x: 7, y })] = { side: 'red' };
    const idx = buildNodeIndex(7);
    expect(redPathInfo(7, cells, idx).complete).toBe(true);
  });

  it('蓝方直通：7 根横片贯通东西（含东境出口）', () => {
    const cells: Record<string, Stick> = {};
    for (let x = 1; x <= 7; x++) cells[cellKey({ d: 'V', x, y: 3 })] = { side: 'blue' };
    const idx = buildNodeIndex(7);
    const info = bluePathInfo(7, cells, idx);
    expect(info.complete).toBe(true);
    expect(info.dist).toBe(0);
  });

  it('蓝方缺出口片则未贯通', () => {
    const cells: Record<string, Stick> = {};
    for (let x = 1; x <= 6; x++) cells[cellKey({ d: 'V', x, y: 3 })] = { side: 'blue' };
    const idx = buildNodeIndex(7);
    const info = bluePathInfo(7, cells, idx);
    expect(info.complete).toBe(false);
    expect(info.dist).toBe(1);
  });

  it('出口木片与红方城墙端点：城墙接应使单端邻片即稳固', () => {
    const cells: Record<string, Stick> = {};
    cells[cellKey({ d: 'V', x: 7, y: 3 })] = { side: 'blue' };
    cells[cellKey({ d: 'V', x: 6, y: 3 })] = { side: 'blue' };
    const m = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed: 7 });
    m.round.cells = cells;
    expect(isSturdy(m.round, cellKey({ d: 'V', x: 7, y: 3 }))).toBe(true);
    // 蓝方西境起点（x=0 格心）同样有城墙接应
    const cellsW: Record<string, Stick> = {};
    cellsW[cellKey({ d: 'V', x: 1, y: 3 })] = { side: 'blue' };
    cellsW[cellKey({ d: 'V', x: 2, y: 3 })] = { side: 'blue' };
    m.round.cells = cellsW;
    expect(isSturdy(m.round, cellKey({ d: 'V', x: 1, y: 3 }))).toBe(true);
    // 红方北端（贴宋城）与南端（贴楚营）城墙接应
    const cellsR: Record<string, Stick> = {};
    cellsR[cellKey({ d: 'V', x: 3, y: 0 })] = { side: 'red' };
    cellsR[cellKey({ d: 'V', x: 3, y: 1 })] = { side: 'red' };
    m.round.cells = cellsR;
    expect(isSturdy(m.round, cellKey({ d: 'V', x: 3, y: 0 }))).toBe(true);
    const cellsS: Record<string, Stick> = {};
    cellsS[cellKey({ d: 'V', x: 3, y: 6 })] = { side: 'red' };
    cellsS[cellKey({ d: 'V', x: 3, y: 5 })] = { side: 'red' };
    m.round.cells = cellsS;
    expect(isSturdy(m.round, cellKey({ d: 'V', x: 3, y: 6 }))).toBe(true);
    // 而普通蓝片单端接应不稳固
    const cells2: Record<string, Stick> = {};
    cells2[cellKey({ d: 'V', x: 5, y: 3 })] = { side: 'blue' };
    cells2[cellKey({ d: 'V', x: 6, y: 3 })] = { side: 'blue' };
    m.round.cells = cells2;
    expect(isSturdy(m.round, cellKey({ d: 'V', x: 6, y: 3 }))).toBe(false);
  });

  it('敌方木片阻隔路径，路径需绕行', () => {
    const cells: Record<string, Stick> = {};
    // 红方竖线在 y=3 处被蓝方 V(3,3) 拦截
    for (let y = 0; y <= 2; y++) cells[cellKey({ d: 'V', x: 3, y })] = { side: 'red' };
    cells[cellKey({ d: 'V', x: 3, y: 3 })] = { side: 'blue' }; // 拦截
    for (let y = 4; y < 7; y++) cells[cellKey({ d: 'V', x: 3, y })] = { side: 'red' };
    const idx = buildNodeIndex(7);
    const info = redPathInfo(7, cells, idx);
    expect(info.complete).toBe(false);
    // 缺口一处，绕行需 3 根（横移、下行、横移回）
    expect(info.dist).toBe(3);
  });

  it('双方路径不可能同时贯通（对偶性）', () => {
    const m = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed: 7 });
    const idx = buildNodeIndex(7);
    // 红方竖线贯通；蓝方横线铺到出口（缺被红方占住的 V(3,3)）
    for (let y = 0; y < 7; y++) m.round.cells[cellKey({ d: 'V', x: 3, y })] = { side: 'red' };
    for (let x = 1; x <= 7; x++) {
      const k = cellKey({ d: 'V', x, y: 3 });
      if (!m.round.cells[k]) m.round.cells[k] = { side: 'blue' };
    }
    const red = redPathInfo(7, m.round.cells, idx);
    const blue = bluePathInfo(7, m.round.cells, idx);
    expect(red.complete && blue.complete).toBe(false);
  });
});
