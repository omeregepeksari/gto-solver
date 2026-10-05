import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import type { GameSettings } from '../types';

export function GameSetup() {
  const settings = useGameStore(s => s.settings);
  const updateSettings = useGameStore(s => s.updateSettings);
  const startGame = useGameStore(s => s.startGame);
  const setScreen = useGameStore(s => s.setScreen);

  const update = (key: keyof GameSettings, value: number | boolean | string) => {
    updateSettings({ [key]: value });
  };

  return (
    <div className="game-setup">
      <motion.div
        className="setup-panel"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <button className="btn-back" onClick={() => setScreen('menu')}>← Back</button>
        <h2>Game Setup</h2>

        <div className="setup-group">
          <label>Opponents</label>
          <div className="option-row">
            {[2, 3, 4, 5].map(n => (
              <button
                key={n}
                className={`option-btn ${settings.numOpponents === n ? 'active' : ''}`}
                onClick={() => update('numOpponents', n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-group">
          <label>Starting Chips</label>
          <div className="option-row">
            {[500, 1000, 2000, 5000].map(n => (
              <button
                key={n}
                className={`option-btn ${settings.startingChips === n ? 'active' : ''}`}
                onClick={() => update('startingChips', n)}
              >
                ${n}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-group">
          <label>Blinds</label>
          <div className="option-row">
            {[
              { sb: 5, bb: 10, label: '$5/$10' },
              { sb: 10, bb: 20, label: '$10/$20' },
              { sb: 25, bb: 50, label: '$25/$50' },
            ].map(({ sb, bb, label }) => (
              <button
                key={label}
                className={`option-btn ${settings.smallBlind === sb ? 'active' : ''}`}
                onClick={() => { update('smallBlind', sb); update('bigBlind', bb); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-group">
          <label>Game Speed</label>
          <div className="option-row">
            {(['slow', 'normal', 'fast', 'turbo'] as const).map(speed => (
              <button
                key={speed}
                className={`option-btn ${settings.speed === speed ? 'active' : ''}`}
                onClick={() => update('speed', speed)}
              >
                {speed.charAt(0).toUpperCase() + speed.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-group toggles">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.showHints}
              onChange={(e) => update('showHints', e.target.checked)}
            />
            Show hand strength hints
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.tutorialMode}
              onChange={(e) => update('tutorialMode', e.target.checked)}
            />
            Enable tutorial mode
          </label>
        </div>

        <button className="btn btn-primary btn-large" onClick={startGame}>
          Start Game
        </button>
      </motion.div>
    </div>
  );
}
