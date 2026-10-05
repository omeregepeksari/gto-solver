// Preflop setup for 6-max, 100bb cash games: turns "my position / their position / pot type"
// into the two postflop ranges, pot size and stacks the solver needs.
//
// The ranges are simplified versions of common 6-max charts — good enough to show how a
// postflop spot plays, but not a preflop solution. Every range can be edited in the UI.

export type Position = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
export type PotType = 'srp' | '3bet';

export const POSITIONS: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const PREFLOP_ORDER: Position[] = POSITIONS;
const POSTFLOP_ORDER: Position[] = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];

/** Chips per big blind. The solver works in integer chips. */
export const BB = 10;

const OPEN: Record<Exclude<Position, 'BB'>, string> = {
  UTG: '66+,A2s+,K9s+,Q9s+,J9s+,T8s+,98s,87s,76s,65s,AJo+,KQo',
  HJ: '55+,A2s+,K8s+,Q9s+,J9s+,T8s+,97s+,87s,76s,65s,54s,ATo+,KJo+,QJo',
  CO: '33+,A2s+,K6s+,Q8s+,J8s+,T8s+,97s+,86s+,75s+,65s,54s,A8o+,KTo+,QTo+,JTo',
  BTN: '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,74s+,63s+,53s+,43s,A2o+,K8o+,Q9o+,J9o+,T8o+,98o',
  SB: '22+,A2s+,K3s+,Q5s+,J7s+,T7s+,96s+,85s+,75s+,64s+,54s,A4o+,K9o+,Q9o+,J9o+,T9o',
};

/** Flat-call ranges vs an open, keyed by caller then opener. */
const CALL_VS_OPEN: Partial<Record<Position, Partial<Record<Position, string>>>> = {
  BB: {
    UTG: 'JJ-22,AQs-A2s,K9s+,Q9s+,J9s+,T8s+,97s+,86s+,75s+,64s+,54s,AQo-ATo,KJo+,QJo',
    HJ: 'TT-22,AJs-A2s,K7s+,Q8s+,J8s+,T7s+,96s+,85s+,75s+,64s+,53s+,43s,AQo-A9o,KTo+,QTo+,JTo',
    CO: '99-22,ATs-A2s,K5s+,Q6s+,J7s+,T7s+,96s+,85s+,74s+,63s+,53s+,43s,AJo-A8o,K9o+,Q9o+,J9o+,T9o',
    BTN: '88-22,A9s-A2s,K2s+,Q2s+,J5s+,T6s+,95s+,85s+,74s+,63s+,52s+,42s+,32s,ATo-A2o,K7o+,Q8o+,J8o+,T8o+,97o+,87o,76o',
    SB: '77-22,A7s-A2s,K2s+,Q2s+,J4s+,T5s+,95s+,84s+,74s+,63s+,52s+,42s+,32s,A9o-A2o,K5o+,Q7o+,J7o+,T7o+,97o+,86o+,76o,65o',
  },
  BTN: {
    UTG: 'TT-22,AQs-ATs,KTs+,QTs+,JTs,T9s,98s,87s,76s,AQo,KQo',
    HJ: 'TT-22,AQs-A9s,KTs+,QTs+,JTs,T9s,98s,87s,76s,65s,AQo,KQo',
    CO: 'TT-22,AJs-A6s,K9s+,Q9s+,J9s+,T8s+,98s,87s,76s,65s,AQo-AJo,KQo',
  },
  CO: {
    UTG: 'TT-55,AQs-ATs,KJs+,QJs,JTs,T9s,98s,AQo',
    HJ: 'TT-55,AQs-ATs,KTs+,QJs,JTs,T9s,98s,87s,AQo,KQo',
  },
  HJ: {
    UTG: 'TT-66,AQs-AJs,KQs,QJs,JTs,T9s',
  },
  SB: {
    UTG: 'TT-22,AQs-A9s,KTs+,QTs+,JTs,T9s,98s,AQo,KQo',
    HJ: 'TT-22,AQs-A9s,KTs+,QTs+,JTs,T9s,98s,AQo,KQo',
    CO: 'TT-22,AQs-A9s,KTs+,QTs+,JTs,T9s,98s,AQo,KQo',
    BTN: 'TT-22,AQs-A8s,K9s+,QTs+,JTs,T9s,98s,87s,AQo,KQo',
  },
};

