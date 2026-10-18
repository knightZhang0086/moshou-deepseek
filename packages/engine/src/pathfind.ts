/**
 * 连通性寻路。
 * 红方：北界顶点 (y=0) -> 南界顶点 (y=N) 的路径。
 * 蓝方：西界格心 (x=0) -> 东界格心 (x=N-1) 的路径。
 * 0-1 BFS：己方木片边权 0，空位边权 1，敌方木片不可通过。
 * dist = 完成通路还需要的木片数；complete = dist === 0；
 * pathCells = 一条最短补全路径上现有的己方木片与空位（供 AI 攻防判断与 UI 高亮）。
 */
import type { Stick } from './types.js';
import {
  blueEndpoints,
  blueNodeKey,
  redEndpoints,
  redNodeKey,
  type NodeIndex,
} from './board.js';
import { parseCellKey } from './types.js';

export interface PathInfo {
  /** 是否已经贯通 */
  complete: boolean;
  /** 还差几根木片可以贯通（不可达成时为 Infinity） */
  dist: number;
  /** 一条最短补全路径途经的交叉位置（不含已被敌方占据处） */
  pathCells: string[];
}

const INF = Infinity;

interface BfsResult {
  dist: number;
  cells: string[];
}

function shortestToBorder(
  idx: NodeIndex,
  cells: Record<string, Stick>,
  side: 'red' | 'blue',
  startKeys: string[],
  goalKeys: Set<string>,
): BfsResult {
  const byNode = side === 'red' ? idx.redByNode : idx.blueByNode;
  const dist = new Map<string, number>();
  const parent = new Map<string, { node: string; cell: string } | null>();
  const deque: string[] = [];
  for (const s of startKeys) {
    dist.set(s, 0);
    parent.set(s, null);
    deque.push(s);
  }
  while (deque.length) {
    const cur = deque.shift()!;
    const d = dist.get(cur)!;
    if (goalKeys.has(cur)) {
      // 回溯路径
      const cellsOut: string[] = [];
      let node: string | null = cur;
      while (node) {
        const p = parent.get(node);
        if (p) {
          cellsOut.push(p.cell);
          node = p.node;
        } else {
          node = null;
        }
      }
      cellsOut.reverse();
      return { dist: d, cells: cellsOut };
    }
    const touching = byNode.get(cur) ?? [];
    for (const cellKey of touching) {
      const stick = cells[cellKey];
      const w = stick ? (stick.side === side ? 0 : INF) : 1;
      if (w === INF) continue;
      const nd = d + w;
      const c = parseCellKey(cellKey);
      const eps = side === 'red' ? redEndpoints(c) : blueEndpoints(c);
      const nodeKey = side === 'red' ? redNodeKey : blueNodeKey;
      for (const ep of eps) {
        const nk = nodeKey(ep);
        if (nk === cur) continue;
        const prev = dist.get(nk);
        if (prev === undefined || nd < prev) {
          dist.set(nk, nd);
          parent.set(nk, { node: cur, cell: cellKey });
          if (w === 0) deque.unshift(nk);
          else deque.push(nk);
        }
      }
    }
  }
  return { dist: INF, cells: [] };
}

export function redPathInfo(size: number, cells: Record<string, Stick>, idx: NodeIndex): PathInfo {
  const starts: string[] = [];
  const goals = new Set<string>();
  for (let x = 0; x <= size; x++) {
    starts.push(redNodeKey({ x, y: 0 }));
    goals.add(redNodeKey({ x, y: size }));
  }
  const r = shortestToBorder(idx, cells, 'red', starts, goals);
  return { complete: r.dist === 0, dist: r.dist, pathCells: r.cells };
}

export function bluePathInfo(size: number, cells: Record<string, Stick>, idx: NodeIndex): PathInfo {
  const starts: string[] = [];
  const goals = new Set<string>();
  for (let y = 0; y < size; y++) {
    starts.push(blueNodeKey({ x: 0, y }));
    // 东境出口：界外虚节点 (N, y)，蓝线必须真正跨出东境
    goals.add(blueNodeKey({ x: size, y }));
  }
  const r = shortestToBorder(idx, cells, 'blue', starts, goals);
  return { complete: r.dist === 0, dist: r.dist, pathCells: r.cells };
}
