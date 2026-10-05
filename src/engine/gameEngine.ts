import type { AIPersonality, Card, GamePhase, GameSettings, GameState, Player, PlayerAction } from '../types';
import { createDeck, shuffleDeck } from './card';
import { evaluateBestHand } from './handEvaluator';

const AI_NAMES: Record<AIPersonality, string[]> = {
  tag: ['Alex "The Grinder"', 'Sarah Chen', 'Marcus Webb'],
  lag: ['Jake "Wild Card"', 'Luna Reyes', 'Tyler Storm'],
  rock: ['Frank "The Rock"', 'Helen Park', 'George Mills'],
  maniac: ['Ricky "Chaos"', 'Blaze Hunter', 'Viper Kane'],
  station: ['Dave "The Caller"', 'Molly Sweet', 'Ben Easy'],
};

const PERSONALITIES: AIPersonality[] = ['tag', 'lag', 'rock', 'maniac', 'station'];

export function createInitialGame(settings: GameSettings, humanName = 'You'): GameState {
  const players: Player[] = [];

  players.push({
    id: 'human',
    name: humanName,
    chips: settings.startingChips,
    holeCards: [],
    currentBet: 0,
    totalBetThisHand: 0,
    isFolded: false,
    isAllIn: false,
    isHuman: true,
    seatIndex: 0,
    hasActedThisRound: false,
  });

  const usedNames = new Set<string>();
  for (let i = 0; i < settings.numOpponents; i++) {
    const personality = PERSONALITIES[i % PERSONALITIES.length];
    const names = AI_NAMES[personality];
    let name = names[i % names.length];
    while (usedNames.has(name)) {
      name = `${name} ${i + 1}`;
    }
    usedNames.add(name);

    players.push({
      id: `ai-${i}`,
      name,
      chips: settings.startingChips,
      holeCards: [],
      currentBet: 0,
      totalBetThisHand: 0,
      isFolded: false,
      isAllIn: false,
      isHuman: false,
      personality,
      seatIndex: i + 1,
      hasActedThisRound: false,
    });
  }

  return {
    phase: 'waiting',
    players,
    communityCards: [],
    deck: [],
    pot: 0,
    sidePots: [],
    currentBet: 0,
    minRaise: settings.bigBlind,
    dealerIndex: -1,
    activePlayerIndex: -1,
    handNumber: 0,
    winners: [],
    message: 'Welcome to Poker Royale! Press "Deal" to start.',
  };
}

export function startNewHand(state: GameState, settings: GameSettings): GameState {
  const activePlayers = state.players.filter(p => p.chips > 0);
  if (activePlayers.length < 2) {
    return { ...state, message: 'Game over! Not enough players with chips.' };
  }

  const dealerIndex = state.dealerIndex < 0
    ? 0
    : (state.dealerIndex + 1) % state.players.length;

  // Skip players with no chips for dealer
  let actualDealer = dealerIndex;
  while (state.players[actualDealer].chips <= 0) {
    actualDealer = (actualDealer + 1) % state.players.length;
  }

  const deck = shuffleDeck(createDeck());
  let deckIndex = 0;

  const players = state.players.map(p => ({
    ...p,
    holeCards: [] as Card[],
    currentBet: 0,
    totalBetThisHand: 0,
    isFolded: p.chips <= 0,
    isAllIn: false,
    lastAction: undefined,
    hasActedThisRound: false,
  }));

  // Deal hole cards
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < players.length; i++) {
      const idx = (actualDealer + 1 + i) % players.length;
      if (!players[idx].isFolded) {
        players[idx].holeCards.push(deck[deckIndex++]);
      }
    }
  }

  // Post blinds
  const sbIndex = getNextActivePlayer(players, actualDealer);
  const bbIndex = getNextActivePlayer(players, sbIndex);

  let pot = 0;
  pot += postBlind(players, sbIndex, settings.smallBlind);
  pot += postBlind(players, bbIndex, settings.bigBlind);

  const currentBet = settings.bigBlind;
  const activePlayerIndex = getNextActivePlayer(players, bbIndex);

  return {
    ...state,
    phase: 'preflop',
    players,
    communityCards: [],
    deck: deck.slice(deckIndex),
    pot,
    sidePots: [],
    currentBet,
    minRaise: settings.bigBlind,
    dealerIndex: actualDealer,
    activePlayerIndex,
    handNumber: state.handNumber + 1,
    winners: [],
    lastAction: undefined,
    message: `Hand #${state.handNumber + 1} — Your turn`,
  };
}

