// Plain-English hand categories ("top pair", "flush draw", …) used to describe what each
// player is holding. These are labels for humans, not showdown evaluation.

import { rankOf, suitOf } from './cards';

export const CATEGORIES = [
  'Monster',      // quads / full house / straight flush
  'Flush',
  'Straight',
  'Set / trips',
  'Two pair',
  'Overpair',
  'Top pair',
  'Middle pair',
  'Weak pair',
  'Draw',
  'Nothing',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Categories grouped into the three buckets most people think in. */
export const BUCKET: Record<Category, 'strong' | 'medium' | 'weak'> = {
  Monster: 'strong',
  Flush: 'strong',
  Straight: 'strong',
  'Set / trips': 'strong',
  'Two pair': 'strong',
  Overpair: 'medium',
  'Top pair': 'medium',
  'Middle pair': 'weak',
  'Weak pair': 'weak',
  Draw: 'weak',
  Nothing: 'weak',
};

function hasStraight(rankMask: number): boolean {
  // Shift up one bit and copy the ace into bit 0 so A-2-3-4-5 counts.
  const full = (rankMask << 1) | ((rankMask >> 12) & 1);
  for (let lo = 0; lo <= 9; lo++) {
    if (((full >> lo) & 0b11111) === 0b11111) return true;
  }
  return false;
}

function rankMaskOf(cards: number[]): number {
  let m = 0;
  for (const c of cards) m |= 1 << rankOf(c);
  return m;
}

/** Number of ranks that would complete a straight (2+ means open-ended or double gutter). */
function straightOuts(rankMask: number): number {
  let outs = 0;
  for (let r = 0; r < 13; r++) {
    if (rankMask & (1 << r)) continue;
    if (hasStraight(rankMask | (1 << r))) outs++;
  }
  return outs;
}

export function categorize(c1: number, c2: number, board: number[]): Category {
  const hole = [c1, c2];
  const all = [c1, c2, ...board];
  const counts = new Array(13).fill(0);
  for (const c of all) counts[rankOf(c)]++;
  const h1 = rankOf(c1);
  const h2 = rankOf(c2);
  const holeRanks = new Set([h1, h2]);

  // Flushes (need a hole card in the suit).
  const suitCounts = [0, 0, 0, 0];
  for (const c of all) suitCounts[suitOf(c)]++;
  const flushSuit = suitCounts.findIndex(n => n >= 5);
  const hasFlush = flushSuit >= 0 && hole.some(c => suitOf(c) === flushSuit);
  if (hasFlush) {
    const suited = all.filter(c => suitOf(c) === flushSuit);
    if (hasStraight(rankMaskOf(suited)) && !hasStraight(rankMaskOf(board.filter(c => suitOf(c) === flushSuit)))) {
      return 'Monster';
    }
  }

  // Quads / full house that use a hole card.
  const quads = counts.findIndex((n, r) => n === 4 && holeRanks.has(r));
  if (quads >= 0) return 'Monster';
  const tripsRanks = counts.map((n, r) => (n >= 3 ? r : -1)).filter(r => r >= 0);
  const pairRanks = counts.map((n, r) => (n >= 2 ? r : -1)).filter(r => r >= 0);
  if (tripsRanks.length > 0 && pairRanks.length >= 2 && pairRanks.some(r => holeRanks.has(r))) return 'Monster';

  if (hasFlush) return 'Flush';

  const boardMask = rankMaskOf(board);
  const allMask = rankMaskOf(all);
  if (hasStraight(allMask) && !hasStraight(boardMask)) return 'Straight';

  const boardCounts = new Array(13).fill(0);
  for (const c of board) boardCounts[rankOf(c)]++;
  const boardRanksDesc = [...new Set(board.map(rankOf))].sort((a, b) => b - a);

  if (h1 === h2) {
    if (boardCounts[h1] >= 1) return 'Set / trips';
    if (h1 > boardRanksDesc[0]) return 'Overpair';
    if (h1 > (boardRanksDesc[1] ?? -1)) return 'Middle pair';
  } else {
    const p1 = boardCounts[h1] > 0;
    const p2 = boardCounts[h2] > 0;
    if ((p1 && boardCounts[h1] >= 2) || (p2 && boardCounts[h2] >= 2)) return 'Set / trips';
    if (p1 && p2) return 'Two pair';
    if (p1 || p2) {
      const paired = p1 ? h1 : h2;
      if (paired === boardRanksDesc[0]) return 'Top pair';
      if (paired === boardRanksDesc[1]) return 'Middle pair';
      return 'Weak pair';
    }
  }

  if (board.length < 5) {
    const flushDraw = suitCounts.some((n, s) => n === 4 && hole.some(c => suitOf(c) === s));
    const sOuts = straightOuts(allMask) - straightOuts(boardMask);
    if (flushDraw || sOuts >= 2) return 'Draw';
  }
  return h1 === h2 ? 'Weak pair' : 'Nothing';
}

/** Short description of the hero's hand for headings, e.g. "Top pair" or "Draw". */
export function describeHand(c1: number, c2: number, board: number[]): string {
  const cat = categorize(c1, c2, board);
  return cat === 'Monster' ? 'A monster (full house or better)' : cat;
}
