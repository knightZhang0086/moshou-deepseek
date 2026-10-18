import { useGame } from '../store';
import CardLibrary from '../components/CardLibrary';

export default function CardsScreen() {
  const setScreen = useGame((s) => s.setScreen);
  return (
    <div className="container">
      <div className="back-row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScreen('menu')}>
          ← 返回主菜单
        </button>
      </div>
      <div className="panel rules-panel">
        <h2 className="screen-title">九攻九拒牌库</h2>
        <p className="screen-sub">公输盘九设攻城之机变，子墨子九距之。双方各九张，每场各抽五张公开使用。</p>
        <CardLibrary />
      </div>
    </div>
  );
}
