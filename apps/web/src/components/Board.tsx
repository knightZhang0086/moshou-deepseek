import { useMemo, useState } from 'react';
import {
  allCells,
  blueEndpoints,
  blueLatticeEdges,
  cellCenter,
  cellKey,
  parseCellKey,
  redEndpoints,
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
  /** 己方当前最短推进路线上的位置（教学提示） */
  myPathKeys: string[];
  lastActionKey: string | null;
  flashKeys: string[];
  onCellClick: (key: string) => void;
  onHoverSlot?: (key: string | null) => void;
  animOn: boolean;
}

const MARGIN = 1.7;
const BAR_LEN = 0.9;
const BAR_W = 0.26;

interface StickItem {
  key: string;
  c: CellId;
  stick: Stick;
}

/** 该位置当前行动方木片的朝向：横 or 竖 */
export function orientedHorizontal(c: CellId, side: Side): boolean {
  return c.d === 'H' ? side === 'red' : side === 'blue';
}

export default function Board(props: BoardProps) {
  const { state } = props;
  const size = state.round.size;
  const cells = state.round.cells;
  const [hovered, setHovered] = useState<string | null>(null);

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

  const emptyKeys = useMemo(() => {
    const s: string[] = [];
    for (const c of all) {
      const k = cellKey(c);
      if (!cells[k]) s.push(k);
    }
    return s;
  }, [all, cells]);

  const placeMode = props.mode === 'place' && props.canAct;
  const placeable = useMemo(
    () => (placeMode ? new Set(emptyKeys) : new Set<string>()),
    [placeMode, emptyKeys],
  );
  const myPathSet = useMemo(() => new Set(props.myPathKeys), [props.myPathKeys]);

  const activeColor = sideColor(props.activeSide);
  const vb = `${-MARGIN} ${-MARGIN} ${size + 2 * MARGIN} ${size + 2 * MARGIN}`;
  const centerOf = (key: string) => cellCenter(parseCellKey(key));

  // 红网顶点 / 蓝网格心（含东境出口虚节点）
  const redNodes: Array<[number, number]> = useMemo(() => {
    const out: Array<[number, number]> = [];
    for (let x = 0; x <= size; x++) for (let y = 0; y <= size; y++) out.push([x, y]);
    return out;
  }, [size]);
  const blueNodes: Array<[number, number, boolean]> = useMemo(() => {
    const out: Array<[number, number, boolean]> = [];
    for (let x = 0; x < size; x++)
      for (let y = 0; y < size; y++) out.push([x + 0.5, y + 0.5, false]);
    for (let y = 0; y < size; y++) out.push([size, y + 0.5, true]); // 东境出口虚节点
    return out;
  }, [size]);

  /** 木片 / 幽灵连接的端点（决定线条方向与长度） */
  function segFor(c: CellId, side: Side): [number, number, number, number] {
    const p = cellCenter(c);
    const half = BAR_LEN / 2;
    return orientedHorizontal(c, side)
      ? [p.x - half, p.y, p.x + half, p.y]
      : [p.x, p.y - half, p.x, p.y + half];
  }

  const hoveredCell = hovered ? parseCellKey(hovered) : null;
  const hoveredSeg = hoveredCell ? segFor(hoveredCell, props.activeSide) : null;
  const hoveredNodePairs = hoveredCell
    ? props.activeSide === 'red'
      ? redEndpoints(hoveredCell)
      : blueEndpoints(hoveredCell)
    : null;

  const handleHover = (key: string | null) => {
    setHovered(key);
    props.onHoverSlot?.(key);
  };

  return (
    <div className="board-frame">
      <div className="board-wrap">
        <svg
          className={`board-svg ${props.animOn ? 'anim-on' : 'anim-off'}`}
          viewBox={vb}
          role="img"
          aria-label="墨守成规棋盘：红圈为公输盘节点，蓝方块为墨子节点，菱形为可放木片的桥位"
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
            <filter id="stickShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0.03" stdDeviation="0.03" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* 棋盘底板 */}
          <rect
            x={-0.62}
            y={-0.62}
            width={size + 1.24}
            height={size + 1.24}
            rx={0.18}
            fill="#f0e3c8"
            stroke="#4a3824"
            strokeWidth={0.055}
          />
          <rect
            x={-0.5}
            y={-0.5}
            width={size + 1}
            height={size + 1}
            rx={0.12}
            fill="none"
            stroke="rgba(74,56,36,0.35)"
            strokeWidth={0.014}
          />

          {/* 红网连线（很淡，作为网络提示） */}
          <g stroke="#b23a2e" strokeWidth={0.016} strokeLinecap="round" opacity={0.16}>
            {redEdges.map(([a, b], i) => (
              <line key={`r${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            ))}
          </g>

          {/* 蓝网连线（虚线，很淡） */}
          <g
            stroke="#2f5f8f"
            strokeWidth={0.016}
            strokeDasharray="0.05 0.075"
            strokeLinecap="round"
            opacity={0.22}
          >
            {blueEdges.map(([a, b], i) => (
              <line key={`b${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            ))}
          </g>

          {/* 红网节点：方格顶点（红圈） */}
          <g className="red-nodes">
            {redNodes.map(([x, y]) => (
              <circle
                key={`rn${x}-${y}`}
                cx={x}
                cy={y}
                r={0.062}
                fill="#f7ecd8"
                stroke="#b23a2e"
                strokeWidth={0.026}
              />
            ))}
          </g>

          {/* 蓝网节点：格心（蓝方块），东境虚节点用虚线框 */}
          <g className="blue-nodes">
            {blueNodes.map(([x, y, virtual], i) => (
              <rect
                key={`bn${i}`}
                x={x - 0.062}
                y={y - 0.062}
                width={0.124}
                height={0.124}
                rx={0.02}
                fill="#eef3f8"
                stroke="#2f5f8f"
                strokeWidth={0.024}
                strokeDasharray={virtual ? '0.04 0.03' : undefined}
              />
            ))}
          </g>

          {/* 桥位（菱形槽位） */}
          <g className="slots">
            {all.map((c) => {
              const p = cellCenter(c);
              const k = cellKey(c);
              const occupied = !!cells[k];
              const isPathHint = !occupied && myPathSet.has(k);
              return (
                <g key={`sl${k}`}>
                  <path
                    d={`M ${p.x - 0.115} ${p.y} L ${p.x} ${p.y - 0.115} L ${p.x + 0.115} ${p.y} L ${p.x} ${p.y + 0.115} Z`}
                    fill={occupied ? 'rgba(43,36,28,0.05)' : 'rgba(43,36,28,0.09)'}
                    stroke={isPathHint ? 'rgba(178,58,46,0.55)' : 'rgba(43,36,28,0.38)'}
                    strokeWidth={isPathHint ? 0.028 : 0.016}
                    strokeDasharray={isPathHint ? '0.05 0.04' : undefined}
                  />
                </g>
              );
            })}
          </g>

          {/* 放置模式：空位显示当前玩家木片的幽灵朝向（横竖一目了然） */}
          {placeMode && (
            <g className="ghosts">
              {[...placeable].map((k) => {
                const c = parseCellKey(k);
                const [x1, y1, x2, y2] = segFor(c, props.activeSide);
                const hot = hovered === k;
                return (
                  <line
                    key={`g${k}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={activeColor}
                    strokeWidth={hot ? 0.19 : 0.12}
                    strokeLinecap="round"
                    opacity={hot ? 0.55 : 0.2}
                  />
                );
              })}
            </g>
          )}

          {/* 木片 */}
          {sticks.map(({ key, c, stick }) => {
            const p = cellCenter(c);
            const isRed = stick.side === 'red';
            const horizontal = orientedHorizontal(c, stick.side);
            const fill = isRed ? 'url(#gradRed)' : 'url(#gradBlue)';
            const stroke = isRed ? '#7c2419' : '#1d3f61';
            const wm = isRed ? '攻' : '守';
            const x = horizontal ? p.x - BAR_LEN / 2 : p.x - BAR_W / 2;
            const y = horizontal ? p.y - BAR_W / 2 : p.y - BAR_LEN / 2;
            const w = horizontal ? BAR_LEN : BAR_W;
            const h = horizontal ? BAR_W : BAR_LEN;
            const wmX = horizontal ? p.x - 0.17 : p.x;
            const wmY = horizontal ? p.y : p.y + 0.17;
            const shX = horizontal ? p.x + 0.24 : p.x;
            const shY = horizontal ? p.y : p.y - 0.24;
            return (
              <g key={`s${key}`} className={`stick stick-${stick.side}`} filter="url(#stickShadow)">
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={0.055}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={0.018}
                />
                <text
                  className="stick-wm"
                  x={wmX}
                  y={wmY}
                  fontSize={0.16}
                  fill="rgba(255,244,224,0.95)"
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
                  </g>
                )}
              </g>
            );
          })}

          {/* 易械目标高亮 */}
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
                    r={0.21}
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
                  <circle key={`t${k}`} className="hl-picked" cx={p.x} cy={p.y} r={0.15} fill="rgba(201,150,46,0.85)" />
                ) : (
                  <circle
                    key={`t${k}`}
                    className="hl-skill"
                    cx={p.x}
                    cy={p.y}
                    r={0.21}
                    fill="none"
                    stroke="#2b241c"
                    strokeWidth={0.03}
                    strokeDasharray="0.06 0.05"
                  />
                );
              })}
            </g>
          )}

          {/* 上一步行动光圈 */}
          {(() => {
            const lastKey = props.lastActionKey && cells[props.lastActionKey] ? props.lastActionKey : null;
            if (!lastKey) return null;
            const lp = centerOf(lastKey);
            return (
              <circle
                className="hl-last"
                cx={lp.x}
                cy={lp.y}
                r={0.27}
                fill="none"
                stroke="rgba(255,250,235,0.95)"
                strokeWidth={0.042}
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
                r={0.25}
                fill="rgba(232,198,74,0.28)"
                stroke="#e8c64a"
                strokeWidth={0.055}
              />
            );
          })}

          {/* 悬停预览：当前玩家在此桥位的连接与端点 */}
          {hoveredSeg && hoveredNodePairs && (
            <g className="hover-preview" pointerEvents="none">
              <line
                x1={hoveredSeg[0]}
                y1={hoveredSeg[1]}
                x2={hoveredSeg[2]}
                y2={hoveredSeg[3]}
                stroke={activeColor}
                strokeWidth={0.2}
                strokeLinecap="round"
                opacity={0.75}
              />
              {hoveredNodePairs.map((pt, i) =>
                props.activeSide === 'red' ? (
                  <circle
                    key={`hp${i}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={0.1}
                    fill="none"
                    stroke={activeColor}
                    strokeWidth={0.05}
                  />
                ) : (
                  <rect
                    key={`hp${i}`}
                    x={pt.x - 0.1}
                    y={pt.y - 0.1}
                    width={0.2}
                    height={0.2}
                    fill="none"
                    stroke={activeColor}
                    strokeWidth={0.05}
                  />
                ),
              )}
            </g>
          )}

          {/* 边界标注 */}
          <g className="board-labels">
            <text x={size / 2} y={-MARGIN + 0.72} className="board-label-main" fontSize={0.34} textAnchor="middle">
              宋城
            </text>
            <text x={size / 2} y={-MARGIN + 1.16} className="board-label-sub" fontSize={0.145} textAnchor="middle">
              公输盘贯通至此即胜
            </text>
            <text x={size / 2} y={size + MARGIN - 0.72} className="board-label-main" fontSize={0.34} textAnchor="middle">
              楚营
            </text>
            <text x={size / 2} y={size + MARGIN - 1.16} className="board-label-sub" fontSize={0.145} textAnchor="middle">
              公输盘自此起攻 · 池尽则墨子胜
            </text>
            <text
              x={-MARGIN + 0.72}
              y={size / 2}
              className="board-label-main"
              fontSize={0.34}
              textAnchor="middle"
              transform={`rotate(90 ${-MARGIN + 0.72} ${size / 2})`}
            >
              西境
            </text>
            <text
              x={-MARGIN + 1.16}
              y={size / 2}
              className="board-label-sub"
              fontSize={0.145}
              textAnchor="middle"
              transform={`rotate(90 ${-MARGIN + 1.16} ${size / 2})`}
            >
              墨子自此起守
            </text>
            <text
              x={size + MARGIN - 0.5}
              y={size / 2}
              className="board-label-main"
              fontSize={0.34}
              textAnchor="middle"
              transform={`rotate(90 ${size + MARGIN - 0.5} ${size / 2})`}
            >
              东境
            </text>
            <text
              x={size + MARGIN - 1.0}
              y={size / 2}
              className="board-label-sub"
              fontSize={0.145}
              textAnchor="middle"
              transform={`rotate(90 ${size + MARGIN - 1.0} ${size / 2})`}
            >
              墨子跨出即胜
            </text>
          </g>

          {/* 点击热区（整格） */}
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
                  onPointerEnter={() => handleHover(k)}
                  onPointerLeave={() => handleHover(null)}
                />
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
