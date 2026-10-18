import { useState } from 'react';
import { useGame } from '../store';

export default function SettingsScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const settings = useGame((s) => s.settings);
  const updateSettings = useGame((s) => s.updateSettings);
  const pushToast = useGame((s) => s.pushToast);
  const [server, setServer] = useState(settings.server);

  return (
    <div className="container">
      <div className="back-row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScreen('menu')}>
          ← 返回主菜单
        </button>
      </div>
      <div className="panel center-panel setup-panel">
        <h2 className="screen-title">设置</h2>

        <div className="field">
          <span className="field-label">联机服务器地址</span>
          <input
            className="input mono"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            placeholder="wss://your-host"
            spellCheck={false}
          />
          <p className="hint">
            留空 = PeerJS 点对点直连（测试通道）；填写（如 wss://example.com）则通过服务器对战，权威状态由服务器维护。
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const v = server.trim();
              if (v && !/^wss?:\/\//i.test(v)) {
                pushToast('服务器地址需以 ws:// 或 wss:// 开头。', 'error');
                return;
              }
              updateSettings({ server: v });
              pushToast('设置已保存。', 'ok');
            }}
          >
            保存服务器地址
          </button>
        </div>

        <div className="field setting-row">
          <span className="field-label">动画效果</span>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.animOn}
              onChange={(e) => updateSettings({ animOn: e.target.checked })}
            />
            <span>开启动画（脉冲高亮 / 贯通闪亮）</span>
          </label>
          <p className="hint">关闭后所有动画与过渡立即停用；系统开启「减少动态效果」时同样自动停用。</p>
        </div>

        <div className="field">
          <span className="field-label">AI 默认难度</span>
          <div className="seg" role="group" aria-label="AI 默认难度">
            <button
              type="button"
              className={`seg-btn${settings.aiLevel === 'easy' ? ' active' : ''}`}
              onClick={() => updateSettings({ aiLevel: 'easy' })}
            >
              简单
            </button>
            <button
              type="button"
              className={`seg-btn${settings.aiLevel === 'medium' ? ' active' : ''}`}
              onClick={() => updateSettings({ aiLevel: 'medium' })}
            >
              中等
            </button>
          </div>
        </div>

        <p className="hint">所有设置自动保存到本机浏览器（localStorage）。</p>
      </div>
    </div>
  );
}
