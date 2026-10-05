import type { Card, EvaluatedHand, HandRank, Rank } from '../types';
import { RANK_VALUES } from './card';

const HAND_RANK_SCORES: Record<HandRank, number> = {
  high_card: 1,
  one_pair: 2,
  two_pair: 3,
  three_of_a_kind: 4,
  straight: 5,
  flush: 6,
  full_house: 7,
  four_of_a_kind: 8,
  straight_flush: 9,
  royal_flush: 10,
};

const HAND_DESCRIPTIONS: Record<HandRank, string> = {
  high_card: 'High Card',
  one_pair: 'One Pair',
  two_pair: 'Two Pair',
  three_of_a_kind: 'Three of a Kind',
  straight: 'Straight',
  flush: 'Flush',
  full_house: 'Full House',
  four_of_a_kind: 'Four of a Kind',
  straight_flush: 'Straight Flush',
  royal_flush: 'Royal Flush',
};

function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(combo => [first, ...combo]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function getRankCounts(cards: Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

function getSortedValues(cards: Card[]): number[] {
  return cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
}

function isFlush(cards: Card[]): boolean {
  return cards.every(c => c.suit === cards[0].suit);
}

function isStraight(values: number[]): { isStraight: boolean; highCard: number } {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.length < 5) return { isStraight: false, highCard: 0 };

  // Check regular straight
  for (let i = 0; i <= unique.length - 5; i++) {
    let consecutive = true;
    for (let j = 0; j < 4; j++) {
      if (unique[i + j] - unique[i + j + 1] !== 1) {
        consecutive = false;
        break;
      }
    }
    if (consecutive) return { isStraight: true, highCard: unique[i] };
  }

  // Wheel (A-2-3-4-5)
  if (unique.includes(14) && unique.includes(5) && unique.includes(4) &&
      unique.includes(3) && unique.includes(2)) {
    return { isStraight: true, highCard: 5 };
  }

  return { isStraight: false, highCard: 0 };
}

function evaluateFiveCards(cards: Card[]): EvaluatedHand {
  const values = getSortedValues(cards);
  const rankCounts = getRankCounts(cards);
  const counts = [...rankCounts.values()].sort((a, b) => b - a);
  const flush = isFlush(cards);
  const straight = isStraight(values);

  let rank: HandRank;
  let tiebreaker: number;

  if (flush && straight.isStraight) {
    if (straight.highCard === 14) {
      rank = 'royal_flush';
    } else {
      rank = 'straight_flush';
    }
    tiebreaker = straight.highCard;
  } else if (counts[0] === 4) {
    rank = 'four_of_a_kind';
    const quadRank = [...rankCounts.entries()].find(([, c]) => c === 4)![0];
    tiebreaker = RANK_VALUES[quadRank] * 100 + values.find(v => v !== RANK_VALUES[quadRank])!;
  } else if (counts[0] === 3 && counts[1] === 2) {
    rank = 'full_house';
    const tripRank = [...rankCounts.entries()].find(([, c]) => c === 3)![0];
    const pairRank = [...rankCounts.entries()].find(([, c]) => c === 2)![0];
    tiebreaker = RANK_VALUES[tripRank] * 100 + RANK_VALUES[pairRank];
  } else if (flush) {
    rank = 'flush';
    tiebreaker = values.reduce((acc, v, i) => acc + v * Math.pow(15, 4 - i), 0);
  } else if (straight.isStraight) {
    rank = 'straight';
    tiebreaker = straight.highCard;
  } else if (counts[0] === 3) {
    rank = 'three_of_a_kind';
    const tripRank = [...rankCounts.entries()].find(([, c]) => c === 3)![0];
    const kickers = values.filter(v => v !== RANK_VALUES[tripRank]).slice(0, 2);
    tiebreaker = RANK_VALUES[tripRank] * 10000 + kickers[0] * 100 + kickers[1];
  } else if (counts[0] === 2 && counts[1] === 2) {
    rank = 'two_pair';
    const pairs = [...rankCounts.entries()].filter(([, c]) => c === 2)
      .map(([r]) => RANK_VALUES[r]).sort((a, b) => b - a);
    const kicker = values.find(v => !pairs.includes(v))!;
    tiebreaker = pairs[0] * 10000 + pairs[1] * 100 + kicker;
  } else if (counts[0] === 2) {
    rank = 'one_pair';
    const pairRank = [...rankCounts.entries()].find(([, c]) => c === 2)![0];
    const kickers = values.filter(v => v !== RANK_VALUES[pairRank]).slice(0, 3);
    tiebreaker = RANK_VALUES[pairRank] * 1000000 + kickers.reduce((a, v, i) => a + v * Math.pow(15, 2 - i), 0);
  } else {
    rank = 'high_card';
    tiebreaker = values.reduce((acc, v, i) => acc + v * Math.pow(15, 4 - i), 0);
  }

  const score = HAND_RANK_SCORES[rank] * 1e10 + tiebreaker;

  return {
    rank,
    score,
    cards,
    description: HAND_DESCRIPTIONS[rank],
  };
}

export function evaluateBestHand(holeCards: Card[], communityCards: Card[]): EvaluatedHand {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) {
    return evaluateFiveCards(allCards.length >= 2 ? allCards.slice(0, Math.min(5, allCards.length)) : allCards);
  }

  const combinations = getCombinations(allCards, 5);
  let best: EvaluatedHand | null = null;

  for (const combo of combinations) {
    const evaluated = evaluateFiveCards(combo);
    if (!best || evaluated.score > best.score) {
      best = evaluated;
    }
  }

  return best!;
}

export function getHandStrengthPercentile(holeCards: Card[], communityCards: Card[]): number {
  if (communityCards.length === 0) {
    return evaluatePreFlopStrength(holeCards);
  }
  const hand = evaluateBestHand(holeCards, communityCards);
  const baseScore = HAND_RANK_SCORES[hand.rank];
  const normalized = (baseScore - 1) / 9;
  return Math.min(1, Math.max(0, normalized + (hand.score % 1e10) / 1e12));
}

function evaluatePreFlopStrength(holeCards: Card[]): number {
  if (holeCards.length < 2) return 0;

  const [c1, c2] = holeCards;
  const v1 = RANK_VALUES[c1.rank];
  const v2 = RANK_VALUES[c2.rank];
  const high = Math.max(v1, v2);
  const low = Math.min(v1, v2);
  const suited = c1.suit === c2.suit;
  const paired = c1.rank === c2.rank;

  if (paired) {
    return 0.5 + (high - 2) / 24;
  }

  let strength = (high + low) / 28;

  if (suited) strength += 0.08;
  if (high - low <= 4 && high - low > 0) strength += 0.05;
  if (high >= 12 && low >= 10) strength += 0.1;
  if (high === 14) strength += 0.05;

  return Math.min(0.95, strength);
}

export function getHandHint(holeCards: Card[], communityCards: Card[]): string {
  const strength = communityCards.length > 0
    ? getHandStrengthPercentile(holeCards, communityCards)
    : evaluatePreFlopStrength(holeCards);

  if (strength >= 0.85) return 'Premium hand — raise or re-raise';
  if (strength >= 0.65) return 'Strong hand — bet for value';
  if (strength >= 0.45) return 'Playable — consider position';
  if (strength >= 0.25) return 'Marginal — proceed with caution';
  return 'Weak hand — fold unless bluffing';
}
