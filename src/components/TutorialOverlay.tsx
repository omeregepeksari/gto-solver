import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';

const TUTORIAL_STEPS = [
  {
    title: 'Welcome to Texas Hold\'em!',
    content: 'Each player gets 2 private cards (hole cards). Combine them with 5 community cards to make the best 5-card hand.',
  },
  {
    title: 'Betting Rounds',
    content: 'There are 4 betting rounds: Pre-flop, Flop (3 cards), Turn (1 card), and River (1 card). Bet, call, raise, or fold on your turn.',
  },
  {
    title: 'Hand Rankings',
    content: 'Royal Flush > Straight Flush > Four of a Kind > Full House > Flush > Straight > Three of a Kind > Two Pair > One Pair > High Card',
  },
  {
    title: 'Your Opponents',
    content: 'Each AI has a unique personality: TAG (solid pro), LAG (aggressive), Rock (tight), Maniac (wild), and Calling Station (never folds).',
  },
  {
    title: 'Tips',
    content: 'Watch the hint bar for hand strength advice. Use position to your advantage — acting last gives you more information. Good luck!',
  },
];

export function TutorialOverlay() {
  const showTutorial = useGameStore(s => s.showTutorial);
  const tutorialStep = useGameStore(s => s.tutorialStep);
  const nextStep = useGameStore(s => s.nextTutorialStep);
  const toggle = useGameStore(s => s.toggleTutorial);

  if (!showTutorial) return null;

  const step = TUTORIAL_STEPS[Math.min(tutorialStep, TUTORIAL_STEPS.length - 1)];
  const isLast = tutorialStep >= TUTORIAL_STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        className="tutorial-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="tutorial-card"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          key={tutorialStep}
        >
          <div className="tutorial-progress">
            {TUTORIAL_STEPS.map((_, i) => (
              <div key={i} className={`progress-dot ${i <= tutorialStep ? 'active' : ''}`} />
            ))}
          </div>
          <h3>{step.title}</h3>
          <p>{step.content}</p>
          <div className="tutorial-actions">
            <button className="btn btn-ghost" onClick={toggle}>Skip</button>
            <button className="btn btn-primary" onClick={isLast ? toggle : nextStep}>
              {isLast ? 'Got it!' : 'Next →'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
