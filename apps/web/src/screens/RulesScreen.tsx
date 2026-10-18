import { useGame } from '../store';
import RulesContent from '../components/RulesContent';

export default function RulesScreen() {
  const setScreen = useGame((s) => s.setScreen);
  return (
    <div className="container">
      <div className="back-row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScreen('menu')}>
          ← 返回主菜单
        </button>
      </div>
      <div className="panel rules-panel">
        <h2 className="screen-title">游戏规则</h2>
        <RulesContent />
      </div>
    </div>
  );
}
