export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type HandRank =
  | 'high_card'
  | 'one_pair'
  | 'two_pair'
  | 'three_of_a_kind'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'four_of_a_kind'
  | 'straight_flush'
  | 'royal_flush';

export interface EvaluatedHand {
  rank: HandRank;
  score: number;
  cards: Card[];
  description: string;
}

export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'hand_complete';

export type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'all_in';

export type AIPersonality = 'tag' | 'lag' | 'rock' | 'maniac' | 'station';

export interface Player {
  id: string;
  name: string;
  chips: number;
  holeCards: Card[];
  currentBet: number;
  totalBetThisHand: number;
  isFolded: boolean;
  isAllIn: boolean;
  isHuman: boolean;
  personality?: AIPersonality;
  seatIndex: number;
  lastAction?: PlayerAction;
  hasActedThisRound: boolean;
}

export interface HandHistoryEntry {
  handNumber: number;
  winner: string;
  pot: number;
  winningHand: string;
  players: string[];
  timestamp: number;
}

export interface GameSettings {
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  numOpponents: number;
  speed: 'slow' | 'normal' | 'fast' | 'turbo';
  showHints: boolean;
  tutorialMode: boolean;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  communityCards: Card[];
  deck: Card[];
  pot: number;
  sidePots: { amount: number; eligiblePlayerIds: string[] }[];
  currentBet: number;
  minRaise: number;
  dealerIndex: number;
  activePlayerIndex: number;
  handNumber: number;
  winners: { playerId: string; amount: number; hand?: EvaluatedHand }[];
  lastAction?: { playerId: string; action: PlayerAction; amount?: number };
  message: string;
}

export interface PlayerStats {
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
  totalWinnings: number;
  folds: number;
  raises: number;
  calls: number;
  allIns: number;
}
