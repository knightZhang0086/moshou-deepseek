import { useMemo } from 'react';
import {
  allCells,
  blueLatticeEdges,
  cellCenter,
  cellKey,
  parseCellKey,
  redLatticeEdges,
  type CellId,
  type MatchState,
  type Side,
  type Stick,
} from '@moshou/engine';
import { sideColor } from '../theme';

interface BoardProps {
  state: MatchState;
  /** 当前行动方（决定高亮颜色） */
  activeSide: Side;
  canAct: boolean;
  /** place=放置模式；convert=易械模式；skill=技能选目标 */
  mode: 'place' | 'convert' | 'skill';
  convertTargetKeys: string[];
  skillTargetKeys: string[];
  pickedKeys: string[];
  lastActionKey: string | null;
  flashKeys: string[];
  onCellClick: (key: string) => void;
  animOn: boolean;
}

const MARGIN = 1.55;
const BAR_LEN = 0.86;
const BAR_W = 0.25;

interface StickItem {
  key: string;
  c: CellId;
  stick: Stick;
}

export default function Board(props: BoardProps) {
  const { state } = props;
  const size = state.round.size;
  const cells = state.round.cells;

  const all = useMemo(() => allCells(size), [size]);
  const redEdges = useMemo(() => redLatticeEdges(size), [size]);
  const blueEdges = useMemo(() => blueLatticeEdges(size), [size]);

  const sticks = useMemo<StickItem[]>(() => {
    const out: StickItem[] = [];
    for (const c of all) {
      const key = cellKey(c);
      const stick = cells[key];
      if (stick) out.push({ key, c, stick });
    }
    return out;
  }, [all, cells]);

  const placeables = useMemo(() => {
    if (props.mode !== 'place' || !props.canAct) return new Set<string>();
    const s = new Set<string>();
    for (const c of all) {
      const k = cellKey(c);
      if (!cells[k]) s.add(k);
    }
    return s;
  }, [props.mode, props.canAct, all, cells]);

  const activeColor = sideColor(props.activeSide);
  const vb = `${-MARGIN} ${-MARGIN} ${size + 2 * MARGIN} ${size + 2 * MARGIN}`;

  const centerOf = (key: string) => cellCenter(parseCellKey(key));

  return (
    <div className="board-frame">
      <div className="board-wrap">
        <svg
          className={`board-svg ${props.animOn ? 'anim-on' : 'anim-off'}`}
          viewBox={vb}
          role="img"
          aria-label="墨守成规棋盘"
        >
          <defs>
            <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c54a3c" />
              <stop offset="100%" stopColor="#8f2d24" />
            </linearGradient>
            <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3a6f9f" />
              <stop offset="100%" stopColor="#23486c" />
            </linearGradient>
          </defs>

          {/* 红网（含棋盘边框） */}
          <g className="red-lattice" stroke="#8a6f4d" strokeWidth={0.022} strokeLinecap="round">
            {redEdges.map(([a, b], i) => {
              const border = a.y === 0 || b.y === 0 || a.y === size || b.y === size || a.x === 0 || b.x === 0 || a.x === size || b.x === size;
              return (
                <line
                  key={`r${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={border ? '#4a3824' : '#8a6f4d'}
                  strokeWidth={border ? 0.05 : 0.022}
                  opacity={border ? 1 : 0.55}
                />
              );
            })}
          </g>

          {/* 蓝网（虚线感） */}
          <g
            className="blue-lattice"
            stroke="#5c7a99"
            strokeWidth={0.02}
            strokeDasharray="0.055 0.07"
            strokeLinecap="round"
            opacity={0.75}
          >
            {blueEdges.map(([a, b], i) => (
              <line key={`b${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            ))}
          </g>

          {/* 交叉位置槽位记号（X 形，H/V 两种朝向） */}
          <g className="slot-marks" stroke="#6b5a41" strokeWidth={0.02} opacity={0.5}>
            {all.map((c) => {
              const p = cellCenter(c);
              const k = cellKey(c);
              const vertical = c.d === 'H'; // H 槽被竖蓝边穿过 → X 纵向拉长
              const dx = vertical ? 0.075 : 0.115;
              const dy = vertical ? 0.115 : 0.075;
              return (
                <g key={`m${k}`}>
                  <line x1={p.x - dx} y1={p.y - dy} x2={p.x + dx} y2={p.y + dy} />
                  <line x1={p.x - dx} y1={p.y + dy} x2={p.x + dx} y2={p.y - dy} />
                </g>
              );
            })}
          </g>

          {/* 木片 */}
          {sticks.map(({ key, c, stick }) => {
            const p = cellCenter(c);
            const isRed = stick.side === 'red';
            const horizontal = (c.d === 'H') === isRed;
            const fill = isRed ? 'url(#gradRed)' : 'url(#gradBlue)';
            const stroke = isRed ? '#7c2419' : '#1d3f61';
            const wm = isRed ? '攻' : '守';
            const x = horizontal ? p.x - BAR_LEN / 2 : p.x - BAR_W / 2;
            const y = horizontal ? p.y - BAR_W / 2 : p.y - BAR_LEN / 2;
            const w = horizontal ? BAR_LEN : BAR_W;
            const h = horizontal ? BAR_W : BAR_LEN;
            const wmX = horizontal ? p.x - 0.15 : p.x;
            const wmY = horizontal ? p.y : p.y + 0.16;
            const shX = horizontal ? p.x + 0.22 : p.x;
            const shY = horizontal ? p.y : p.y - 0.22;
            return (
              <g key={`s${key}`} className={`stick stick-${stick.side}`}>
                <rect x={x} y={y} width={w} height={h} rx={0.05} fill={fill} stroke={stroke} strokeWidth={0.018} />
                <text
                  className="stick-wm"
                  x={wmX}
                  y={wmY}
                  fontSize={0.17}
                  fill="rgba(255,244,224,0.92)"
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={horizontal ? undefined : `rotate(-90 ${wmX} ${wmY})`}
                >
                  {wm}
                </text>
                {stick.fortified && (
                  <g className="shield" transform={`translate(${shX} ${shY})`}>
                    <path
                      d="M0,-0.07 L0.06,-0.07 L0.06,-0.03 Q0.06,0.04 0,0.09 Q-0.06,0.04 -0.06,-0.03 Z"
                      fill="#d9a441"
                      stroke="#2b241c"
                      strokeWidth={0.016}
                    />
                    <line x1={0} y1={-0.05} x2={0} y2={0.05} stroke="#2b241c" strokeWidth={0.014} />
                  </g>
                )}
              </g>
            );
          })}

          {/* 可放置空位高亮（浅色脉冲点） */}
          {props.mode === 'place' && props.canAct && (
            <g>
              {[...placeables].map((k) => {
                const p = centerOf(k);
                return <circle key={`p${k}`} className="hl-place" cx={p.x} cy={p.y} r={0.12} fill={activeColor} />;
              })}
            </g>
          )}

          {/* 易械目标高亮（亮环） */}
          {props.mode === 'convert' && (
            <g>
              {props.convertTargetKeys.map((k) => {
                const p = centerOf(k);
                return (
                  <circle
                    key={`c${k}`}
                    className="hl-convert"
                    cx={p.x}
                    cy={p.y}
                    r={0.2}
                    fill="rgba(201,150,46,0.18)"
                    stroke="#c9962e"
                    strokeWidth={0.035}
                  />
                );
              })}
            </g>
          )}

          {/* 技能可选目标高亮 */}
          {props.mode === 'skill' && (
            <g>
              {props.skillTargetKeys.map((k) => {
                const p = centerOf(k);
                const picked = props.pickedKeys.includes(k);
                return picked ? (
                  <circle key={`t${k}`} className="hl-picked" cx={p.x} cy={p.y} r={0.14} fill="rgba(201,150,46,0.85)" />
                ) : (
                  <circle
                    key={`t${k}`}
                    className="hl-skill"
                    cx={p.x}
                    cy={p.y}
                    r={0.2}
                    fill="none"
                    stroke="#2b241c"
                    strokeWidth={0.03}
                    strokeDasharray="0.06 0.05"
                  />
                );
              })}
            </g>
          )}

          {/* 上一步行动的木片光圈 */}
          {(() => {
            const lastKey = props.lastActionKey && cells[props.lastActionKey] ? props.lastActionKey : null;
            if (!lastKey) return null;
            const lp = centerOf(lastKey);
            return (
              <circle
                className="hl-last"
                cx={lp.x}
                cy={lp.y}
                r={0.26}
                fill="none"
                stroke="rgba(255,250,235,0.95)"
                strokeWidth={0.04}
              />
            );
          })()}

          {/* 贯通线路闪亮 */}
          {props.flashKeys.map((k) => {
            const p = centerOf(k);
            return (
              <circle
                key={`f${k}`}
                className="flash-ring"
                cx={p.x}
                cy={p.y}
                r={0.24}
                fill="rgba(232,198,74,0.28)"
                stroke="#e8c64a"
                strokeWidth={0.055}
              />
            );
          })}

          {/* 边界标注（东侧为蓝方出口，标签右移让出出口边） */}
          <g className="board-labels">
            <text x={size / 2} y={-MARGIN + 0.62} className="board-label-main" fontSize={0.34} textAnchor="middle">
              宋城
            </text>
            <text x={size / 2} y={-MARGIN + 1.08} className="board-label-sub" fontSize={0.15} textAnchor="middle">
              红 · 贯通南北即胜
            </text>
            <text x={size / 2} y={size + MARGIN - 0.62} className="board-label-main" fontSize={0.34} textAnchor="middle">
              楚营
            </text>
            <text x={size / 2} y={size + MARGIN - 1.08} className="board-label-sub" fontSize={0.15} textAnchor="middle">
              公输盘自此起攻 · 池尽则墨子胜
            </text>
            <text
              x={-MARGIN + 0.62}
              y={size / 2}
              className="board-label-main"
              fontSize={0.34}
              textAnchor="middle"
              transform={`rotate(90 ${-MARGIN + 0.62} ${size / 2})`}
            >
              西境
            </text>
            <text
              x={-MARGIN + 1.08}
              y={size / 2}
              className="board-label-sub"
              fontSize={0.15}
              textAnchor="middle"
              transform={`rotate(90 ${-MARGIN + 1.08} ${size / 2})`}
            >
              蓝 · 贯通东西即胜
            </text>
            <text
              x={size + MARGIN - 0.4}
              y={size / 2}
              className="board-label-main"
              fontSize={0.34}
              textAnchor="middle"
              transform={`rotate(90 ${size + MARGIN - 0.4} ${size / 2})`}
            >
              东境
            </text>
          </g>

          {/* 点击热区（覆盖整个单元格；桌面端 ≥40px，移动端小规格棋盘亦接近 40px） */}
          <g>
            {all.map((c) => {
              const k = cellKey(c);
              const p = cellCenter(c);
              return (
                <rect
                  key={`h${k}`}
                  className={`cell-hit${props.canAct ? ' active' : ''}`}
                  x={p.x - 0.5}
                  y={p.y - 0.5}
                  width={1}
                  height={1}
                  fill="transparent"
                  onClick={() => props.onCellClick(k)}
                />
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
