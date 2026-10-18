import { CARDS, type CardId } from '@moshou/engine';

export interface CardTileProps {
  card: CardId;
  /** 附加状态类：playable / used / removed / selected */
  state?: 'playable' | 'used' | 'removed' | 'selected' | null;
  onClick?: () => void;
  compact?: boolean;
}

/** 对局内使用的技能牌小牌面（行动栏 / 弃牌选择 / 侧栏迷你牌） */
export default function CardTile({ card, state = null, onClick, compact = false }: CardTileProps) {
  const def = CARDS[card];
  const cls = `card-tile side-${def.side}${state ? ` ${state}` : ''}${onClick ? ' clickable' : ''}`;
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={!onClick}
      title={def.long}
      aria-label={def.name}
    >
      <span className="card-cost">
        {Array.from({ length: def.cost }, (_, i) => (
          <span key={i} className="pip" />
        ))}
      </span>
      <span className={`card-name ${compact ? 'compact' : ''}`}>{def.name}</span>
      {state === 'used' && <span className="card-stamp">已用</span>}
      {state === 'removed' && <span className="card-stamp">已移除</span>}
    </button>
  );
}
