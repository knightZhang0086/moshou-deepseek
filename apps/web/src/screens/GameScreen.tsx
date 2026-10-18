import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  blueEndpoints,
  bluePathInfo,
  buildNodeIndex,
  CARDS,
  convertTargets,
  makeSkillAction,
  otherSide,
  parseCellKey,
  playableSkills,
  redEndpoints,
  redPathInfo,
  remainingCards,
  SIDE_NAMES,
  skillTargets,
  type CardId,
  type MatchState,
  type Side,
} from '@moshou/engine';
import { useGame } from '../store';
import { cellLabel, winText, winTitle } from '../describe';
import Board from '../components/Board';
import TopBar from '../components/TopBar';
import ActionBar from '../components/ActionBar';
import SidePanel from '../components/SidePanel';
import Modal from '../components/Modal';
import CardLibrary from '../components/CardLibrary';
import RulesContent from '../components/RulesContent';

interface Selection {
  card: CardId;
  picked: string[];
}

function requiredPicks(card: CardId): number {
  switch (CARDS[card].kind) {
    case 'remove':
    case 'removeAndPlace':
    case 'convertBypassSturdy':
    case 'convertBypassAnchor':
    case 'convertBypassKo':
    case 'fortify':
      return 1;
    case 'placeTwo':
    case 'convertTwo':
    case 'moveOwn':
      return 2;
    default:
      return 0;
  }
}

/** 返回该牌不可用的中文原因；可用时返回 null */
function cardBlockReason(m: MatchState, card: CardId): string | null {
  const side = m.round.turn;
  const def = CARDS[card];
  if (!m.decks[side].includes(card)) return '本场未抽到该技能牌。';
  if (m.removed[side].includes(card)) return '该技能牌已被移除。';
  if (m.round.usedThisRound[side].includes(card)) return '本小局已使用过该技能牌。';
  if (m.round.pool < def.cost) return `木片不足（需 ${def.cost} 根）。`;
  if (def.kind === 'recycle' && m.round.discard < 2) return '弃置区不足两根木片。';
  if (!playableSkills(m).includes(card)) return '当前没有可用的目标。';
  return null;
}

function selectionHint(card: CardId, pickedCount: number): string {
  const def = CARDS[card];
  const first = pickedCount === 0;
  switch (def.kind) {
    case 'remove':
      return '点击一根敌方非稳固木片将其拆除';
    case 'removeAndPlace':
      return '点击一根敌方木片拆换（原位补放己方木片）';
    case 'placeTwo':
      return first ? '选择第 1 个空位' : '选择第 2 个空位';
    case 'convertTwo':
      return first ? '选择第 1 根要易械的敌方木片' : '选择第 2 根要易械的敌方木片';
    case 'moveOwn':
      return first ? '选择要移动的己方木片' : '选择目标空位';
    case 'fortify':
      return '选择一根己方木片加坚守标记';
    default:
      return '点击目标位置';
  }
}

/** 小局以“贯通”结束时：返回构成贯通线路的木片（引擎 pathCells，自动含东境出口列） */
function winningPathCells(m: MatchState, side: Side): string[] {
  const idx = buildNodeIndex(m.round.size);
  const info =
    side === 'red'
      ? redPathInfo(m.round.size, m.round.cells, idx)
      : bluePathInfo(m.round.size, m.round.cells, idx);
  return info.complete ? info.pathCells : [];
}

