import { useState } from 'react';
import { useGame } from '../store';
import { BoardConfigFields, RECOMMENDED_POOL, SetupShell } from './SetupCommon';

export default function LocalSetupScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const startLocal = useGame((s) => s.startLocal);
  const [size, setSize] = useState(7);
  const [pool, setPool] = useState(RECOMMENDED_POOL[7] ?? 28);
  const [redName, setRedName] = useState('公输盘');
  const [blueName, setBlueName] = useState('墨子');

  const start = () => {
    startLocal(
      size,
      pool,
      redName.trim() || '公输盘',
      blueName.trim() || '墨子',
    );
  };

  return (
    <SetupShell title="本地双人对战" onBack={() => setScreen('menu')}>
      <div className="field">
        <span className="field-label">红方昵称（公输盘）</span>
        <input
          className="input"
          value={redName}
          maxLength={12}
          onChange={(e) => setRedName(e.target.value)}
          placeholder="公输盘"
        />
      </div>
      <div className="field">
        <span className="field-label">蓝方昵称（墨子）</span>
        <input
          className="input"
          value={blueName}
          maxLength={12}
          onChange={(e) => setBlueName(e.target.value)}
          placeholder="墨子"
        />
      </div>
      <BoardConfigFields size={size} pool={pool} onSize={setSize} onPool={setPool} />
      <button type="button" className="btn btn-primary btn-block" onClick={start}>
        开始对战
      </button>
    </SetupShell>
  );
}
