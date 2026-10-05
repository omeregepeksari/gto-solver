import type { AIPersonality, GameState, PlayerAction } from '../types';
import { getHandStrengthPercentile } from '../engine/handEvaluator';
import { getCallAmount, getMinRaiseAmount, getValidActions } from '../engine/gameEngine';

interface PersonalityProfile {
  vpip: number;       // Voluntarily put $ in pot
  pfr: number;        // Pre-flop raise
  aggression: number; // Bet/raise frequency
  bluffFreq: number;  // Bluff frequency
  foldToRaise: number;
  callThreshold: number;
  raiseThreshold: number;
}

const PROFILES: Record<AIPersonality, PersonalityProfile> = {
  // TAG — tight-aggressive, solid pro style (~22% VPIP, ~18% PFR)
  tag: {
    vpip: 0.22, pfr: 0.18, aggression: 0.65,
    bluffFreq: 0.12, foldToRaise: 0.55,
    callThreshold: 0.35, raiseThreshold: 0.55,
  },
  // LAG — loose-aggressive (~32% VPIP, ~24% PFR)
  lag: {
    vpip: 0.32, pfr: 0.24, aggression: 0.75,
    bluffFreq: 0.25, foldToRaise: 0.35,
    callThreshold: 0.25, raiseThreshold: 0.45,
  },
  // Rock — tight-passive (~12% VPIP)
  rock: {
    vpip: 0.12, pfr: 0.08, aggression: 0.30,
    bluffFreq: 0.05, foldToRaise: 0.70,
    callThreshold: 0.50, raiseThreshold: 0.70,
  },
  // Maniac — very loose-aggressive (~50% VPIP)
  maniac: {
    vpip: 0.50, pfr: 0.35, aggression: 0.90,
    bluffFreq: 0.40, foldToRaise: 0.20,
    callThreshold: 0.15, raiseThreshold: 0.30,
  },
  // Calling station — loose-passive (~40% VPIP, low PFR)
  station: {
    vpip: 0.40, pfr: 0.08, aggression: 0.20,
    bluffFreq: 0.05, foldToRaise: 0.25,
    callThreshold: 0.20, raiseThreshold: 0.60,
  },
};

export interface AIDecision {
  action: PlayerAction;
  raiseAmount?: number;
  thinkTime: number;
}

export function getAIDecision(state: GameState, playerId: string): AIDecision {
  const player = state.players.find(p => p.id === playerId);
  if (!player || !player.personality) {
    return { action: 'fold', thinkTime: 1000 };
  }

  const profile = PROFILES[player.personality];
  const validActions = getValidActions(state, playerId);
  const strength = getHandStrengthPercentile(player.holeCards, state.communityCards);
  const toCall = getCallAmount(state, playerId);
  const potOdds = toCall > 0 ? toCall / (state.pot + toCall) : 0;
  const isPreflop = state.communityCards.length === 0;

  // Position factor (later = better)
  const numPlayers = state.players.filter(p => !p.isFolded).length;
  const positionFactor = player.seatIndex / Math.max(1, numPlayers);

  let action: PlayerAction = 'fold';
  let raiseAmount: number | undefined;

  // Decision logic
  const adjustedStrength = strength + positionFactor * 0.1;

  if (adjustedStrength >= profile.raiseThreshold) {
    // Strong hand — raise
    if (validActions.includes('raise')) {
      action = 'raise';
      const minRaise = getMinRaiseAmount(state);
      const potRaise = state.pot * profile.aggression;
      raiseAmount = Math.max(minRaise, Math.floor(potRaise));
      raiseAmount = Math.min(raiseAmount, player.chips + player.currentBet);
    } else if (validActions.includes('call')) {
      action = 'call';
    } else {
      action = 'check';
    }
  } else if (adjustedStrength >= profile.callThreshold) {
    // Medium hand
    if (toCall === 0) {
      // Can check or bet
      if (Math.random() < profile.aggression * 0.5 && validActions.includes('raise')) {
        action = 'raise';
        raiseAmount = getMinRaiseAmount(state);
      } else {
        action = 'check';
      }
    } else if (potOdds <= adjustedStrength || Math.random() > profile.foldToRaise) {
      action = 'call';
    } else {
      action = 'fold';
    }
  } else {
    // Weak hand
    if (toCall === 0) {
      // Bluff opportunity
      if (Math.random() < profile.bluffFreq && validActions.includes('raise')) {
        action = 'raise';
        raiseAmount = getMinRaiseAmount(state);
      } else {
        action = 'check';
      }
    } else if (Math.random() < profile.bluffFreq && validActions.includes('raise') && toCall < state.pot * 0.3) {
      action = 'raise';
      raiseAmount = getMinRaiseAmount(state);
    } else if (potOdds < adjustedStrength * 0.5 && Math.random() > profile.foldToRaise) {
      action = 'call';
    } else {
      action = 'fold';
    }
  }

  // Pre-flop adjustments
  if (isPreflop) {
    if (strength < profile.vpip * 0.8 && action !== 'fold') {
      if (toCall > 0) action = 'fold';
      else action = 'check';
    }
  }

  // Ensure action is valid
  if (!validActions.includes(action)) {
    if (validActions.includes('check')) action = 'check';
    else if (validActions.includes('call')) action = 'call';
    else action = 'fold';
  }

  const thinkTime = getThinkTime(player.personality, action, isPreflop);

  return { action, raiseAmount, thinkTime };
}

function getThinkTime(personality: AIPersonality, action: PlayerAction, isPreflop: boolean): number {
  const base: Record<AIPersonality, number> = {
    tag: 1500, lag: 800, rock: 2000, maniac: 500, station: 1200,
  };

  let time = base[personality];

  if (action === 'raise' || action === 'all_in') time *= 1.3;
  if (action === 'fold') time *= 0.7;
  if (isPreflop) time *= 0.8;

  // Add randomness
  time *= 0.7 + Math.random() * 0.6;

  return Math.round(time);
}

export function getPersonalityDescription(personality: AIPersonality): string {
  const descriptions: Record<AIPersonality, string> = {
    tag: 'Tight-Aggressive — Plays solid, premium hands with aggressive betting',
    lag: 'Loose-Aggressive — Wide range, frequent bluffs and pressure',
    rock: 'Tight-Passive — Only plays premium hands, rarely bluffs',
    maniac: 'Maniac — Extremely loose, bets and raises constantly',
    station: 'Calling Station — Calls everything, rarely folds or raises',
  };
  return descriptions[personality];
}

export function getPersonalityColor(personality: AIPersonality): string {
  const colors: Record<AIPersonality, string> = {
    tag: '#4ade80', lag: '#f97316', rock: '#64748b',
    maniac: '#ef4444', station: '#a78bfa',
  };
  return colors[personality];
}
