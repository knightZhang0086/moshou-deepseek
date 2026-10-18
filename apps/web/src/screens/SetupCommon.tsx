import type { ReactNode } from 'react';

export const SIZE_OPTIONS = [5, 7, 9] as const;
export const POOL_OPTIONS = [20, 24, 28, 30, 32, 36, 40] as const;
export const RECOMMENDED_POOL: Record<number, number> = { 5: 20, 7: 28, 9: 36 };

interface SetupCommonProps {
  title: string;
  onBack(): void;
}

/** 规格/木片池设置块（本地与在线共用） */
export function BoardConfigFields(props: {
  size: number;
  pool: number;
  onSize(n: number): void;
  onPool(n: number): void;
}) {
  const { size, pool } = props;
  const rec = RECOMMENDED_POOL[size] ?? 28;
  return (
    <>
      <div className="field">
        <span className="field-label">棋盘规格</span>
        <div className="seg" role="group" aria-label="棋盘规格">
          {SIZE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className={`seg-btn${size === n ? ' active' : ''}`}
              onClick={() => {
                props.onSize(n);
                props.onPool(RECOMMENDED_POOL[n] ?? rec);
              }}
            >
              {n}×{n}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">木片池</span>
        <div className="seg pool-seg" role="group" aria-label="木片池数量">
          {POOL_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className={`seg-btn${pool === n ? ' active' : ''}${n === rec ? ' recommended' : ''}`}
              onClick={() => props.onPool(n)}
            >
              {n}
              {n === rec && <span className="rec-dot" />}
            </button>
          ))}
        </div>
        <p className="hint">
          {size}×{size} 棋盘推荐 {rec} 根（交叉位置 {size * (2 * size - 1)} 处，含东境出口列）。
        </p>
      </div>
    </>
  );
}

export function SetupShell(props: SetupCommonProps & { children: ReactNode }) {
  return (
    <div className="container">
      <div className="back-row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={props.onBack}>
          ← 返回主菜单
        </button>
      </div>
      <div className="panel center-panel setup-panel">
        <h2 className="screen-title">{props.title}</h2>
        {props.children}
      </div>
    </div>
  );
}
