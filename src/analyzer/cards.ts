// Cards in the solver are ids 0..51: id = 4 * rank + suit,
// rank 2 → 0 … A → 12, suit c → 0, d → 1, h → 2, s → 3.

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs';
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];

export const rankOf = (id: number) => id >> 2;
export const suitOf = (id: number) => id & 3;
export const cardId = (rank: number, suit: number) => rank * 4 + suit;

export function cardStr(id: number): string {
  return RANK_CHARS[rankOf(id)] + SUIT_CHARS[suitOf(id)];
}

export function cardLabel(id: number): string {
  return RANK_CHARS[rankOf(id)] + SUIT_SYMBOLS[suitOf(id)];
}

export function isRed(id: number): boolean {
  const s = suitOf(id);
  return s === 1 || s === 2;
}

/** 13x13 grid name for a combo, e.g. "AKs", "T9o", "QQ". */
export function handClass(c1: number, c2: number): string {
  const r1 = rankOf(c1);
  const r2 = rankOf(c2);
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  if (hi === lo) return RANK_CHARS[hi] + RANK_CHARS[lo];
  return RANK_CHARS[hi] + RANK_CHARS[lo] + (suitOf(c1) === suitOf(c2) ? 's' : 'o');
}

/** Grid position: row/col 0 = Ace. Suited above the diagonal, offsuit below. */
export function gridPos(c1: number, c2: number): [number, number] {
  const r1 = 12 - rankOf(c1);
  const r2 = 12 - rankOf(c2);
  const hi = Math.min(r1, r2);
  const lo = Math.max(r1, r2);
  return suitOf(c1) === suitOf(c2) ? [hi, lo] : [lo, hi];
}

export function gridLabel(row: number, col: number): string {
  const a = RANK_CHARS[12 - row];
  const b = RANK_CHARS[12 - col];
  if (row === col) return a + b;
  return row < col ? a + b + 's' : b + a + 'o';
}

export function comboStr(c1: number, c2: number): string {
  return rankOf(c1) >= rankOf(c2) ? cardStr(c1) + cardStr(c2) : cardStr(c2) + cardStr(c1);
}
