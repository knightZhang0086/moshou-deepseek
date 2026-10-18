/**
 * 棋盘几何：两套交错的节点网络。
 *
 * 红网（公输盘）：N×N 方格的所有顶点 (x,y)，x,y∈[0,N]；红边 = 方格的边。
 * 蓝网（墨子）：N×N 方格的所有格心 (x,y)，x,y∈[0,N-1]；蓝边 = 相邻格心连线。
 * 每条内部红边恰好被一条蓝边垂直穿过，交点即一个“交叉位置”（木片槽位）。
 * 棋盘最外圈红边（y=0、y=N 行与 x=0、x=N 列）不属于任何交叉位置，作为棋盘边界。
 */
import type { CellId } from './types.js';
import { cellKey } from './types.js';

export interface Pt {
  x: number;
  y: number;
}

/** 全部交叉位置。数量 = 2N(N-1)。 */
export function allCells(size: number): CellId[] {
  const out: CellId[] = [];
  for (let x = 0; x < size; x++) {
    for (let y = 1; y < size; y++) out.push({ d: 'H', x, y });
  }
  for (let x = 1; x < size; x++) {
    for (let y = 0; y < size; y++) out.push({ d: 'V', x, y });
  }
  return out;
}

export function isValidCellKey(size: number, key: string): boolean {
  let c: CellId;
  try {
    c = parseCell(key);
  } catch {
    return false;
  }
  if (c.d === 'H') return c.x >= 0 && c.x < size && c.y >= 1 && c.y < size;
  return c.x >= 1 && c.x < size && c.y >= 0 && c.y < size;
}

function parseCell(key: string): CellId {
  const m = /^([HV])(\d+),(\d+)$/.exec(key);
  if (!m) throw new Error(`非法位置标识: ${key}`);
  return { d: m[1] as 'H' | 'V', x: Number(m[2]), y: Number(m[3]) };
}

/** 红面（公输盘）连接的两个顶点 */
export function redEndpoints(c: CellId): [Pt, Pt] {
  return c.d === 'H'
    ? [
        { x: c.x, y: c.y },
        { x: c.x + 1, y: c.y },
      ]
    : [
        { x: c.x, y: c.y },
        { x: c.x, y: c.y + 1 },
      ];
}

/** 蓝面（墨子）连接的两个格心 */
export function blueEndpoints(c: CellId): [Pt, Pt] {
  return c.d === 'H'
    ? [
        { x: c.x, y: c.y - 1 },
        { x: c.x, y: c.y },
      ]
    : [
        { x: c.x - 1, y: c.y },
        { x: c.x, y: c.y },
      ];
}

export function redNodeKey(p: Pt): string {
  return `r${p.x},${p.y}`;
}

export function blueNodeKey(p: Pt): string {
  return `b${p.x},${p.y}`;
}

/** 节点 -> 与之相连的交叉位置（用于有援/稳固判定与寻路） */
export interface NodeIndex {
  redByNode: Map<string, string[]>;
  blueByNode: Map<string, string[]>;
}

export function buildNodeIndex(size: number): NodeIndex {
  const redByNode = new Map<string, string[]>();
  const blueByNode = new Map<string, string[]>();
  for (const c of allCells(size)) {
    const k = cellKey(c);
    for (const p of redEndpoints(c)) {
      const nk = redNodeKey(p);
      const arr = redByNode.get(nk);
      if (arr) arr.push(k);
      else redByNode.set(nk, [k]);
    }
    for (const p of blueEndpoints(c)) {
      const nk = blueNodeKey(p);
      const arr = blueByNode.get(nk);
      if (arr) arr.push(k);
      else blueByNode.set(nk, [k]);
    }
  }
  return { redByNode, blueByNode };
}

/** 交叉位置在棋盘上的中心坐标（红边中点，用于渲染） */
export function cellCenter(c: CellId): Pt {
  return c.d === 'H' ? { x: c.x + 0.5, y: c.y } : { x: c.x, y: c.y + 0.5 };
}

/** 渲染用：红网的全部边（含边界） */
export function redLatticeEdges(size: number): Array<[Pt, Pt]> {
  const out: Array<[Pt, Pt]> = [];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y <= size; y++) {
      out.push([
        { x, y },
        { x: x + 1, y },
      ]);
    }
  }
  for (let x = 0; x <= size; x++) {
    for (let y = 0; y < size; y++) {
      out.push([
        { x, y },
        { x, y: y + 1 },
      ]);
    }
  }
  return out;
}

/** 渲染用：蓝网的全部边（每条蓝边恰被一个交叉位置垂直穿过） */
export function blueLatticeEdges(size: number): Array<[Pt, Pt]> {
  const out: Array<[Pt, Pt]> = [];
  for (let x = 0; x < size - 1; x++) {
    for (let y = 0; y < size; y++) {
      out.push([
        { x: x + 0.5, y: y + 0.5 },
        { x: x + 1.5, y: y + 0.5 },
      ]);
    }
  }
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size - 1; y++) {
      out.push([
        { x: x + 0.5, y: y + 0.5 },
        { x: x + 0.5, y: y + 1.5 },
      ]);
    }
  }
  return out;
}

export { cellKey };
