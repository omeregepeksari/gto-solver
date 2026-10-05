// Reads the precomputed 6-max preflop solution (see solver/src/preflop.rs) and turns it into
// charts, postflop ranges and grades for preflop decisions.

import { gridLabel, gridPos } from './cards';
import { gradeDecision, type ActionInfo, type Decision, type HeroOption } from './analysis';
import { BB, type Position, type PotType, type Spot } from './spots';

export type RakeVariant = 'none' | 'rake';

interface DecisionNode {
  p: number;
  inv: number[];
  /** "F", "C", "R<to>", "A<to>" (bb, total put in). */
  a: string[];
  ch: number[];
  /** Average strategy, [action * 169 + class], in 1/1000. */
  s: number[];
  /** EV of each action in centi-bb, same layout. */
  ev: number[];
}
interface TerminalNode {
  t: 'fold' | 'flop';
  inv: number[];
  w?: number;
  oop?: number;
  ip?: number;
  allIn?: boolean;
}
type PfNode = DecisionNode | TerminalNode;

export interface PreflopSolution {
  stack: number;
  rake: number;
  rakeCap: number;
  positions: Position[];
  nodes: PfNode[];
}

const cache = new Map<RakeVariant, Promise<PreflopSolution>>();

export function loadPreflop(variant: RakeVariant): Promise<PreflopSolution> {
  let p = cache.get(variant);
  if (!p) {
    const file = variant === 'rake' ? '100bb-rake.json' : '100bb.json';
    p = fetch(`${import.meta.env.BASE_URL}preflop/${file}`).then(r => {
      if (!r.ok) throw new Error(`Couldn’t load the preflop solution (${r.status})`);
      return r.json();
    });
    cache.set(variant, p);
  }
  return p;
}

export const isDecision = (n: PfNode): n is DecisionNode => 'p' in n;

export type PfAct = 'F' | 'C' | 'R' | 'A';
export interface PfStep {
  pos: Position;
  act: PfAct;
}

export interface WalkResult {
  node: number;
  /** Decision nodes passed, with the index of the action taken. */
  path: { node: number; choice: number }[];
}

/**
 * Follow a preflop action sequence through the tree. Folds by players the tree skips (it folds
 * them automatically to keep pots heads-up) are ignored. Raises match a raise or all-in.
 */
export function walk(sol: PreflopSolution, steps: PfStep[], from = 0): WalkResult | string {
  let node = from;
  const path: WalkResult['path'] = [];
  for (const step of steps) {
    const n = sol.nodes[node];
    if (!isDecision(n)) {
      if (step.act === 'F') continue;
      return `${step.pos} acted after the preflop betting was already over in the solver’s model.`;
    }
    if (sol.positions[n.p] !== step.pos) {
      if (step.act === 'F') continue; // a fold the model makes automatically
      return describeUnsupported(step, sol.positions[n.p]);
    }
    let choice = n.a.findIndex(a => a[0] === step.act);
    if (choice < 0 && step.act === 'R') choice = n.a.findIndex(a => a[0] === 'A');
    if (choice < 0 && step.act === 'A') choice = n.a.findIndex(a => a[0] === 'R');
    if (choice < 0) {
      const what = { F: 'fold', C: 'call', R: 'raise', A: 'go all-in' }[step.act];
      return `In the solver’s model ${step.pos} can’t ${what} here (only the big blind flat-calls opens, and there’s no limping or cold 4-betting).`;
    }
    path.push({ node, choice });
    node = n.ch[choice];
  }
  return { node, path };
}

function describeUnsupported(step: PfStep, expected: Position): string {
  return `The solver expected ${expected} to act next, but ${step.pos} ${step.act === 'C' ? 'called' : 'raised'} — that line (a non-big-blind flat call, limp or cold 4-bet) isn’t in its model.`;
}

const POS_ORDER: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const foldsBefore = (pos: Position): PfStep[] =>
  POS_ORDER.slice(0, POS_ORDER.indexOf(pos)).map(p => ({ pos: p, act: 'F' }));
/** Folds by everyone acting strictly between `a` and `b`. */
const foldsBetween = (a: Position, b: Position): PfStep[] =>
  POS_ORDER.slice(POS_ORDER.indexOf(a) + 1, POS_ORDER.indexOf(b)).map(p => ({ pos: p, act: 'F' }));

