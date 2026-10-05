import { motion } from 'framer-motion';
import type { PlayerAction } from '../types';
import { getCallAmount, getMinRaiseAmount, getMaxRaiseAmount, getValidActions } from '../engine/gameEngine';
import type { GameState } from '../types';

interface ActionBarProps {
  gameState: GameState;
  raiseAmount: number;
  onAction: (action: PlayerAction, amount?: number) => void;
  onRaiseChange: (amount: number) => void;
  disabled: boolean;
  hint?: string;
}

export function ActionBar({
  gameState,
  raiseAmount,
  onAction,
  onRaiseChange,
  disabled,
  hint,
}: ActionBarProps) {
  const human = gameState.players.find(p => p.isHuman);
  if (!human || gameState.phase === 'hand_complete' || gameState.phase === 'waiting') return null;

  const isHumanTurn = gameState.players[gameState.activePlayerIndex]?.isHuman;
  const validActions = getValidActions(gameState, 'human');
  const callAmount = getCallAmount(gameState, 'human');
  const minRaise = getMinRaiseAmount(gameState);
  const maxRaise = getMaxRaiseAmount(gameState, 'human');

  if (!isHumanTurn) {
    return (
      <div className="action-bar waiting">
        <div className="waiting-indicator">
          <div className="pulse-dot" />
          Waiting for opponents...
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="action-bar"
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
    >
      {hint && (
        <div className="hand-hint">
          <span className="hint-icon">💡</span> {hint}
        </div>
      )}

      <div className="action-buttons">
        {validActions.includes('fold') && (
          <button className="btn btn-fold" onClick={() => onAction('fold')} disabled={disabled}>
            Fold
          </button>
        )}

        {validActions.includes('check') && (
          <button className="btn btn-check" onClick={() => onAction('check')} disabled={disabled}>
            Check
          </button>
        )}

        {validActions.includes('call') && (
          <button className="btn btn-call" onClick={() => onAction('call')} disabled={disabled}>
            Call {callAmount > 0 ? `$${callAmount}` : ''}
          </button>
        )}

        {validActions.includes('raise') && (
          <div className="raise-control">
            <input
              type="range"
              min={minRaise}
              max={maxRaise}
              value={Math.min(Math.max(raiseAmount, minRaise), maxRaise)}
              onChange={(e) => onRaiseChange(Number(e.target.value))}
              className="raise-slider"
            />
            <button
              className="btn btn-raise"
              onClick={() => onAction('raise', raiseAmount)}
              disabled={disabled}
            >
              Raise ${raiseAmount}
            </button>
          </div>
        )}

        {validActions.includes('all_in') && (
          <button className="btn btn-allin" onClick={() => onAction('all_in')} disabled={disabled}>
            All In
          </button>
        )}
      </div>
    </motion.div>
  );
}