/** 3-bet ranges, keyed by the opener they're 3-betting. */
const THREEBET_VS: Record<Exclude<Position, 'BB'>, string> = {
  UTG: 'QQ+,AKs,AKo,A5s-A4s',
  HJ: 'JJ+,AQs+,AKo,A5s-A3s,KJs+',
  CO: 'TT+,AJs+,AQo+,A5s-A2s,KTs+,QJs,76s,65s',
  BTN: '99+,ATs+,AJo+,A5s-A2s,K9s+,QTs+,JTs,T9s,87s,76s,65s,54s,KQo',
  SB: '88+,A8s+,ATo+,A5s-A2s,K9s+,QTs+,J9s+,T9s,98s,87s,76s,65s,KJo+,QJo',
};

/** What the opener calls a 3-bet with (4-bet hands removed). */
const CALL_VS_3BET: Record<Exclude<Position, 'BB'>, string> = {
  UTG: 'QQ-99,AKo,AQs-AJs,KQs,KJs,QJs,JTs,T9s',
  HJ: 'QQ-88,AKo,AQs-ATs,AQo,KQs,KJs,QJs,JTs,T9s,98s',
  CO: 'QQ-77,AQs-A9s,AQo-AJo,KTs+,QTs+,JTs,T9s,98s,87s,76s,KQo',
  BTN: 'QQ-55,AQs-A6s,AQo-ATo,K9s+,Q9s+,J9s+,T8s+,98s,87s,76s,65s,KJo+,QJo',
  SB: 'QQ-55,AQs-A6s,AQo-ATo,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,KJo+',
};

export interface SpotSetup {
  heroPos: Position;
  villainPos: Position;
  potType: PotType;
}

export interface Spot {
  /** Solver player index of the hero: 0 = out of position, 1 = in position. */
  hero: 0 | 1;
  /** Ranges as [OOP, IP]. */
  ranges: [string, string];
  /** Starting pot and effective stack in chips (see BB). */
  pot: number;
  stack: number;
  /** One-line story of the preflop action, e.g. "BTN opens 2.5bb, BB calls". */
  story: string;
}

export function buildSpot({ heroPos, villainPos, potType }: SpotSetup): Spot | string {
  if (heroPos === villainPos) return 'Pick two different positions.';
  const [opener, other] =
    PREFLOP_ORDER.indexOf(heroPos) < PREFLOP_ORDER.indexOf(villainPos)
      ? [heroPos, villainPos]
      : [villainPos, heroPos];
  if (opener === 'BB') return 'The big blind can’t open.';

  const openSize = opener === 'SB' ? 3 : 2.5;
  const dead = (opener !== 'SB' && other !== 'SB' ? 0.5 : 0) + (other !== 'BB' ? 1 : 0);
  const otherIsIP = POSTFLOP_ORDER.indexOf(other) > POSTFLOP_ORDER.indexOf(opener);

  let openerRange: string;
  let otherRange: string;
  let invested: number;
  let story: string;

  if (potType === 'srp') {
    const call = CALL_VS_OPEN[other]?.[opener];
    if (!call) return `${other} rarely just calls a ${opener} open — try a 3-bet pot.`;
    openerRange = OPEN[opener];
    otherRange = call;
    invested = openSize;
    story = `${opener} opens ${openSize}bb, ${other} calls`;
  } else {
    if (other === 'BB' && opener === 'SB') invested = 9;
    else invested = otherIsIP ? openSize * 3 : openSize * 4;
    openerRange = CALL_VS_3BET[opener];
    otherRange = THREEBET_VS[opener];
    story = `${opener} opens ${openSize}bb, ${other} 3-bets to ${invested}bb, ${opener} calls`;
  }

  const oopRange = otherIsIP ? openerRange : otherRange;
  const ipRange = otherIsIP ? otherRange : openerRange;
  const heroIsIP = (heroPos === other) === otherIsIP;

  return {
    hero: heroIsIP ? 1 : 0,
    ranges: [oopRange, ipRange],
    pot: Math.round((invested * 2 + dead) * BB),
    stack: Math.round((100 - invested) * BB),
    story,
  };
}

export function isIP(pos: Position, vs: Position): boolean {
  return POSTFLOP_ORDER.indexOf(pos) > POSTFLOP_ORDER.indexOf(vs);
}