/** Preflop scenarios the charts screen can show. */
export type Scenario =
  | { kind: 'open'; hero: Position }
  | { kind: 'vsOpen'; hero: Position; opener: Position }
  | { kind: 'vs3bet'; hero: Position; threeBettor: Position }
  | { kind: 'vs4bet'; hero: Position; opener: Position };

export function scenarioSteps(sc: Scenario): PfStep[] {
  switch (sc.kind) {
    case 'open':
      return foldsBefore(sc.hero);
    case 'vsOpen':
      return [...foldsBefore(sc.opener), { pos: sc.opener, act: 'R' }, ...foldsBetween(sc.opener, sc.hero)];
    case 'vs3bet':
      return [
        ...foldsBefore(sc.hero),
        { pos: sc.hero, act: 'R' },
        ...foldsBetween(sc.hero, sc.threeBettor),
        { pos: sc.threeBettor, act: 'R' },
      ];
    case 'vs4bet':
      return [
        ...foldsBefore(sc.opener),
        { pos: sc.opener, act: 'R' },
        ...foldsBetween(sc.opener, sc.hero),
        { pos: sc.hero, act: 'R' },
        { pos: sc.opener, act: 'R' },
      ];
  }
}

export interface ChartData {
  node: DecisionNode;
  actions: string[];
  /** [class][action] frequency 0..1. */
  freqs: number[][];
  /** [class][action] EV in bb. */
  evs: number[][];
  /** Share of all hands taking each action. */
  totals: number[];
}

const COMBOS = Array.from({ length: 169 }, (_, i) => {
  const r = Math.floor(i / 13);
  const c = i % 13;
  return r === c ? 6 : r < c ? 4 : 12;
});

