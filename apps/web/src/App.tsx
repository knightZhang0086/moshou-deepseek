import { useEffect } from 'react';
import { useGame } from './store';
import MenuScreen from './screens/MenuScreen';
import LocalSetupScreen from './screens/LocalSetupScreen';
import AiSetupScreen from './screens/AiSetupScreen';
import OnlineScreen from './screens/OnlineScreen';
import RulesScreen from './screens/RulesScreen';
import CardsScreen from './screens/CardsScreen';
import SettingsScreen from './screens/SettingsScreen';
import GameScreen from './screens/GameScreen';
import Toasts from './components/Toasts';

export default function App() {
  const screen = useGame((s) => s.screen);
  const prefillRoom = useGame((s) => s.prefillRoom);

  // URL ?room=CODE → 在线页并自动填入房间码
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('room');
    if (code && code.trim()) prefillRoom(code.trim().toUpperCase());
  }, [prefillRoom]);

  return (
    <div className="app">
      {screen === 'menu' && <MenuScreen />}
      {screen === 'localSetup' && <LocalSetupScreen />}
      {screen === 'aiSetup' && <AiSetupScreen />}
      {screen === 'online' && <OnlineScreen />}
      {screen === 'rules' && <RulesScreen />}
      {screen === 'cards' && <CardsScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'game' && <GameScreen />}
      <Toasts />
    </div>
  );
}
