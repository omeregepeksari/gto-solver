import { useGameStore } from './store/gameStore';
import { MainMenu } from './components/MainMenu';
import { GameSetup } from './components/GameSetup';
import { PokerTable } from './components/PokerTable';
import { StatsPanel } from './components/StatsPanel';
import { HandAnalyzer } from './analyzer/components/HandAnalyzer';

function App() {
  const screen = useGameStore(s => s.screen);

  return (
    <div className="app">
      {screen === 'menu' && <MainMenu />}
      {screen === 'setup' && <GameSetup />}
      {screen === 'game' && <PokerTable />}
      {screen === 'stats' && <StatsPanel />}
      {screen === 'analyzer' && <HandAnalyzer />}
    </div>
  );
}

export default App;
