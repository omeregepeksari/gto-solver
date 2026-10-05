// Turns raw solver arrays into things a player can read: action names, the hero's options,
// range grids, range breakdowns and a grade for the action actually taken.

import { BB } from './spots';
import { gridPos } from './cards';
import { CATEGORIES, categorize, type Category } from './handStrength';
import type { NodeData } from './solverTypes';

export const bb = (chips: number) => {
  const v = chips / BB;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}bb`;
};

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface ActionInfo {
  code: string;
  kind: ActionKind;
  /** Chips this player has in this street after the action (for bets/raises/all-ins). */
  amount: number;
  label: string;
  short: string;
}

/**
 * @param streetPot pot at the start of the current street
 * @param toCall chips the player must add to call
 */
export function describeAction(code: string, streetPot: number, toCall: number): ActionInfo {
  const kindChar = code[0];
  const amount = Number(code.slice(1)) || 0;
  switch (kindChar) {
    case 'F':
      return { code, kind: 'fold', amount: 0, label: 'Fold', short: 'Fold' };
    case 'X':
      return { code, kind: 'check', amount: 0, label: 'Check', short: 'Check' };
    case 'C':
      return { code, kind: 'call', amount: 0, label: `Call ${bb(toCall)}`, short: 'Call' };
    case 'B': {
      const pct = Math.round((100 * amount) / streetPot);
      return { code, kind: 'bet', amount, label: `Bet ${bb(amount)} (${pct}% pot)`, short: `Bet ${pct}%` };
    }
    case 'R':
      return { code, kind: 'raise', amount, label: `Raise to ${bb(amount)}`, short: `Raise ${bb(amount)}` };
    default:
      return { code, kind: 'allin', amount, label: `All-in (${bb(amount)})`, short: 'All-in' };
  }
}

/** Colors per action, matching the usual solver convention: passive = green, aggressive = red, fold = blue. */
export function actionColors(actions: ActionInfo[]): string[] {
  const aggressive = actions.filter(a => a.kind === 'bet' || a.kind === 'raise');
  const reds = ['#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b'];
  return actions.map(a => {
    if (a.kind === 'fold') return '#3b82f6';
    if (a.kind === 'check' || a.kind === 'call') return '#22c55e';
    if (a.kind === 'allin') return '#7f1d1d';
    const i = aggressive.indexOf(a);
    const step = aggressive.length > 1 ? Math.round((i * (reds.length - 2)) / (aggressive.length - 1)) : 1;
    return reds[step];
  });
}

export interface HeroOption {
  action: ActionInfo;
  freq: number;
  /** EV relative to the best option, in chips (≤ 0). */
  evVsBest: number;
}

export interface HeroView {
  inRange: boolean;
  equity: number;
  /** Share of the hero's range at this node that has less equity than the hero's hand. */
  equityPercentile: number;
  options: HeroOption[] | null;
}

export function heroView(
  node: NodeData,
  hero: number,
  handIdx: number,
  actions: ActionInfo[],
): HeroView | null {
  if (handIdx < 0 || !node.equity) return null;
  const weights = node.weights[hero];
  const eq = node.equity[hero];
  const equity = eq[handIdx];
  let below = 0;
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    total += weights[i];
    if (eq[i] < equity) below += weights[i];
  }
  const view: HeroView = {
    inRange: weights[handIdx] > 1e-6,
    equity,
    equityPercentile: total > 0 ? below / total : 0,
    options: null,
  };
  if (node.kind === 'action' && node.player === hero && node.strategy && node.actionEvs) {
    const n = weights.length;
    const evs = actions.map((_, a) => node.actionEvs![a * n + handIdx]);
    const best = Math.max(...evs);
    view.options = actions.map((action, a) => ({
      action,
      freq: node.strategy![a * n + handIdx],
      evVsBest: evs[a] - best,
    }));
  }
  return view;
}

export type Grade = 'best' | 'good' | 'ok' | 'mistake' | 'blunder';

export interface Decision {
  grade: Grade;
  chosen: HeroOption;
  best: HeroOption;
  /** Chips lost vs the best option. */
  loss: number;
  potAtDecision: number;
}

export function gradeDecision(options: HeroOption[], chosenIdx: number, pot: number): Decision {
  const chosen = options[chosenIdx];
  const best = options.reduce((a, b) => (b.freq > a.freq ? b : a));
  const loss = -chosen.evVsBest;
  const lossPct = loss / pot;
  let grade: Grade;
  if (chosen === best || chosen.freq >= 0.5) grade = 'best';
  else if (chosen.freq >= 0.15 || lossPct < 0.01) grade = 'good';
  else if (chosen.freq >= 0.03 || lossPct < 0.05) grade = 'ok';
  else if (lossPct < 0.25) grade = 'mistake';
  else grade = 'blunder';
  return { grade, chosen, best, loss, potAtDecision: pot };
}

export const GRADE_TEXT: Record<Grade, { title: string; tone: string }> = {
  best: { title: 'Solver’s main play', tone: 'good' },
  good: { title: 'Good — part of the solver’s mix', tone: 'good' },
  ok: { title: 'Okay — small mistake at most', tone: 'ok' },
  mistake: { title: 'Mistake', tone: 'bad' },
  blunder: { title: 'Big mistake', tone: 'bad' },
};

export interface GridCell {
  /** Total reach weight (combos) in this cell. */
  weight: number;
  /** Max combos the cell could hold (6, 4 or 12) after card removal. */
  maxCombos: number;
  /** Weighted action frequencies, or null when nobody's acting / no weight. */
  freqs: number[] | null;
}

/** Combos that share a card with `dead` are dropped (card removal from the board / your hand). */
export function rangeGrid(
  node: NodeData,
  player: number,
  cards: Uint8Array,
  dead: number[],
  numActions: number,
): GridCell[] {
  const cells: GridCell[] = Array.from({ length: 169 }, () => ({ weight: 0, maxCombos: 0, freqs: null }));
  const sums = Array.from({ length: 169 }, () => new Float64Array(numActions));
  const weights = node.weights[player];
  const n = weights.length;
  const showStrategy = node.kind === 'action' && node.player === player && node.strategy;
  for (let i = 0; i < n; i++) {
    const c1 = cards[2 * i];
    const c2 = cards[2 * i + 1];
    if (dead.includes(c1) || dead.includes(c2)) continue;
    const [r, c] = gridPos(c1, c2);
    const cell = cells[r * 13 + c];
    cell.maxCombos++;
    const w = weights[i];
    cell.weight += w;
    if (showStrategy) {
      for (let a = 0; a < numActions; a++) sums[r * 13 + c][a] += w * node.strategy![a * n + i];
    }
  }
  if (showStrategy) {
    cells.forEach((cell, idx) => {
      if (cell.weight > 1e-9) cell.freqs = Array.from(sums[idx], s => s / cell.weight);
    });
  }
  return cells;
}

/** Overall action frequencies of a player's whole range at an action node. */
export function rangeActionFreqs(node: NodeData, dead: number[], cards: Uint8Array, numActions: number): number[] {
  const weights = node.weights[node.player];
  const n = weights.length;
  const sums = new Array(numActions).fill(0);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (dead.includes(cards[2 * i]) || dead.includes(cards[2 * i + 1])) continue;
    const w = weights[i];
    total += w;
    for (let a = 0; a < numActions; a++) sums[a] += w * node.strategy![a * n + i];
  }
  return sums.map(s => (total > 0 ? s / total : 0));
}

export interface BreakdownRow {
  category: Category;
  share: number;
  /** Action mix within this category, when this player is the one acting. */
  freqs: number[] | null;
}

/** What a range is made of: "35% top pair, 20% draws, …" — the core of hand reading. */
export function rangeBreakdown(
  node: NodeData,
  player: number,
  cards: Uint8Array,
  dead: number[],
  numActions: number,
): BreakdownRow[] {
  const weights = node.weights[player];
  const n = weights.length;
  const showStrategy = node.kind === 'action' && node.player === player && node.strategy;
  const totals = new Map<Category, { w: number; a: number[] }>();
  let total = 0;
  for (let i = 0; i < n; i++) {
    const c1 = cards[2 * i];
    const c2 = cards[2 * i + 1];
    const w = weights[i];
    if (w <= 1e-9 || dead.includes(c1) || dead.includes(c2)) continue;
    const cat = categorize(c1, c2, node.board);
    let t = totals.get(cat);
    if (!t) totals.set(cat, (t = { w: 0, a: new Array(numActions).fill(0) }));
    t.w += w;
    total += w;
    if (showStrategy) for (let a = 0; a < numActions; a++) t.a[a] += w * node.strategy![a * n + i];
  }
  return CATEGORIES.filter(c => totals.has(c)).map(category => {
    const t = totals.get(category)!;
    return {
      category,
      share: total > 0 ? t.w / total : 0,
      freqs: showStrategy ? t.a.map(x => x / t.w) : null,
    };
  });
}