export default function GameScreen() {
  const session = useGame((s) => s.session);
  const settings = useGame((s) => s.settings);
  const humanAct = useGame((s) => s.humanAct);
  const pickRemoval = useGame((s) => s.pickRemoval);
  const rematch = useGame((s) => s.rematch);
  const exitGame = useGame((s) => s.exitGame);
  const scheduleAi = useGame((s) => s.scheduleAi);
  const clearAiTimer = useGame((s) => s.clearAiTimer);
  const rejoinRoom = useGame((s) => s.rejoinRoom);
  const pushToast = useGame((s) => s.pushToast);

  const [convertMode, setConvertMode] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  const [confirmSkill, setConfirmSkill] = useState<CardId | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [matchDismissed, setMatchDismissed] = useState(false);
  const [flash, setFlash] = useState<{
    cells: string[];
    by: 'path' | 'timeout';
    winner: Side;
    round: number;
  } | null>(null);
  const [resultVisible, setResultVisible] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI 调度：状态变化时尝试安排 AI 行动
  useEffect(() => {
    scheduleAi();
  }, [scheduleAi, session?.state]);

  useEffect(
    () => () => {
      clearAiTimer();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [clearAiTimer],
  );

  // ESC 取消选择 / 易械模式 / 确认框
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelection(null);
        setConvertMode(false);
        setConfirmSkill(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const st = session?.state ?? null;

  // 小局结束：先闪亮贯通线路，再弹窗
  const pr = st?.pendingRemoval ?? null;
  const roundNum = st?.round.roundNumber ?? 0;
  useEffect(() => {
    if (!pr || !st) {
      setResultVisible(false);
      setFlash(null);
      return;
    }
    if (flash && flash.round === roundNum) return;
    setSelection(null);
    setConvertMode(false);
    setConfirmSkill(null);
    const cells = pr.by === 'path' ? winningPathCells(st, pr.winner) : [];
    setFlash({ cells, by: pr.by, winner: pr.winner, round: roundNum });
    setResultVisible(false);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(
      () => setResultVisible(true),
      settings.animOn ? 1150 : 250,
    );
  }, [pr, st, roundNum, flash, settings.animOn]);

  const matchWinner = st?.matchWinner ?? null;
  useEffect(() => {
    if (!matchWinner) setMatchDismissed(false);
  }, [matchWinner]);

  // ---- 权限与派生值（纯计算） ----
  const isOnline = session?.mode === 'online';
  const mySide: Side | null = session
    ? isOnline
      ? session.role === 'host'
        ? 'red'
        : 'blue'
      : session.mode === 'ai' && session.aiSide
        ? otherSide(session.aiSide)
        : st
          ? st.round.turn
          : null
    : null;
  const isMyTurn =
    !!st && !st.matchWinner && !st.pendingRemoval && !!mySide && st.round.turn === mySide;
  const aiBusy =
    session?.mode === 'ai' &&
    !!session.aiSide &&
    !!st &&
    !st.matchWinner &&
    ((!st.pendingRemoval && st.round.turn === session.aiSide) ||
      (!!st.pendingRemoval && st.pendingRemoval.loser === session.aiSide));
  const canAct = !!st && isMyTurn && !aiBusy;

  const skillTargetKeys = useMemo(
    () => (st && selection ? skillTargets(st, selection.card, selection.picked) : []),
    [st, selection],
  );

  const convertTargetKeys = useMemo(
    () => (st && convertMode && canAct ? convertTargets(st.round, st.round.turn) : []),
    [st, convertMode, canAct],
  );

  const convertBlockedReason = useMemo(() => {
    if (!st || !canAct) return null;
    if (st.round.lastMoveConvert[st.round.turn]) return '禁连：上次行动已易械';
    if (convertTargets(st.round, st.round.turn).length === 0) return '无可易械目标';
    return null;
  }, [st, canAct]);

  const playable = useMemo(() => (st && canAct ? playableSkills(st) : []), [st, canAct]);

  /** 己方当前最短推进路线（教学提示：空位画虚框） */
  const myPathKeys = useMemo(() => {
    if (!st || !canAct || st.pendingRemoval || st.matchWinner) return [];
    const idx = buildNodeIndex(st.round.size);
    const side = st.round.turn;
    const info =
      side === 'red'
        ? redPathInfo(st.round.size, st.round.cells, idx)
        : bluePathInfo(st.round.size, st.round.cells, idx);
    return Number.isFinite(info.dist) ? info.pathCells : [];
  }, [st, canAct]);

  /** 悬停桥位的中文说明 */
  const hoverText = useMemo(() => {
    if (!st || !hoverSlot) return null;
    const c = parseCellKey(hoverSlot);
    const [a1, a2] = redEndpoints(c);
    const [b1, b2] = blueEndpoints(c);
    const occ = st.round.cells[hoverSlot];
    const dirRed = c.d === 'H' ? '横向' : '竖向';
    const dirBlue = c.d === 'H' ? '竖向' : '横向';
    return `桥位 ${cellLabel(hoverSlot)}：红面连顶点 (${a1.x},${a1.y})–(${a2.x},${a2.y})（${dirRed}）；蓝面连格心 (${b1.x},${b1.y})–(${b2.x},${b2.y})（${dirBlue}）${occ ? ' · 此位已有木片' : ''}`;
  }, [st, hoverSlot]);

  const lastActionKey = useMemo(() => {
    if (!st) return null;
    const last = st.round.log[st.round.log.length - 1];
    if (!last) return null;
    const a = last.action;
    if (a.kind === 'place' || a.kind === 'convert') return a.cell;
    const p = a.params;
    if ('cell' in p && p.cell) return p.cell;
    if ('cells' in p && p.cells && p.cells.length > 0) return p.cells[p.cells.length - 1]!;
    if ('to' in p && p.to) return p.to;
    return null;
  }, [st]);

  const onCellClick = useCallback(
    (key: string) => {
      if (!canAct || !st) return;
      if (selection) {
        const allowed = skillTargets(st, selection.card, selection.picked);
        if (!allowed.includes(key)) return;
        const next = [...selection.picked, key];
        const need = requiredPicks(selection.card);
        if (next.length >= need) {
          const action = makeSkillAction(st, selection.card, next);
          setSelection(null);
          humanAct(action);
        } else {
          setSelection({ card: selection.card, picked: next });
        }
        return;
      }
      if (convertMode) {
        humanAct({ kind: 'convert', side: st.round.turn, cell: key });
        return;
      }
      humanAct({ kind: 'place', side: st.round.turn, cell: key });
    },
    [canAct, selection, convertMode, st, humanAct],
  );

  const onCardClick = useCallback(
    (card: CardId) => {
      if (!canAct || !st) return;
      const reason = cardBlockReason(st, card);
      if (reason) {
        pushToast(reason, 'error');
        return;
      }
      const def = CARDS[card];
      if (def.kind === 'exhaust' || def.kind === 'recycle') {
        setConfirmSkill(card);
        return;
      }
      setSelection({ card, picked: [] });
      setConvertMode(false);
    },
    [canAct, st, pushToast],
  );

  // 等待开局（在线开局前不进入本屏；此处防御状态被重置的情况）
  if (!session || !st) {
    return (
      <div className="container">
        <div className="panel center-panel">
          <h2 className="screen-title">等待开局…</h2>
          <p className="screen-sub">正在等待对手就绪或重新连接。</p>
          {session?.mode === 'online' && session.connFailed && (
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => rejoinRoom()}>
                重新加入
              </button>
            </div>
          )}
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => exitGame()}>
              返回主菜单
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pickerCards = pr ? remainingCards(st, pr.winner) : [];
  const iAmLoser = !!pr && !!mySide && pr.loser === mySide;
  const showMatchModal = !!matchWinner && !matchDismissed;

  const boardMode: 'place' | 'convert' | 'skill' = selection
    ? 'skill'
    : convertMode
      ? 'convert'
      : 'place';

  const libContext = {
    decks: st.decks,
    removed: st.removed,
    used: st.round.usedThisRound,
  };

  return (
    <div className={`game-screen ${settings.animOn ? 'anim-on' : 'anim-off'}`}>
      <TopBar
        state={st}
        redName={session.redName}
        blueName={session.blueName}
        aiBusy={aiBusy}
        mode={session.mode}
        code={session.code}
      />

      {isOnline && (session.reconnecting || session.connFailed) && (
        <div className="banner warn">
          {session.connFailed ? (
            <>
              <span>
                {session.transport === 'peer' && session.role === 'host'
                  ? '对手连接失败，等待对手重新加入。'
                  : '连接失败，可尝试重新加入。'}
              </span>
              {!(session.transport === 'peer' && session.role === 'host') && (
                <button type="button" className="btn btn-sm" onClick={rejoinRoom}>
                  重新加入
                </button>
              )}
            </>
          ) : (
            <span>
              {session.role === 'host' && session.transport === 'peer' && !session.peerPresent
                ? '对手已断开，正在等待重连…'
                : '连接中断，正在自动重连…'}
            </span>
          )}
        </div>
      )}

      <div className="game-main">
        <div className="board-column">
          <Board
            state={st}
            activeSide={st.round.turn}
            canAct={canAct}
            mode={boardMode}
            convertTargetKeys={convertTargetKeys}
            skillTargetKeys={skillTargetKeys}
            pickedKeys={selection?.picked ?? []}
            myPathKeys={myPathKeys}
            lastActionKey={lastActionKey}
            flashKeys={flash ? flash.cells : []}
            onCellClick={onCellClick}
            onHoverSlot={setHoverSlot}
            animOn={settings.animOn}
          />

          <div className="board-legend">
            <span>
              <i className="lg-red-node" />
              红圈 · 公输盘节点（方格顶点）
            </span>
            <span>
              <i className="lg-blue-node" />
              蓝方块 · 墨子节点（格心）
            </span>
            <span>
              <i className="lg-slot" />
              菱形 · 桥位（可放木片）
            </span>
            <span>
              <i className="lg-ghost" />
              虚条 · 你在此放置的朝向
            </span>
          </div>

          {hoverText && !selection && (
            <p className="selection-hint hover-hint">{hoverText}</p>
          )}

          {selection && (
            <p className="selection-hint">
              使用 <b>{CARDS[selection.card].name}</b>：
              {selectionHint(selection.card, selection.picked.length)}
            </p>
          )}

          {!selection && !hoverText && canAct && (
            <p className="selection-hint">
              放置：点击任意菱形桥位。<b>木片朝向由桥位决定</b>（红方横竖皆有、蓝方亦然），
              空位上的虚条即你在此放置时的实际朝向；悬停可查看该桥位连接的两个节点。
            </p>
          )}

          {!selection && !hoverText && !canAct && (
            <p className="selection-hint">
              等待对方行动。可随时用「规则」「牌库」查看，不中断对局。
            </p>
          )}

          <button
            type="button"
            className="btn btn-ghost btn-sm panel-toggle"
            onClick={() => setShowPanel((v) => !v)}
          >
            {showPanel ? '收起对战信息 ▲' : '对战信息 ▼'}
          </button>

          <ActionBar
            turn={st.round.turn}
            deck={st.decks[st.round.turn]}
            removed={st.removed[st.round.turn]}
            used={st.round.usedThisRound[st.round.turn]}
            canAct={canAct}
            convertMode={convertMode}
            convertBlockedReason={convertBlockedReason}
            selectionCard={selection?.card ?? null}
            playable={playable}
            onSelectPlace={() => {
              setSelection(null);
              setConvertMode(false);
            }}
            onToggleConvert={() => {
              if (convertBlockedReason) {
                pushToast(convertBlockedReason, 'error');
                return;
              }
              setSelection(null);
              setConvertMode((v) => !v);
            }}
            onSelectCard={onCardClick}
            onCancel={() => {
              setSelection(null);
              setConvertMode(false);
            }}
          />
        </div>

        <div className={`panel-wrap${showPanel ? ' open' : ''}`}>
          <SidePanel
            state={st}
            redName={session.redName}
            blueName={session.blueName}
            mode={session.mode}
            aiSide={session.aiSide}
            onRules={() => setShowRules(true)}
            onCards={() => setShowCards(true)}
            onExit={() => setShowExit(true)}
          />
        </div>
      </div>

      {/* 小局结束弹窗 + 弃牌选择 */}
      {pr && resultVisible && (
        <Modal title="小局结束">
          <h3 className={`result-title side-${pr.winner}`}>{winTitle(pr.winner, pr.by)}</h3>
          <p className="result-sub">{winText(pr.winner, pr.by)}</p>
          {iAmLoser ? (
            <div className="removal-picker">
              <p className="removal-desc">
                请从 {SIDE_NAMES[pr.winner]} 剩余的技能牌中选择一张，本场永久移除：
              </p>
              {aiBusy ? (
                <p className="result-wait">AI 正在选择弃牌…</p>
              ) : (
                <>
                  <div className="removal-cards">
                    {pickerCards.map((c) => (
                      <CardPickerCard key={c} card={c} onPick={() => pickRemoval(c)} />
                    ))}
                  </div>
                  {pickerCards.length === 1 && (
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => pickRemoval(pickerCards[0]!)}
                      >
                        确认移除（仅剩此牌）
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <p className="result-wait">
              {session.mode === 'ai' && aiBusy
                ? 'AI 正在选择弃牌…'
                : `等待 ${SIDE_NAMES[pr.loser]} 选择弃牌…`}
            </p>
          )}
        </Modal>
      )}

      {/* 整场结束弹窗 */}
      {showMatchModal && matchWinner && (
        <Modal title="对局结束">
          <h3 className={`result-title side-${matchWinner}`}>
            {SIDE_NAMES[matchWinner]} 赢得本场对决
          </h3>
          <p className="result-sub">
            最终比分：{session.redName} {st.wins.red} : {st.wins.blue} {session.blueName}
          </p>
          <p className="result-sub">
            小局战绩：
            {st.history.map((h) => `第${h.roundNumber}局${SIDE_NAMES[h.winner]}胜`).join(' · ') ||
              '暂无'}
          </p>
          <div className="modal-actions">
            {session.mode !== 'online' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setMatchDismissed(true);
                  rematch();
                }}
              >
                再来一局
              </button>
            )}
            <button type="button" className="btn" onClick={() => exitGame()}>
              回主菜单
            </button>
          </div>
          {isOnline && (
            <p className="modal-note">在线对局暂不支持再来一局，请回到在线对战重新创建房间。</p>
          )}
        </Modal>
      )}

      {/* 规则弹窗（不中断对局） */}
      {showRules && (
        <Modal title="游戏规则" onClose={() => setShowRules(false)} wide>
          <RulesContent />
        </Modal>
      )}

      {/* 牌库弹窗 */}
      {showCards && (
        <Modal title="九攻九拒牌库" onClose={() => setShowCards(false)} wide>
          <CardLibrary context={libContext} />
        </Modal>
      )}

      {/* 技能确认框（疲敌 / 积备 / 距堙） */}
      {confirmSkill && (
        <Modal title={`使用「${CARDS[confirmSkill].name}」`} onClose={() => setConfirmSkill(null)}>
          <p>{CARDS[confirmSkill].long}</p>
          <p className="modal-note">
            {CARDS[confirmSkill].kind === 'exhaust'
              ? '本次行动消耗 2 根公共木片，全部进入弃置区。'
              : '本次行动消耗 1 根公共木片，并从弃置区取回 2 根（池净增 1 根）。'}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmSkill(null)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const card = confirmSkill;
                setConfirmSkill(null);
                humanAct(makeSkillAction(st, card, []));
              }}
            >
              执行
            </button>
          </div>
        </Modal>
      )}

      {/* 退出确认 */}
      {showExit && (
        <Modal title="认输 · 退出" onClose={() => setShowExit(false)}>
          <p>确定要退出本局吗？{isOnline && '在线对局中退出将被视为认输，本机重连凭据将清除。'}</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowExit(false)}>
              继续对局
            </button>
            <button type="button" className="btn btn-danger" onClick={() => exitGame()}>
              确认退出
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CardPickerCard({ card, onPick }: { card: CardId; onPick: () => void }) {
  const def = CARDS[card];
  return (
    <button type="button" className={`card-tile side-${def.side} clickable picker`} onClick={onPick}>
      <span className="card-cost">
        {Array.from({ length: def.cost }, (_, i) => (
          <span key={i} className="pip" />
        ))}
      </span>
      <span className="card-name">{def.name}</span>
    </button>
  );
}
