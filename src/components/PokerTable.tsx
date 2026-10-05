import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { PlayerSeat, getSeatPositions } from './PlayerSeat';
import { CommunityCards, PotDisplay } from './CommunityCards';
import { ActionBar } from './ActionBar';
import { TutorialOverlay } from './TutorialOverlay';
import { getHandHint } from '../engine/handEvaluator';

export function PokerTable() {
  const gameState = useGameStore(s => s.gameState);
  const settings = useGameStore(s => s.settings);
  const raiseAmount = useGameStore(s => s.raiseAmount);
  const isProcessingAI = useGameStore(s => s.isProcessingAI);
  const playerAction = useGameStore(s => s.playerAction);
  const setRaiseAmount = useGameStore(s => s.setRaiseAmount);
  const dealHand = useGameStore(s => s.dealHand);
  const nextHand = useGameStore(s => s.nextHand);
  const setScreen = useGameStore(s => s.setScreen);
  const toggleTutorial = useGameStore(s => s.toggleTutorial);

  const human = gameState.players.find(p => p.isHuman);
  const showCards = gameState.phase === 'showdown' || gameState.phase === 'hand_complete';
  const positions = getSeatPositions(gameState.players.length);

  const hint = settings.showHints && human && human.holeCards.length > 0
    ? getHandHint(human.holeCards, gameState.communityCards)
    : undefined;

  const phaseLabel: Record<string, string> = {
    waiting: 'Ready to Deal',
    preflop: 'Pre-Flop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River',
    showdown: 'Showdown',
    hand_complete: 'Hand Complete',
  };

  return (
    <div className="poker-table-container">
      <div className="game-header">
        <button className="btn-icon" onClick={() => setScreen('menu')}>✕</button>
        <div className="game-info">
          <span className="phase-label">{phaseLabel[gameState.phase]}</span>
          <span className="hand-number">Hand #{gameState.handNumber}</span>
        </div>
        <div className="header-actions">
          <button className="btn-icon" onClick={toggleTutorial} title="Tutorial">?</button>
          <button className="btn-icon" onClick={() => setScreen('stats')} title="Stats">📊</button>
        </div>
      </div>

      <div className="table-area">
        <div className="poker-table">
          <div className="table-felt">
            <PotDisplay amount={gameState.pot} />
            <CommunityCards cards={gameState.communityCards} />

            <AnimatePresence>
              {gameState.message && (
                <motion.div
                  className="game-message"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  key={gameState.message}
                >
                  {gameState.message}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {gameState.players.map((player, i) => (
            <PlayerSeat
              key={player.id}
              player={player}
              isActive={gameState.activePlayerIndex === i}
              isDealer={gameState.dealerIndex === i}
              showCards={showCards}
              position={positions[i] ?? { x: 50, y: 50 }}
              seatIndex={i}
            />
          ))}
        </div>
      </div>

      {gameState.phase === 'waiting' && (
        <div className="deal-prompt">
          <button className="btn btn-primary btn-large" onClick={dealHand}>
            Deal Cards
          </button>
        </div>
      )}

      {gameState.phase === 'hand_complete' && (
        <motion.div
          className="hand-complete-prompt"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button className="btn btn-primary btn-large" onClick={nextHand}>
            Next Hand
          </button>
        </motion.div>
      )}

      <ActionBar
        gameState={gameState}
        raiseAmount={raiseAmount}
        onAction={playerAction}
        onRaiseChange={setRaiseAmount}
        disabled={isProcessingAI}
        hint={hint}
      />

      <TutorialOverlay />
    </div>
  );
}
