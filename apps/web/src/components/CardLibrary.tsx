import { CARDS, CARDS_BY_SIDE, type CardDef, type CardId, type Side } from '@moshou/engine';

export interface LibContext {
  decks: Record<Side, CardId[]>;
  removed: Record<Side, CardId[]>;
  used: Record<Side, CardId[]>;
}

interface CardLibraryProps {
  /** 传入对局上下文时，标注 在场/已用/已移除/未抽中 */
  context?: LibContext;
}

function cardStatus(def: CardDef, context?: LibContext): { cls: string; label: string } {
  if (!context) return { cls: '', label: '' };
  const side = def.side;
  if (context.removed[side].includes(def.id)) return { cls: 'removed', label: '已移除' };
  if (!context.decks[side].includes(def.id)) return { cls: 'absent', label: '未抽中' };
  if (context.used[side].includes(def.id)) return { cls: 'used', label: '本局已用' };
  return { cls: 'indeck', label: '在场' };
}

/** 九攻九拒 · 十八张技能牌总览 */
export default function CardLibrary({ context }: CardLibraryProps) {
  return (
    <div className="lib-grid">
      {[...CARDS_BY_SIDE.red, ...CARDS_BY_SIDE.blue].map((def) => {
        const st = cardStatus(def, context);
        return (
          <article key={def.id} className={`lib-card side-${def.side}${st.cls ? ` ${st.cls}` : ''}`}>
            <header className="lib-head">
              <span className={`lib-side-badge side-${def.side}`}>{def.side === 'red' ? '攻' : '拒'}</span>
              <h4 className="lib-name">{def.name}</h4>
              <span className="lib-cost">
                {Array.from({ length: def.cost }, (_, i) => (
                  <span key={i} className="pip" />
                ))}
              </span>
              {st.label && <span className="lib-status">{st.label}</span>}
            </header>
            <p className="lib-short">{def.short}</p>
            <p className="lib-long">{def.long}</p>
            <p className="lib-flavor">「{def.flavor}」</p>
          </article>
        );
      })}
    </div>
  );
}
