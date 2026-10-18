/** 调试：打印一局 AI 对 AI 的完整棋谱（供平衡分析） */
import { chooseAiAction, chooseAiRemoval } from '../ai.js';
import { chooseRemoval, newMatch, performAction } from '../match.js';
import { buildNodeIndex } from '../board.js';
import { bluePathInfo, redPathInfo } from '../pathfind.js';
import { mulberry32 } from '../random.js';
import { CARDS } from '../skills.js';

declare const console: { log: (...a: unknown[]) => void };
declare const process: { argv: string[] };

const seed = Number(process.argv[2] ?? 20261018);
const m = newMatch({ size: 7, pool: 28, firstTurn: 'red', seed });
const rng = mulberry32(seed ^ 0x51ab);

function dists() {
  const idx = buildNodeIndex(m.round.size);
  const r = redPathInfo(m.round.size, m.round.cells, idx);
  const b = bluePathInfo(m.round.size, m.round.cells, idx);
  return `红距${String(r.dist).padStart(2)} 蓝距${String(b.dist).padStart(2)}`;
}

function describe(a: import('../types.js').Action): string {
  if (a.kind === 'place') return `放 ${a.cell}`;
  if (a.kind === 'convert') return `易 ${a.cell}`;
  const p = a.params as Record<string, unknown>;
  const card = CARDS[a.card].name;
  if (p.cell) return `${card} ${p.cell}`;
  if (p.cells) return `${card} ${(p.cells as string[]).join('+')}`;
  if (p.from) return `${card} ${p.from}→${p.to}`;
  return card;
}

let actions = 0;
console.log(`牌：红[${m.decks.red.map((c) => CARDS[c].name).join(' ')}] 蓝[${m.decks.blue.map((c) => CARDS[c].name).join(' ')}]`);
while (!m.matchWinner && actions < 200) {
  if (m.pendingRemoval) {
    const card = chooseAiRemoval(m, rng)!;
    console.log(`[小局${m.round.roundNumber}] ${m.pendingRemoval.winner === 'red' ? '红' : '蓝'}胜 移除${CARDS[card].name} 大比分 红${m.wins.red}:${m.wins.blue}蓝`);
    chooseRemoval(m, m.pendingRemoval.loser, card);
    console.log(`—— 新小局 ${m.round.roundNumber} ——`);
    continue;
  }
  const a = chooseAiAction(m, 'easy', rng)!;
  const side = m.round.turn === 'red' ? '红' : '蓝';
  const res = performAction(m, a);
  actions++;
  console.log(
    `${String(m.round.roundNumber).padStart(2)}.${String(actions).padStart(3)} ${side} ${describe(a).padEnd(24)} 池${String(m.round.pool).padStart(2)} ${dists()}${res.roundEnd ? `  ** ${res.roundEnd.winner === 'red' ? '红' : '蓝'}胜(${res.roundEnd.by})` : ''}`,
  );
}
console.log(`终局：${m.matchWinner === 'red' ? '红' : '蓝'}胜 大比分 红${m.wins.red}:${m.wins.blue}蓝`);
