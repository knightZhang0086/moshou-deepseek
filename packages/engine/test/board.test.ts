import { describe, expect, it } from 'vitest';
import {
  allCells,
  blueLatticeEdges,
  bluePathInfo,
  buildNodeIndex,
  cellKey,
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
  it('交叉位置数量 = 2N(N-1)', () => {
    expect(allCells(5).length).toBe(40);
    expect(allCells(7).length).toBe(84);
    expect(allCells(9).length).toBe(144);
  });

  it('位置标识与边界合法', () => {
    expect(isValidCellKey(7, 'H0,1')).toBe(true);
    expect(isValidCellKey(7, 'H6,6')).toBe(true);
    expect(isValidCellKey(7, 'V1,0')).toBe(true);
    expect(isValidCellKey(7, 'V6,6')).toBe(true);
    // 边界红边（y=0 / y=N / x=0 / x=N）不是交叉位置
    expect(isValidCellKey(7, 'H3,0')).toBe(false);
    expect(isValidCellKey(7, 'H3,7')).toBe(false);
    expect(isValidCellKey(7, 'V0,3')).toBe(false);
    expect(isValidCellKey(7, 'V7,3')).toBe(false);
    expect(isValidCellKey(7, 'X1,2')).toBe(false);
  });

  it('渲染边数量正确', () => {
    // 红网：N*(N+1) 横 + (N+1)*N 竖 = 112（N=7）
    expect(redLatticeEdges(7).length).toBe(112);
    // 蓝网：(N-1)*N 横 + N*(N-1) 竖 = 84（N=7）
    expect(blueLatticeEdges(7).length).toBe(84);
  });

  it('节点索引覆盖所有交叉位置', () => {
    const idx = buildNodeIndex(7);
    let redCount = 0;
    let blueCount = 0;
    for (const arr of idx.redByNode.values()) redCount += arr.length;
    for (const arr of idx.blueByNode.values()) blueCount += arr.length;
    // 每个交叉位置恰有 2 个红端点与 2 个蓝端点
    expect(redCount).toBe(84 * 2);
    expect(blueCount).toBe(84 * 2);
  });
});

describe('连通性判定', () => {
  it('空棋盘：红方贯通需 N 根，蓝方需 N-1 根', () => {
    const idx = buildNodeIndex(7);
    const red = redPathInfo(7, emptyCells(7), idx);
    const blue = bluePathInfo(7, emptyCells(7), idx);
    expect(red.complete).toBe(false);
    expect(red.dist).toBe(7);
    expect(blue.complete).toBe(false);
    expect(blue.dist).toBe(6);
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

  it('蓝方直通：6 根横片贯通东西', () => {
    const cells: Record<string, Stick> = {};
    for (let x = 1; x <= 6; x++) cells[cellKey({ d: 'V', x, y: 3 })] = { side: 'blue' };
    const idx = buildNodeIndex(7);
    const info = bluePathInfo(7, cells, idx);
    expect(info.complete).toBe(true);
    expect(info.dist).toBe(0);
  });

  it('敌方木片阻隔路径，路径需绕行', () => {
    const cells: Record<string, Stick> = {};
    // 红方竖线在 y=3 处被蓝方 H(2,3) 拦截？H(2,3) 红边为 (2,3)-(3,3)，
    // 与红方竖线 V(3,y) 共享顶点 (3,3)——改为用蓝 V(3,3) 占住红竖线的延伸位
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
    // 造一条红方通路，同时蓝方铺满某行——必被红方交叉
    for (let y = 0; y < 7; y++) m.round.cells[cellKey({ d: 'V', x: 3, y })] = { side: 'red' };
    for (let x = 1; x <= 6; x++) {
      const k = cellKey({ d: 'V', x, y: 3 });
      if (!m.round.cells[k]) m.round.cells[k] = { side: 'blue' };
    }
    const red = redPathInfo(7, m.round.cells, idx);
    const blue = bluePathInfo(7, m.round.cells, idx);
    expect(red.complete && blue.complete).toBe(false);
  });
});