function postBlind(players: Player[], index: number, amount: number): number {
  const player = players[index];
  const actual = Math.min(amount, player.chips);
  player.chips -= actual;
  player.currentBet = actual;
  player.totalBetThisHand = actual;
  if (player.chips === 0) player.isAllIn = true;
  return actual;
}

function getNextActivePlayer(players: Player[], fromIndex: number): number {
  let idx = (fromIndex + 1) % players.length;
  let count = 0;
  while ((players[idx].isFolded || players[idx].isAllIn) && count < players.length) {
    idx = (idx + 1) % players.length;
    count++;
  }
  return idx;
}

function getActivePlayers(players: Player[]): Player[] {
  return players.filter(p => !p.isFolded && !p.isAllIn);
}

function countActivePlayers(players: Player[]): number {
  return players.filter(p => !p.isFolded).length;
}

function allPlayersActed(players: Player[], currentBet: number): boolean {
  return players
    .filter(p => !p.isFolded && !p.isAllIn)
    .every(p => p.hasActedThisRound && p.currentBet === currentBet);
}

export function processAction(
  state: GameState,
  playerId: string,
  action: PlayerAction,
  raiseAmount?: number,
  settings?: GameSettings
): GameState {
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1 || playerIndex !== state.activePlayerIndex) return state;

  const players = state.players.map(p => ({ ...p, holeCards: [...p.holeCards] }));
  const player = players[playerIndex];
  let pot = state.pot;
  let currentBet = state.currentBet;
  let minRaise = state.minRaise;
  let message = state.message;

  const toCall = currentBet - player.currentBet;

  switch (action) {
    case 'fold':
      player.isFolded = true;
      player.lastAction = 'fold';
      message = `${player.name} folds`;
      break;

    case 'check':
      if (toCall > 0) return state;
      player.lastAction = 'check';
      player.hasActedThisRound = true;
      message = `${player.name} checks`;
      break;

    case 'call': {
      const amount = Math.min(toCall, player.chips);
      player.chips -= amount;
      player.currentBet += amount;
      player.totalBetThisHand += amount;
      pot += amount;
      player.lastAction = 'call';
      player.hasActedThisRound = true;
      if (player.chips === 0) player.isAllIn = true;
      message = amount === 0 ? `${player.name} checks` : `${player.name} calls $${amount}`;
      break;
    }

    case 'raise':
    case 'all_in': {
      let totalBet: number;
      if (action === 'all_in') {
        totalBet = player.currentBet + player.chips;
      } else {
        totalBet = raiseAmount ?? currentBet + minRaise;
        totalBet = Math.min(totalBet, player.currentBet + player.chips);
      }

      const additional = totalBet - player.currentBet;
      const raiseSize = totalBet - currentBet;

      player.chips -= additional;
      pot += additional;
      player.currentBet = totalBet;
      player.totalBetThisHand += additional;

      if (raiseSize > 0) {
        minRaise = Math.max(minRaise, raiseSize);
        currentBet = totalBet;
        // Reset acted status for other players who need to respond
        for (const p of players) {
          if (p.id !== player.id && !p.isFolded && !p.isAllIn) {
            p.hasActedThisRound = false;
          }
        }
      }

      player.lastAction = action;
      player.hasActedThisRound = true;
      if (player.chips === 0) player.isAllIn = true;
      message = action === 'all_in'
        ? `${player.name} goes ALL IN $${totalBet}!`
        : `${player.name} raises to $${totalBet}`;
      break;
    }
  }

  if (action === 'fold') {
    player.hasActedThisRound = true;
  }

  const lastAction = { playerId, action, amount: player.currentBet };

  // Check if only one player left
  if (countActivePlayers(players) === 1) {
    return resolveHand({
      ...state,
      players,
      pot,
      currentBet,
      minRaise,
      lastAction,
      message,
    });
  }

  // Check if betting round is complete
  if (allPlayersActed(players, currentBet) && getActivePlayers(players).length <= 1) {
    return advancePhase({
      ...state,
      players,
      pot,
      currentBet,
      minRaise,
      lastAction,
      message,
    }, settings);
  }

  if (allPlayersActed(players, currentBet)) {
    return advancePhase({
      ...state,
      players,
      pot,
      currentBet,
      minRaise,
      lastAction,
      message,
    }, settings);
  }

  // Move to next player
  let nextIndex = getNextActivePlayer(players, playerIndex);
  // Skip players who have already matched the bet and acted
  let safety = 0;
  while (
    players[nextIndex].hasActedThisRound &&
    players[nextIndex].currentBet === currentBet &&
    safety < players.length
  ) {
    nextIndex = getNextActivePlayer(players, nextIndex);
    safety++;
  }

  return {
    ...state,
    players,
    pot,
    currentBet,
    minRaise,
    activePlayerIndex: nextIndex,
    lastAction,
    message,
  };
}

