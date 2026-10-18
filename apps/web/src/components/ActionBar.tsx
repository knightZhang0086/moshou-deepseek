import type { CardId, Side } from '@moshou/engine';
import CardTile from './CardTile';

interface ActionBarProps {
  turn: Side;
  deck: CardId[];
  removed: CardId[];
  used: CardId[];
  canAct: boolean;
  convertMode: boolean;
  convertBlockedReason: string | null;
  selectionCard: CardId | null;
  playable: CardId[];
  onSelectPlace(): void;
  onToggleConvert(): void;
  onSelectCard(card: CardId): void;
  onCancel(): void;
}

export default function ActionBar(props: ActionBarProps) {
  const {
    deck,
    removed,
    used,
    canAct,
    convertMode,
    convertBlockedReason,
    selectionCard,
    playable,
  } = props;
  return (
    <div className={`action-bar side-${props.turn}`}>
      <div className="mode-row">
        <button
          type="button"
          className={`mode-btn${!convertMode && !selectionCard ? ' active' : ''}`}
          onClick={props.onSelectPlace}
          disabled={!canAct}
        >
          放置
        </button>
        <button
          type="button"
          className={`mode-btn${convertMode ? ' active' : ''}`}
          onClick={props.onToggleConvert}
          disabled={!canAct || !!convertBlockedReason}
          title={convertBlockedReason ?? '切换易械模式'}
        >
          易械{convertBlockedReason ? `（${convertBlockedReason}）` : ''}
        </button>
        {(convertMode || selectionCard) && (
          <button type="button" className="cancel-chip" onClick={props.onCancel}>
            取消（Esc）
          </button>
        )}
      </div>
      <div className="hand" role="group" aria-label="技能牌">
        {deck.map((card) => {
          const isUsed = used.includes(card);
          const isRemoved = removed.includes(card);
          const isPlayable = canAct && playable.includes(card);
          const state = selectionCard === card ? 'selected' : isRemoved ? 'removed' : isUsed ? 'used' : isPlayable ? 'playable' : null;
          return (
            <CardTile
              key={card}
              card={card}
              state={state}
              onClick={canAct && !isUsed && !isRemoved ? () => props.onSelectCard(card) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
