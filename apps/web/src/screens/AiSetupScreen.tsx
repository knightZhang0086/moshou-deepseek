import { useState } from 'react';
import { type Side } from '@moshou/engine';
import { useGame } from '../store';
import { BoardConfigFields, RECOMMENDED_POOL, SetupShell } from './SetupCommon';

export default function AiSetupScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const settings = useGame((s) => s.settings);
  const startAi = useGame((s) => s.startAi);
  const [size, setSize] = useState(7);
  const [pool, setPool] = useState(RECOMMENDED_POOL[7] ?? 28);
  const [mySide, setMySide] = useState<Side>('red');
  const [aiLevel, setAiLevel] = useState<'easy' | 'medium'>(settings.aiLevel);
  const [myName, setMyName] = useState('公输盘');

  const start = () => {
    const name = myName.trim() || (mySide === 'red' ? '公输盘' : '墨子');
    startAi(size, pool, mySide, aiLevel, name);
  };

  return (
    <SetupShell title="人机对战" onBack={() => setScreen('menu')}>
      <div className="field">
        <span className="field-label">己方阵营</span>
        <div className="seg" role="group" aria-label="己方阵营">
          <button
            type="button"
            className={`seg-btn red-tint${mySide === 'red' ? ' active' : ''}`}
            onClick={() => {
              setMySide('red');
              setMyName((n) => (n === '墨子' ? '公输盘' : n));
            }}
          >
            公输盘（攻）
          </button>
          <button
            type="button"
            className={`seg-btn blue-tint${mySide === 'blue' ? ' active' : ''}`}
            onClick={() => {
              setMySide('blue');
              setMyName((n) => (n === '公输盘' ? '墨子' : n));
            }}
          >
            墨子（守）
          </button>
        </div>
        <p className="hint">对手阵营由 AI 执掌。</p>
      </div>
      <div className="field">
        <span className="field-label">AI 难度</span>
        <div className="seg" role="group" aria-label="AI 难度">
          <button
            type="button"
            className={`seg-btn${aiLevel === 'easy' ? ' active' : ''}`}
            onClick={() => setAiLevel('easy')}
          >
            简单
          </button>
          <button
            type="button"
            className={`seg-btn${aiLevel === 'medium' ? ' active' : ''}`}
            onClick={() => setAiLevel('medium')}
          >
            中等
          </button>
        </div>
        <p className="hint">中等难度会模拟对手一步应对，思考更久。</p>
      </div>
      <div className="field">
        <span className="field-label">你的昵称</span>
        <input
          className="input"
          value={myName}
          maxLength={12}
          onChange={(e) => setMyName(e.target.value)}
          placeholder={mySide === 'red' ? '公输盘' : '墨子'}
        />
      </div>
      <BoardConfigFields size={size} pool={pool} onSize={setSize} onPool={setPool} />
      <button type="button" className="btn btn-primary btn-block" onClick={start}>
        开始对战
      </button>
    </SetupShell>
  );
}
