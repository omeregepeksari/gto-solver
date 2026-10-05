import { motion, AnimatePresence } from 'framer-motion';
import type { Player as PlayerType } from '../types';
import { Card } from './Card';
import { getPersonalityColor } from '../ai/aiPlayer';

interface PlayerSeatProps {
  player: PlayerType;
  isActive: boolean;
  isDealer: boolean;
  showCards: boolean;
  position: { x: number; y: number };
  seatIndex: number;
}

export function PlayerSeat({ player, isActive, isDealer, showCards, position, seatIndex }: PlayerSeatProps) {
  const isHuman = player.isHuman;
  const personalityColor = player.personality ? getPersonalityColor(player.personality) : undefined;

  return (
    <motion.div
      className={`player-seat ${isActive ? 'active' : ''} ${player.isFolded ? 'folded' : ''} ${isHuman ? 'human' : ''}`}
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: player.isFolded ? 0.4 : 1, scale: 1 }}
      transition={{ delay: seatIndex * 0.1 }}
    >
      {isDealer && <div className="dealer-button">D</div>}

      <div className="player-cards">
        {player.holeCards.length > 0 ? (
          player.holeCards.map((card, i) => (
            <Card
              key={i}
              card={showCards || isHuman ? card : undefined}
              faceDown={!showCards && !isHuman}
              size="sm"
              delay={i * 0.15}
              className={i === 1 ? 'card-offset' : ''}
            />
          ))
        ) : (
          <>
            <div className="card-placeholder" />
            <div className="card-placeholder card-offset" />
          </>
        )}
      </div>

      <div className="player-info" style={personalityColor ? { borderColor: personalityColor } : {}}>
        <div className="player-name">
          {player.name}
          {player.isAllIn && <span className="all-in-badge">ALL IN</span>}
        </div>
        <div className="player-chips">${player.chips.toLocaleString()}</div>
        {player.currentBet > 0 && (
          <motion.div
            className="player-bet"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring' }}
          >
            ${player.currentBet}
          </motion.div>
        )}
        <AnimatePresence>
          {player.lastAction && (
            <motion.div
              className={`action-badge ${player.lastAction}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {player.lastAction.toUpperCase()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Seat positions for up to 6 players around an elliptical table
export function getSeatPositions(numPlayers: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [
    { x: 50, y: 88 },   // Human (bottom center)
    { x: 15, y: 65 },   // Left-bottom
    { x: 5, y: 35 },    // Left-top
    { x: 50, y: 8 },    // Top center
    { x: 95, y: 35 },   // Right-top
    { x: 85, y: 65 },   // Right-bottom
  ];
  return positions.slice(0, numPlayers);
}
