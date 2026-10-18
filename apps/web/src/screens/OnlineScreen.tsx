import { useEffect, useState } from 'react';
import { useGame } from '../store';
import { loadCreds } from '../net';
import { BoardConfigFields, RECOMMENDED_POOL } from './SetupCommon';

async function copyText(text: string, onOk: () => void, onFail: () => void) {
  try {
    await navigator.clipboard.writeText(text);
    onOk();
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      onOk();
    } catch {
      onFail();
    }
  }
}

export default function OnlineScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const settings = useGame((s) => s.settings);
  const session = useGame((s) => s.session);
  const onlinePrefill = useGame((s) => s.onlinePrefill);
  const clearPrefill = useGame((s) => s.clearPrefill);
  const hostRoom = useGame((s) => s.hostRoom);
  const joinRoom = useGame((s) => s.joinRoom);
  const sendReady = useGame((s) => s.sendReady);
  const rejoinRoom = useGame((s) => s.rejoinRoom);
  const leaveRoom = useGame((s) => s.leaveRoom);
  const pushToast = useGame((s) => s.pushToast);

  const [tab, setTab] = useState<'create' | 'join'>(onlinePrefill ? 'join' : 'create');
  const [size, setSize] = useState(7);
  const [pool, setPool] = useState(RECOMMENDED_POOL[7] ?? 28);
  const [name, setName] = useState(loadCreds()?.name ?? '公输盘');
  const [joinCode, setJoinCode] = useState(onlinePrefill ?? '');
  const [joinName, setJoinName] = useState(loadCreds()?.name ?? '墨子');

  useEffect(() => {
    if (onlinePrefill) {
      setTab('join');
      setJoinCode(onlinePrefill);
      clearPrefill();
    }
  }, [onlinePrefill, clearPrefill]);

  const isServer = !!settings.server;
  const badge = isServer ? '服务器对战' : '点对点直连（测试通道）';
  const code = session?.code ?? '';

  const doCreate = () => {
    if (isServer && !/^wss?:\/\//i.test(settings.server)) {
      pushToast('服务器地址需以 ws:// 或 wss:// 开头（可在设置中修改）。', 'error');
      return;
    }
    hostRoom(size, pool, name.trim() || '公输盘');
  };

  const doJoin = () => {
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) {
      pushToast('请输入房间码。', 'error');
      return;
    }
    joinRoom(c, joinName.trim() || '墨子');
  };

  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;

  // 已连接 → 显示房间面板
  if (session && session.mode === 'online') {
    const roleLabel = session.role === 'host' ? '房主 · 执红（公输盘）' : '客方 · 执蓝（墨子）';
    const connecting = !session.code;
    return (
      <div className="container">
        <div className="back-row">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              leaveRoom();
              pushToast('已离开房间。', 'info');
            }}
          >
            ← 离开房间
          </button>
        </div>
        <div className="panel center-panel setup-panel">
          <h2 className="screen-title">在线对战</h2>
          <div className="net-row">
            <span className="net-badge">{badge}</span>
            <span className="net-role">{roleLabel}</span>
          </div>

          {(session.reconnecting || session.connFailed) && (
            <div className="banner warn">
              {session.connFailed ? (
                <>
                  <span>
                    {session.transport === 'peer' && session.role === 'host'
                      ? '对手连接失败。请等待对手凭房间码重新加入。'
                      : '自动重连失败。可凭本机凭据重新加入。'}
                  </span>
                  {!(session.transport === 'peer' && session.role === 'host') && (
                    <button type="button" className="btn btn-sm" onClick={rejoinRoom}>
                      重新加入
                    </button>
                  )}
                </>
              ) : (
                <span>连接中断，正在自动重连…</span>
              )}
            </div>
          )}

          {connecting ? (
            <p className="status-text">正在建立连接…</p>
          ) : (
            <>
              <div className="room-box">
                <p className="field-label">房间码</p>
                <div className="room-code-row">
                  <span className="room-code">{code}</span>
                  <button
                    type="button"
                    className="btn btn-sm copy-btn"
                    onClick={() =>
                      copyText(
                        code,
                        () => pushToast('房间码已复制。', 'ok'),
                        () => pushToast('复制失败，请手动复制。', 'error'),
                      )
                    }
                  >
                    复制
                  </button>
                </div>
                <p className="hint">
                  分享链接：
                  <a className="share-link" href={shareUrl}>
                    {shareUrl}
                  </a>
                </p>
              </div>

              <div className="status-rows">
                <p className="status-row">
                  <span className="status-dot me" />你（{session.role === 'host' ? session.redName : session.blueName}）：
                  {session.localReady ? '已准备' : '未准备'}
                </p>
                <p className="status-row">
                  <span className={`status-dot${session.peerPresent ? ' ok' : ''}`} />
                  {session.peerPresent
                    ? `对手已加入${session.peerName && session.peerName !== '对手' && session.peerName !== '房主' ? `（${session.peerName}）` : ''}`
                    : '等待对手加入…'}
                  {session.role === 'host' && session.transport === 'peer'
                    ? `：${session.remoteReady ? '已准备' : '未准备'}`
                    : ''}
                </p>
                <p className="status-row muted">
                  {session.localReady
                    ? session.transport === 'ws'
                      ? '已发送准备，等待服务器开局…'
                      : session.role === 'host'
                        ? session.remoteReady
                          ? '双方就绪，开局中…'
                          : '等待对手准备…'
                        : '等待房主开始…'
                    : '双方都点击「准备」后自动开始。'}
                </p>
              </div>

              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={sendReady}
                  disabled={session.localReady}
                >
                  {session.localReady ? '已准备' : '准备'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    leaveRoom();
                    pushToast('已离开房间。', 'info');
                  }}
                >
                  离开房间
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="back-row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScreen('menu')}>
          ← 返回主菜单
        </button>
      </div>
      <div className="panel center-panel setup-panel">
        <h2 className="screen-title">在线对战</h2>
        <div className="net-row">
          <span className="net-badge">{badge}</span>
        </div>

        <div className="tabs" role="tablist">
          <button
            type="button"
            className={`tab${tab === 'create' ? ' active' : ''}`}
            onClick={() => setTab('create')}
            role="tab"
            aria-selected={tab === 'create'}
          >
            创建房间
          </button>
          <button
            type="button"
            className={`tab${tab === 'join' ? ' active' : ''}`}
            onClick={() => setTab('join')}
            role="tab"
            aria-selected={tab === 'join'}
          >
            加入房间
          </button>
        </div>

        {tab === 'create' ? (
          <div className="tab-body">
            <div className="field">
              <span className="field-label">你的昵称（房主 · 公输盘）</span>
              <input
                className="input"
                value={name}
                maxLength={12}
                onChange={(e) => setName(e.target.value)}
                placeholder="公输盘"
              />
            </div>
            <BoardConfigFields size={size} pool={pool} onSize={setSize} onPool={setPool} />
            <button type="button" className="btn btn-primary btn-block" onClick={doCreate}>
              创建房间
            </button>
          </div>
        ) : (
          <div className="tab-body">
            <div className="field">
              <span className="field-label">房间码</span>
              <input
                className="input mono room-input"
                value={joinCode}
                maxLength={6}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="如 A3K9QZ"
                spellCheck={false}
              />
              <p className="hint">从「创建房间」方获取 6 位房间码，或打开分享链接自动填入。</p>
            </div>
            <div className="field">
              <span className="field-label">你的昵称（客方 · 墨子）</span>
              <input
                className="input"
                value={joinName}
                maxLength={12}
                onChange={(e) => setJoinName(e.target.value)}
                placeholder="墨子"
              />
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={doJoin}>
              加入房间
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
