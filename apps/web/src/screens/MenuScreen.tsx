import { useGame } from '../store';
import pkg from '../../package.json';

export default function MenuScreen() {
  const setScreen = useGame((s) => s.setScreen);
  return (
    <div className="container menu">
      <div className="menu-head">
        <h1 className="menu-title">墨守成规</h1>
        <p className="menu-sub">九攻九拒 · 双人连线策略桌游</p>
        <div className="menu-rule" aria-hidden="true">
          <span className="menu-rule-line" />
          <span className="menu-rule-dot">◆</span>
          <span className="menu-rule-line" />
        </div>
        <p className="menu-epigraph">公输盘之攻械尽，子墨子之守圉有余。</p>
      </div>
      <nav className="menu-buttons">
        <button type="button" className="menu-btn" onClick={() => setScreen('localSetup')}>
          <span className="btn-glyph">弈</span>本地双人对战
        </button>
        <button type="button" className="menu-btn" onClick={() => setScreen('aiSetup')}>
          <span className="btn-glyph">机</span>人机对战
        </button>
        <button type="button" className="menu-btn" onClick={() => setScreen('online')}>
          <span className="btn-glyph">连</span>在线对战
        </button>
        <button type="button" className="menu-btn" onClick={() => setScreen('rules')}>
          <span className="btn-glyph">规</span>游戏规则
        </button>
        <button type="button" className="menu-btn" onClick={() => setScreen('cards')}>
          <span className="btn-glyph">牌</span>九攻九拒牌库
        </button>
        <button type="button" className="menu-btn" onClick={() => setScreen('settings')}>
          <span className="btn-glyph">设</span>设置
        </button>
      </nav>
      <footer className="menu-footer">
        <span className="seal" aria-hidden="true">
          守
        </span>
        <p>
          墨守成规 v{pkg.version} · 取材《墨子·公输》 · 本地双人 / 人机 / 在线对战
        </p>
      </footer>
    </div>
  );
}
