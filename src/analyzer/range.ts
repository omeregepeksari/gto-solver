// Parser for range strings like "QQ+,AKs,A5s-A2s,KQo:0.5,AsKh" — same syntax the solver accepts —
// so the setup screen can preview ranges and check the hero's hand without a solver round-trip.

import { RANK_CHARS, SUIT_CHARS, cardId } from './cards';

/** Weights keyed by comboKey(c1, c2). Missing = 0. */
export type ComboWeights = Map<number, number>;

export const comboKey = (a: number, b: number) => (a < b ? a * 52 + b : b * 52 + a);

const rankIdx = (ch: string) => RANK_CHARS.indexOf(ch.toUpperCase());

function setClass(out: ComboWeights, hi: number, lo: number, kind: 's' | 'o' | '', w: number) {
  for (let s1 = 0; s1 < 4; s1++) {
    for (let s2 = 0; s2 < 4; s2++) {
      if (hi === lo && s2 <= s1) continue;
      if (hi !== lo && kind === 's' && s1 !== s2) continue;
      if (hi !== lo && kind === 'o' && s1 === s2) continue;
      out.set(comboKey(cardId(hi, s1), cardId(lo, s2)), w);
    }
  }
}

interface ClassToken { hi: number; lo: number; kind: 's' | 'o' | '' }

function parseClass(tok: string): ClassToken | null {
  const m = /^([2-9TJQKA])([2-9TJQKA])([so]?)$/i.exec(tok);
  if (!m) return null;
  let hi = rankIdx(m[1]);
  let lo = rankIdx(m[2]);
  if (lo > hi) [hi, lo] = [lo, hi];
  const kind = m[3].toLowerCase() as ClassToken['kind'];
  if (hi === lo && kind) return null;
  return { hi, lo, kind };
}

export function parseRange(text: string): ComboWeights | string {
  const out: ComboWeights = new Map();
  const groups = text.split(',').map(g => g.trim()).filter(Boolean);
  for (const group of groups) {
    const [body, weightStr] = group.split(':').map(s => s.trim());
    const w = weightStr === undefined ? 1 : Number(weightStr);
    if (!(w >= 0 && w <= 1)) return `Bad weight in "${group}"`;

    // Specific combo, e.g. "AsKh"
    const specific = /^([2-9TJQKA])([cdhs])([2-9TJQKA])([cdhs])$/i.exec(body);
    if (specific) {
      const a = cardId(rankIdx(specific[1]), SUIT_CHARS.indexOf(specific[2].toLowerCase()));
      const b = cardId(rankIdx(specific[3]), SUIT_CHARS.indexOf(specific[4].toLowerCase()));
      if (a === b) return `Duplicate card in "${group}"`;
      out.set(comboKey(a, b), w);
      continue;
    }

    if (body.endsWith('+')) {
      const t = parseClass(body.slice(0, -1));
      if (!t) return `Can't read "${group}"`;
      if (t.hi === t.lo) {
        for (let r = t.hi; r <= 12; r++) setClass(out, r, r, '', w);
      } else {
        for (let r = t.lo; r < t.hi; r++) setClass(out, t.hi, r, t.kind, w);
      }
      continue;
    }

    if (body.includes('-')) {
      const [a, b] = body.split('-').map(parseClass);
      if (!a || !b || a.kind !== b.kind) return `Can't read "${group}"`;
      if (a.hi === a.lo && b.hi === b.lo) {
        for (let r = Math.min(a.hi, b.hi); r <= Math.max(a.hi, b.hi); r++) setClass(out, r, r, '', w);
      } else if (a.hi === b.hi) {
        for (let r = Math.min(a.lo, b.lo); r <= Math.max(a.lo, b.lo); r++) setClass(out, a.hi, r, a.kind, w);
      } else {
        return `Can't read "${group}"`;
      }
      continue;
    }

    const t = parseClass(body);
    if (!t) return `Can't read "${group}"`;
    setClass(out, t.hi, t.lo, t.kind, w);
  }
  return out;
}

/** Average weight of each of the 169 grid cells, indexed [row * 13 + col] (row 0 = Ace). */
export function gridWeights(weights: ComboWeights): Float32Array {
  const sum = new Float32Array(169);
  const cnt = new Float32Array(169);
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) {
      const ra = 12 - (a >> 2);
      const rb = 12 - (b >> 2);
      const suited = (a & 3) === (b & 3);
      const hi = Math.min(ra, rb);
      const lo = Math.max(ra, rb);
      const idx = suited ? hi * 13 + lo : lo * 13 + hi;
      sum[idx] += weights.get(comboKey(a, b)) ?? 0;
      cnt[idx]++;
    }
  }
  return sum.map((s, i) => s / cnt[i]);
}

/** Share of all 1326 starting hands, e.g. 0.42 for a 42% range. */
export function rangeSize(weights: ComboWeights): number {
  let s = 0;
  for (const w of weights.values()) s += w;
  return s / 1326;
}
