/**
 * 整场状态机：抽牌开局、小局推进、小局结束后的弃牌、下一小局、整场胜负。
 *
 * 整场比赛：双方各从九张牌中随机抽五张（公开）。每小局结束时，
 * 败者从胜者保留的牌中选择一张永久移出本场比赛。
 * 谁的五张牌率先全部被移除（即率先赢得五个小局），谁获得整场胜利。
 */
import { mulberry32, shuffle } from './random.js';
import { applyAction, type ApplyResult } from './rules.js';
import { CARDS_BY_SIDE } from './skills.js';
import {
  otherSide,
  type Action,
  type CardId,
  type MatchConfig,
  type MatchState,
  type RoundState,
  type Side,
} from './types.js';

export function newRound(
  size: number,
  pool: number,
  firstTurn: Side,
  roundNumber: number,
): RoundState {
  return {
    size,
    initialPool: pool,
    pool,
    discard: 0,
    cells: {},
    turn: firstTurn,
    firstTurn,
    roundNumber,
    lastMoveConvert: { red: false, blue: false },
    lastConvertedBy: null,
    lastConvertedCells: [],
    usedThisRound: { red: [], blue: [] },
    log: [],
  };
}

export function newMatch(config: MatchConfig): MatchState {
  const size = config.size;
  const pool = config.pool;
  const rng = mulberry32(config.seed ?? Math.floor(Math.random() * 0x7fffffff));
  const redCards = shuffle(
    CARDS_BY_SIDE.red.map((c) => c.id),
    rng,
  ).slice(0, 5);
  const blueCards = shuffle(
    CARDS_BY_SIDE.blue.map((c) => c.id),
    rng,
  ).slice(0, 5);
  return {
    version: 1,
    config: { size, pool, firstTurn: config.firstTurn, seed: config.seed },
    decks: { red: redCards, blue: blueCards },
    removed: { red: [], blue: [] },
    wins: { red: 0, blue: 0 },
    round: newRound(size, pool, config.firstTurn, 1),
    pendingRemoval: null,
    matchWinner: null,
    history: [],
  };
}

/** 执行一次行动；小局结束时置 pendingRemoval，等待败者弃牌 */
export function performAction(m: MatchState, a: Action): ApplyResult {
  const res = applyAction(m, a);
  if (res.roundEnd) {
    m.pendingRemoval = {
      winner: res.roundEnd.winner,
      loser: otherSide(res.roundEnd.winner),
      by: res.roundEnd.by,
    };
  }
  return res;
}

/** 败者为胜者选择一张移除的技能牌；随后结算胜负或开启下一小局 */
export function chooseRemoval(
  m: MatchState,
  chooser: Side,
  cardId: CardId,
): { matchEnded: boolean } {
  const pr = m.pendingRemoval;
  if (!pr) throw new Error('当前没有待选择的弃牌');
  if (chooser !== pr.loser) throw new Error('只有败者可以为胜者选择弃牌');
  if (!m.decks[pr.winner].includes(cardId)) throw new Error('不是胜者的技能牌');
  if (m.removed[pr.winner].includes(cardId)) throw new Error('该技能牌已被移除');

  m.removed[pr.winner].push(cardId);
  m.wins[pr.winner] += 1;
  m.history.push({
    roundNumber: m.round.roundNumber,
    winner: pr.winner,
    by: pr.by,
    removedCard: cardId,
  });
  m.pendingRemoval = null;

  if (m.wins[pr.winner] >= 5 || m.removed[pr.winner].length >= 5) {
    m.matchWinner = pr.winner;
    return { matchEnded: true };
  }
  m.round = newRound(m.config.size, m.config.pool, m.config.firstTurn, m.round.roundNumber + 1);
  return { matchEnded: false };
}

/** 胜者当前保留（未被移除）的技能牌 */
export function remainingCards(m: MatchState, side: Side): CardId[] {
  return m.decks[side].filter((c) => !m.removed[side].includes(c));
}
