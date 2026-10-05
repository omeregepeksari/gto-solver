import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';

export function MainMenu() {
  const setScreen = useGameStore(s => s.setScreen);

  return (
    <div className="main-menu">
      <div className="menu-bg" />
      <motion.div
        className="menu-content"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="logo">
          <span className="logo-icon">♠</span>
          <h1>Poker Royale</h1>
          <p className="tagline">The premium Texas Hold'em experience</p>
        </div>

        <div className="menu-buttons">
          <button className="btn btn-primary btn-large" onClick={() => setScreen('analyzer')}>
            Hand Analyzer (GTO)
          </button>
          <button className="btn btn-secondary btn-large" onClick={() => setScreen('setup')}>
            Play Offline
          </button>
          <button className="btn btn-secondary btn-large" onClick={() => setScreen('stats')}>
            Statistics
          </button>
          <button className="btn btn-ghost btn-large" disabled title="Coming soon">
            Play Online — Coming Soon
          </button>
        </div>

        <div className="menu-features">
          <div className="feature">
            <span>🎯</span>
            <span>Pro-level AI opponents</span>
          </div>
          <div className="feature">
            <span>✨</span>
            <span>Premium animations</span>
          </div>
          <div className="feature">
            <span>📊</span>
            <span>Detailed statistics</span>
          </div>
          <div className="feature">
            <span>🎓</span>
            <span>Built-in tutorial</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
