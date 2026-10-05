import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';

export function StatsPanel() {
  const stats = useGameStore(s => s.stats);
  const handHistory = useGameStore(s => s.handHistory);
  const setScreen = useGameStore(s => s.setScreen);
  const resetStats = useGameStore(s => s.resetStats);

  const winRate = stats.handsPlayed > 0
    ? ((stats.handsWon / stats.handsPlayed) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="stats-panel">
      <motion.div
        className="stats-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button className="btn-back" onClick={() => setScreen('menu')}>← Back</button>
        <h2>Your Statistics</h2>

        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.handsPlayed}</span>
            <span className="stat-label">Hands Played</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{winRate}%</span>
            <span className="stat-label">Win Rate</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">${stats.totalWinnings.toLocaleString()}</span>
            <span className="stat-label">Total Winnings</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">${stats.biggestPot.toLocaleString()}</span>
            <span className="stat-label">Biggest Pot</span>
          </div>
        </div>

        <div className="stats-actions-breakdown">
          <h3>Action Breakdown</h3>
          <div className="action-stats">
            <div className="action-stat">
              <span className="action-count">{stats.folds}</span> Folds
            </div>
            <div className="action-stat">
              <span className="action-count">{stats.calls}</span> Calls
            </div>
            <div className="action-stat">
              <span className="action-count">{stats.raises}</span> Raises
            </div>
            <div className="action-stat">
              <span className="action-count">{stats.allIns}</span> All-Ins
            </div>
          </div>
        </div>

        {handHistory.length > 0 && (
          <div className="hand-history">
            <h3>Recent Hands</h3>
            <div className="history-list">
              {handHistory.slice(0, 10).map((hand) => (
                <div key={hand.handNumber} className="history-item">
                  <span className="history-num">#{hand.handNumber}</span>
                  <span className="history-winner">{hand.winner}</span>
                  <span className="history-hand">{hand.winningHand}</span>
                  <span className="history-pot">${hand.pot}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-ghost" onClick={resetStats}>Reset Statistics</button>
      </motion.div>
    </div>
  );
}
