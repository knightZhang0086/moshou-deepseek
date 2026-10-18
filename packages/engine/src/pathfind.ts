/**
 * 连通性寻路。
 * 红方：北界顶点 (y=0) -> 南界顶点 (y=N) 的路径。
 * 蓝方：西界格心 (x=0) -> 东界格心 (x=N-1) 的路径。
 * 0-1 BFS：己方木片边权 0，空位边权 1，敌方木片不可通过。
 * dist = 完成通路还需要的木片数；complete = dist === 0。
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
}

const INF = Infinity;

function shortestToBorder(
  idx: NodeIndex,
  cells: Record<string, Stick>,
  side: 'red' | 'blue',
  startKeys: string[],
  goalKeys: Set<string>,
): number {
  // 0-1 BFS，节点 = 字符串 key
  const byNode = side === 'red' ? idx.redByNode : idx.blueByNode;
  const dist = new Map<string, number>();
  const deque: string[] = [];
  for (const s of startKeys) {
    dist.set(s, 0);
    deque.push(s);
  }
  while (deque.length) {
    const cur = deque.shift()!;
    const d = dist.get(cur)!;
    if (goalKeys.has(cur)) return d;
    const touching = byNode.get(cur) ?? [];
    for (const cellKey of touching) {
      const stick = cells[cellKey];
      const w = stick ? (stick.side === side ? 0 : INF) : 1;
      if (w === INF) continue;
      const nd = d + w;
      // 枚举该边的两个端点，找出另一个端点
      const c = parseCellKey(cellKey);
      const eps = side === 'red' ? redEndpoints(c) : blueEndpoints(c);
      const nodeKey = side === 'red' ? redNodeKey : blueNodeKey;
      for (const ep of eps) {
        const nk = nodeKey(ep);
        if (nk === cur) continue;
        const prev = dist.get(nk);
        if (prev === undefined || nd < prev) {
          dist.set(nk, nd);
          if (w === 0) deque.unshift(nk);
          else deque.push(nk);
        }
      }
    }
  }
  return INF;
}

export function redPathInfo(size: number, cells: Record<string, Stick>, idx: NodeIndex): PathInfo {
  const starts: string[] = [];
  const goals = new Set<string>();
  for (let x = 0; x <= size; x++) {
    starts.push(redNodeKey({ x, y: 0 }));
    goals.add(redNodeKey({ x, y: size }));
  }
  const d = shortestToBorder(idx, cells, 'red', starts, goals);
  return { complete: d === 0, dist: d };
}

export function bluePathInfo(size: number, cells: Record<string, Stick>, idx: NodeIndex): PathInfo {
  const starts: string[] = [];
  const goals = new Set<string>();
  for (let y = 0; y < size; y++) {
    starts.push(blueNodeKey({ x: 0, y }));
    goals.add(blueNodeKey({ x: size - 1, y }));
  }
  const d = shortestToBorder(idx, cells, 'blue', starts, goals);
  return { complete: d === 0, dist: d };
}
