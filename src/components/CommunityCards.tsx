import { motion } from 'framer-motion';
import type { Card as CardType } from '../types';
import { Card } from './Card';

interface CommunityCardsProps {
  cards: CardType[];
}

export function CommunityCards({ cards }: CommunityCardsProps) {
  const slots = 5;

  return (
    <div className="community-cards">
      {Array.from({ length: slots }).map((_, i) => (
        <div key={i} className="community-slot">
          {cards[i] ? (
            <Card card={cards[i]} size="md" delay={i * 0.2} />
          ) : (
            <div className="card-placeholder community-placeholder" />
          )}
        </div>
      ))}
    </div>
  );
}

interface PotDisplayProps {
  amount: number;
}

export function PotDisplay({ amount }: PotDisplayProps) {
  if (amount <= 0) return null;

  return (
    <motion.div
      className="pot-display"
      key={amount}
      initial={{ scale: 1.2 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring' }}
    >
      <span className="pot-label">POT</span>
      <span className="pot-amount">${amount.toLocaleString()}</span>
    </motion.div>
  );
}
