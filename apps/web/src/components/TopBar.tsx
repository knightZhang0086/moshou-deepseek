import type { MatchState } from '@moshou/engine';
import type { GameMode } from '../store';

interface TopBarProps {
  state: MatchState;
  redName: string;
  blueName: string;
  aiBusy: boolean;
  mode: GameMode;
  code: string | null;
}

function WoodIcon() {
  return (
    <svg className="wood-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="2.5" fill="#b8905a" stroke="#7a5a2e" strokeWidth="1" />
      <line x1="4.5" y1="5" x2="4.5" y2="11" stroke="#7a5a2e" strokeWidth="0.9" />
      <line x1="8" y1="5" x2="8" y2="11" stroke="#7a5a2e" strokeWidth="0.9" />
      <line x1="11.5" y1="5" x2="11.5" y2="11" stroke="#7a5a2e" strokeWidth="0.9" />
    </svg>
  );
}

export default function TopBar({ state, redName, blueName, aiBusy, mode, code }: TopBarProps) {
  const turn = state.round.turn;
  const modeLabel =
    mode === 'local' ? '本地对战' : mode === 'ai' ? '人机对战' : `在线对战${code ? ` · ${code}` : ''}`;
  return (
    <header className="topbar">
      <div className="topbar-round">
        第 <b>{state.round.roundNumber}</b> 局
        <span className="match-mode">{modeLabel}</span>
      </div>
      <div className="topbar-score">
        <span className="score-name red">{redName}</span>
        <span className="score-nums">
          <b>{state.wins.red}</b>
          <span className="score-sep">:</span>
          <b>{state.wins.blue}</b>
        </span>
        <span className="score-name blue">{blueName}</span>
      </div>
      <div className="topbar-pool" title={`公共木片池剩余 ${state.round.pool} 根，弃置区 ${state.round.discard} 根`}>
        <WoodIcon />
        <span className="pool-num">{state.round.pool}</span>
        <span className="pool-discard">弃 {state.round.discard}</span>
      </div>
      <div className={`turn-chip side-${state.pendingRemoval ? 'neutral' : turn}`}>
        <span className="turn-dot" />
        {state.pendingRemoval
          ? '小局结束 · 弃牌阶段'
          : aiBusy
            ? 'AI 思考中…'
            : `${turn === 'red' ? redName : blueName} 回合`}
      </div>
    </header>
  );
}
