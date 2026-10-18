import { CARDS, type MatchState, type Side } from '@moshou/engine';
import { describeAction } from '../describe';
import type { GameMode } from '../store';

interface SidePanelProps {
  state: MatchState;
  redName: string;
  blueName: string;
  mode: GameMode;
  aiSide: Side | null;
  onRules(): void;
  onCards(): void;
  onExit(): void;
}

function PlayerCard(props: {
  side: Side;
  name: string;
  state: MatchState;
  aiSide: Side | null;
}) {
  const { side, name, state } = props;
  const deck = state.decks[side];
  const removed = state.removed[side];
  const used = state.round.usedThisRound[side];
  const wins = state.wins[side];
  return (
    <div className={`player-card side-${side}`}>
      <div className="player-head">
        <span className="player-name">
          {name}
          {props.aiSide === side && <span className="ai-tag">AI</span>}
        </span>
        <span className="player-wins">胜 {wins}</span>
      </div>
      <div className="mini-cards">
        {deck.map((c) => {
          const isUsed = used.includes(c);
          const isRemoved = removed.includes(c);
          return (
            <span
              key={c}
              className={`mini-card${isRemoved ? ' removed' : ''}${isUsed ? ' used' : ''}`}
              title={isRemoved ? '已移除' : isUsed ? '本局已用' : CARDS[c].long}
            >
              {CARDS[c].name}
              {isRemoved && <i>✕</i>}
              {!isRemoved && isUsed && <i>✓</i>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function SidePanel(props: SidePanelProps) {
  const { state, redName, blueName, mode, aiSide } = props;
  const log = state.round.log.slice(-10).reverse();
  return (
    <aside className="side-panel">
      <PlayerCard side="red" name={redName} state={state} aiSide={aiSide} />
      <PlayerCard side="blue" name={blueName} state={state} aiSide={aiSide} />

      <div className="log-list" role="log" aria-label="行动日志">
        {log.length === 0 && <p className="log-empty">对局开始，静待落子。</p>}
        {log.map((entry) => (
          <p key={entry.seq} className={`log-item side-${entry.side}`}>
            <span className="log-num">{entry.seq}</span>
            {describeAction(entry.side === 'red' ? redName : blueName, entry.action)}
          </p>
        ))}
      </div>

      <div className="panel-actions">
        <button type="button" className="btn btn-ghost" onClick={props.onRules}>
          规则
        </button>
        <button type="button" className="btn btn-ghost" onClick={props.onCards}>
          牌库
        </button>
        <button type="button" className="btn btn-danger" onClick={props.onExit}>
          {mode === 'online' ? '认输 · 退出' : '认输 · 退出'}
        </button>
      </div>
    </aside>
  );
}
