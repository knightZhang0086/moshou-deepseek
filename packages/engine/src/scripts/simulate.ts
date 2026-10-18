/**
 * AI 对 AI 自动模拟：用于平衡测试与回归。
 * 用法（先 pnpm build）：
 *   node dist/scripts/simulate.js                 # 默认 100 场，7×7，池 28，简单 AI
 *   node dist/scripts/simulate.js --games 200 --level medium --sweep
 */
import { chooseAiAction, chooseAiRemoval, type AiLevel } from '../ai.js';
import { chooseRemoval, newMatch, performAction } from '../match.js';
import { mulberry32 } from '../random.js';

// 本脚本仅运行于 Node（保持引擎本体零环境依赖）
declare const console: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
declare const process: { argv: string[] };

interface Opts {
  games: number;
  size: number;
  pool: number;
  level: AiLevel;
  seed: number;
}

function parseArgs(argv: string[]): Partial<Opts> & { sweep?: boolean } {
  const out: Record<string, string | number | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--sweep') out.sweep = true;
    else if (a.startsWith('--')) {
      const val = argv[i + 1]!;
      out[a.slice(2)] = /^\d+$/.test(val) ? Number(val) : val;
      i++;
    }
  }
  return out as Partial<Opts> & { sweep?: boolean };
}

function playOne(
  size: number,
  pool: number,
  level: AiLevel,
  seed: number,
): { winner: 'red' | 'blue'; rounds: number; actions: number } {
  const m = newMatch({ size, pool, firstTurn: 'red', seed });
  const rng = mulberry32(seed ^ 0x51ab);
  let actions = 0;
  while (!m.matchWinner) {
    if (m.pendingRemoval) {
      const card = chooseAiRemoval(m, rng);
      if (!card) throw new Error('AI 弃牌选择失败');
      chooseRemoval(m, m.pendingRemoval.loser, card);
      continue;
    }
    const a = chooseAiAction(m, level, rng);
    if (!a) throw new Error('AI 无行动可选');
    performAction(m, a);
    actions++;
    if (actions > 1000) throw new Error('对局过长，疑似死循环');
  }
  return { winner: m.matchWinner, rounds: m.wins.red + m.wins.blue, actions };
}

function runBlock(size: number, pool: number, level: AiLevel, games: number, seedBase: number) {
  let red = 0;
  let blue = 0;
  let totalActions = 0;
  let totalRounds = 0;
  for (let i = 0; i < games; i++) {
    const r = playOne(size, pool, level, seedBase + i);
    if (r.winner === 'red') red++;
    else blue++;
    totalActions += r.actions;
    totalRounds += r.rounds;
  }
  const redPct = ((red / games) * 100).toFixed(1);
  const bluePct = ((blue / games) * 100).toFixed(1);
  const avgActions = (totalActions / games).toFixed(1);
  const avgRounds = (totalRounds / games).toFixed(2);
  console.log(
    `${size}×${size}  池${String(pool).padEnd(3)} ${level.padEnd(6)}  ${games}场 | 公输盘 ${String(red).padStart(3)} (${redPct}%)  墨子 ${String(blue).padStart(3)} (${bluePct}%) | 均场行动 ${avgActions} 均小局 ${avgRounds}`,
  );
  return { red, blue, games };
}

const argv = parseArgs(process.argv.slice(2));
const level = (argv.level as AiLevel) ?? 'easy';
const games = argv.games ?? 100;
const seedBase = argv.seed ?? 20261018;

console.log(`《墨守成规》自动模拟（AI vs AI，双方同档 ${level}）\n`);

if (argv.sweep) {
  const results: Array<{ size: number; pool: number; redPct: number }> = [];
  for (const size of [5, 7, 9]) {
    const pools = size === 5 ? [16, 20] : size === 7 ? [20, 24, 28, 30] : [28, 32, 36, 40];
    for (const pool of pools) {
      const r = runBlock(size, pool, level, games, seedBase);
      results.push({ size, pool, redPct: r.red / r.games });
    }
  }
  console.log('\n汇总（公输盘胜率）：');
  for (const r of results) console.log(`  ${r.size}×${r.size} 池${r.pool}: ${(r.redPct * 100).toFixed(1)}%`);
} else {
  runBlock(argv.size ?? 7, argv.pool ?? 28, level, games, seedBase);
}