function advancePhase(state: GameState, settings?: GameSettings): GameState {
  const players = state.players.map(p => ({
    ...p,
    currentBet: 0,
    hasActedThisRound: false,
  }));

  let { phase, communityCards, deck } = state;
  let deckIndex = 0;

  const nextPhase: Record<GamePhase, GamePhase> = {
    waiting: 'preflop',
    preflop: 'flop',
    flop: 'turn',
    turn: 'river',
    river: 'showdown',
    showdown: 'hand_complete',
    hand_complete: 'waiting',
  };

  phase = nextPhase[phase];

  if (phase === 'flop') {
    communityCards = [...state.communityCards, deck[deckIndex++], deck[deckIndex++], deck[deckIndex++]];
  } else if (phase === 'turn' || phase === 'river') {
    communityCards = [...state.communityCards, deck[deckIndex++]];
  }

  if (phase === 'showdown' || countActivePlayers(players) <= 1) {
    return resolveHand({ ...state, players, communityCards, deck: deck.slice(deckIndex), phase: 'showdown' });
  }

  // Reset betting
  const firstToAct = getNextActivePlayer(players, state.dealerIndex);

  const phaseMessages: Record<string, string> = {
    flop: 'The Flop',
    turn: 'The Turn',
    river: 'The River',
  };

  return {
    ...state,
    phase,
    players,
    communityCards,
    deck: deck.slice(deckIndex),
    currentBet: 0,
    minRaise: settings?.bigBlind ?? state.minRaise,
    activePlayerIndex: firstToAct,
    message: phaseMessages[phase] ?? 'New betting round',
  };
}

function resolveHand(state: GameState): GameState {
  const activePlayers = state.players.filter(p => !p.isFolded);

  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    winner.chips += state.pot;
    return {
      ...state,
      phase: 'hand_complete',
      winners: [{ playerId: winner.id, amount: state.pot }],
      pot: 0,
      activePlayerIndex: -1,
      message: `${winner.name} wins $${state.pot}!`,
    };
  }

  // Showdown — evaluate hands
  const evaluated = activePlayers.map(p => ({
    player: p,
    hand: evaluateBestHand(p.holeCards, state.communityCards),
  }));

  evaluated.sort((a, b) => b.hand.score - a.hand.score);
  const bestScore = evaluated[0].hand.score;
  const winners = evaluated.filter(e => e.hand.score === bestScore);

  const winAmount = Math.floor(state.pot / winners.length);
  const winnerResults = winners.map(w => {
    w.player.chips += winAmount;
    return {
      playerId: w.player.id,
      amount: winAmount,
      hand: w.hand,
    };
  });

  const winnerNames = winners.map(w => w.player.name).join(', ');
  const handDesc = winners[0].hand.description;

  return {
    ...state,
    phase: 'hand_complete',
    winners: winnerResults,
    pot: 0,
    activePlayerIndex: -1,
    message: `${winnerNames} wins $${winAmount} with ${handDesc}!`,
  };
}

export function getValidActions(state: GameState, playerId: string): PlayerAction[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.isFolded || player.isAllIn) return [];

  const toCall = state.currentBet - player.currentBet;
  const actions: PlayerAction[] = ['fold'];

  if (toCall === 0) {
    actions.push('check');
  } else {
    actions.push('call');
  }

  if (player.chips > toCall) {
    actions.push('raise');
  }

  if (player.chips > 0) {
    actions.push('all_in');
  }

  return actions;
}

export function getCallAmount(state: GameState, playerId: string): number {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return 0;
  return Math.min(state.currentBet - player.currentBet, player.chips);
}

export function getMinRaiseAmount(state: GameState): number {
  return state.currentBet + state.minRaise;
}

export function getMaxRaiseAmount(state: GameState, playerId: string): number {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return 0;
  return player.currentBet + player.chips;
}