export function actionLabel(code: string, prevBet = 1): string {
  if (code === 'F') return 'Fold';
  if (code === 'C') return `Call ${fmt(prevBet)}`;
  const amt = Number(code.slice(1));
  return code[0] === 'A' ? `All-in (${fmt(amt)})` : `Raise to ${fmt(amt)}`;
}
const fmt = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(1)}bb`;

export function chartAt(sol: PreflopSolution, node: number): ChartData | null {
  const n = sol.nodes[node];
  if (!isDecision(n)) return null;
  const k = n.a.length;
  const facing = Math.max(...n.inv);
  const freqs = Array.from({ length: 169 }, (_, c) => n.a.map((_, a) => n.s[a * 169 + c] / 1000));
  const evs = Array.from({ length: 169 }, (_, c) => n.a.map((_, a) => n.ev[a * 169 + c] / 100));
  const totals = new Array(k).fill(0);
  freqs.forEach((f, c) => f.forEach((x, a) => (totals[a] += (x * COMBOS[c]) / 1326)));
  return { node: n, actions: n.a.map(code => actionLabel(code, facing)), freqs, evs, totals };
}

/** Range string ("AA,AKs:0.53,…") of hands reaching the end of `steps`, for one player. */
function rangeString(sol: PreflopSolution, path: WalkResult['path'], player: number): string {
  const w = new Array(169).fill(1);
  for (const { node, choice } of path) {
    const n = sol.nodes[node] as DecisionNode;
    if (n.p !== player) continue;
    for (let c = 0; c < 169; c++) w[c] *= n.s[choice * 169 + c] / 1000;
  }
  const parts: string[] = [];
  for (let c = 0; c < 169; c++) {
    if (w[c] < 0.01) continue;
    const label = gridLabel(Math.floor(c / 13), c % 13);
    parts.push(w[c] > 0.995 ? label : `${label}:${w[c].toFixed(3)}`);
  }
  return parts.join(',');
}

/**
 * The postflop starting point (ranges, pot, stack) straight from the preflop solution, or a
 * reason it isn't covered (e.g. a non-big-blind flat call).
 */
export function spotFromSolution(
  sol: PreflopSolution,
  heroPos: Position,
  villainPos: Position,
  potType: PotType,
): Spot | string {
  if (heroPos === villainPos) return 'Pick two different positions.';
  const [opener, other] =
    POS_ORDER.indexOf(heroPos) < POS_ORDER.indexOf(villainPos) ? [heroPos, villainPos] : [villainPos, heroPos];
  if (opener === 'BB') return 'The big blind can’t open.';

  const steps: PfStep[] = [...foldsBefore(opener), { pos: opener, act: 'R' }, ...foldsBetween(opener, other)];
  if (potType === 'srp') {
    if (other !== 'BB') return `In the preflop solver only the big blind flat-calls; ${other} 3-bets or folds.`;
    steps.push({ pos: 'BB', act: 'C' });
  } else {
    steps.push({ pos: other, act: 'R' });
    if (potType === '3bet') steps.push({ pos: opener, act: 'C' });
    else steps.push({ pos: opener, act: 'R' }, { pos: other, act: 'C' });
  }
  const res = walk(sol, steps);
  if (typeof res === 'string') return res;
  const end = sol.nodes[res.node];
  if (isDecision(end) || end.t !== 'flop' || end.allIn) return 'This line doesn’t reach a flop in the solver’s model.';

  const oop = end.oop!;
  const ip = end.ip!;
  const heroIdx = sol.positions.indexOf(heroPos);
  const pot = end.inv.reduce((a, b) => a + b, 0);
  const openerIdx = sol.positions.indexOf(opener);
  const action =
    potType === 'srp'
      ? `${opener} opens ${fmt(end.inv[openerIdx])}, BB calls`
      : potType === '3bet'
        ? `${opener} opens, ${other} 3-bets to ${fmt(end.inv[sol.positions.indexOf(other)])}, ${opener} calls`
        : `${opener} opens, ${other} 3-bets, ${opener} 4-bets to ${fmt(end.inv[openerIdx])}, ${other} calls`;
  return {
    hero: heroIdx === ip ? 1 : 0,
    ranges: [rangeString(sol, res.path, oop), rangeString(sol, res.path, ip)],
    pot: Math.round(pot * BB),
    stack: Math.round((sol.stack - end.inv[oop]) * BB),
    story: action,
    source: 'solver',
  };
}

export const CLASS_COMBOS = COMBOS;

// ---------------------------------------------------------------------------------------------
// Grading the preflop part of a pasted hand

export interface PreflopDecision {
  /** Decision node in the solution. */
  node: number;
  /** Index of the hero's hand class (row * 13 + col). */
  hand: number;
  decision: Decision;
  options: HeroOption[];
}

export interface PreflopReview {
  decisions: PreflopDecision[];
  /** Why grading stopped before the end of the preflop action, if it did. */
  stop: string | null;
}

export function reviewPreflop(
  sol: PreflopSolution,
  actions: { pos: Position; act: PfAct; hero: boolean }[],
  heroCards: [number, number],
): PreflopReview {
  const [r, c] = gridPos(heroCards[0], heroCards[1]);
  const hand = r * 13 + c;
  const decisions: PreflopDecision[] = [];
  let node = 0;
  for (let i = 0; i < actions.length; i++) {
    const res = walk(sol, [actions[i]].map(a => ({ pos: a.pos, act: a.act })), node);
    if (typeof res === 'string') return { decisions, stop: res };
    if (actions[i].hero && res.path.length === 1) {
      const { node: at, choice } = res.path[0];
      const chart = chartAt(sol, at)!;
      const best = Math.max(...chart.evs[hand]);
      const options: HeroOption[] = chart.node.a.map((code, a) => ({
        action: preflopActionInfo(code, chart.actions[a]),
        freq: chart.freqs[hand][a],
        evVsBest: (chart.evs[hand][a] - best) * BB,
      }));
      const pot = chart.node.inv.reduce((x, y) => x + y, 0) * BB;
      decisions.push({ node: at, hand, decision: gradeDecision(options, choice, pot), options });
    }
    node = res.node;
  }
  return { decisions, stop: null };
}

export function preflopActionInfo(code: string, label: string): ActionInfo {
  const kind = ({ F: 'fold', C: 'call', R: 'raise', A: 'allin' } as const)[code[0] as PfAct];
  return { code, kind, amount: Number(code.slice(1)) || 0, label, short: label };
}
