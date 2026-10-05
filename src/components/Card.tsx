import { motion } from 'framer-motion';
import type { Card as CardType } from '../types';
import { isRedSuit } from '../engine/card';

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  delay?: number;
  className?: string;
}

const SIZES = {
  sm: { w: 48, h: 68, fontSize: 14, suitSize: 12 },
  md: { w: 64, h: 90, fontSize: 18, suitSize: 16 },
  lg: { w: 80, h: 112, fontSize: 22, suitSize: 20 },
};

export function Card({ card, faceDown = false, size = 'md', delay = 0, className = '' }: CardProps) {
  const s = SIZES[size];

  if (faceDown || !card) {
    return (
      <motion.div
        className={`card card-back ${className}`}
        style={{ width: s.w, height: s.h }}
        initial={{ rotateY: 180, scale: 0.8, opacity: 0 }}
        animate={{ rotateY: 0, scale: 1, opacity: 1 }}
        transition={{ delay, duration: 0.4, type: 'spring' }}
      >
        <div className="card-back-pattern" />
      </motion.div>
    );
  }

  const red = isRedSuit(card.suit);
  const suitSymbol = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[card.suit];

  return (
    <motion.div
      className={`card card-face ${red ? 'red' : 'black'} ${className}`}
      style={{ width: s.w, height: s.h }}
      initial={{ rotateY: 180, scale: 0.8, opacity: 0 }}
      animate={{ rotateY: 0, scale: 1, opacity: 1 }}
      transition={{ delay, duration: 0.4, type: 'spring' }}
    >
      <span className="card-rank" style={{ fontSize: s.fontSize }}>{card.rank}</span>
      <span className="card-suit" style={{ fontSize: s.suitSize }}>{suitSymbol}</span>
      <span className="card-rank-bottom" style={{ fontSize: s.fontSize }}>{card.rank}</span>
    </motion.div>
  );
}
