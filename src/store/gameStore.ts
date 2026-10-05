import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameSettings, GameState, HandHistoryEntry, PlayerAction, PlayerStats } from '../types';
import { createInitialGame, processAction, startNewHand } from '../engine/gameEngine';
import { getAIDecision } from '../ai/aiPlayer';

const DEFAULT_SETTINGS: GameSettings = {
  smallBlind: 5,
  bigBlind: 10,
  startingChips: 1000,
  numOpponents: 4,
  speed: 'normal',
  showHints: true,
  tutorialMode: false,
};

const SPEED_DELAYS: Record<GameSettings['speed'], number> = {
  slow: 2000,
  normal: 1000,
  fast: 400,
  turbo: 100,
};

interface GameStore {
  gameState: GameState;
  settings: GameSettings;
  screen: 'menu' | 'setup' | 'game' | 'stats' | 'analyzer';
  stats: PlayerStats;
  handHistory: HandHistoryEntry[];
  isProcessingAI: boolean;
  showTutorial: boolean;
  tutorialStep: number;
  raiseAmount: number;

  setScreen: (screen: GameStore['screen']) => void;
  updateSettings: (settings: Partial<GameSettings>) => void;
  startGame: () => void;
  dealHand: () => void;
  playerAction: (action: PlayerAction, amount?: number) => void;
  setRaiseAmount: (amount: number) => void;
  nextHand: () => void;
  toggleTutorial: () => void;
  nextTutorialStep: () => void;
  resetStats: () => void;
  processAITurns: () => void;
  recordHandResult: (state: GameState) => void;
}

const initialStats: PlayerStats = {
  handsPlayed: 0,
  handsWon: 0,
  biggestPot: 0,
  totalWinnings: 0,
  folds: 0,
  raises: 0,
  calls: 0,
  allIns: 0,
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      gameState: createInitialGame(DEFAULT_SETTINGS),
      settings: DEFAULT_SETTINGS,
      screen: 'menu',
      stats: initialStats,
      handHistory: [],
      isProcessingAI: false,
      showTutorial: false,
      tutorialStep: 0,
      raiseAmount: 20,

      setScreen: (screen) => set({ screen }),

      updateSettings: (newSettings) =>
        set((s) => ({ settings: { ...s.settings, ...newSettings } })),

      startGame: () => {
        const { settings } = get();
        set({
          gameState: createInitialGame(settings),
          screen: 'game',
          showTutorial: settings.tutorialMode,
          tutorialStep: 0,
        });
      },

      dealHand: () => {
        const { settings, gameState } = get();
        const newState = startNewHand(gameState, settings);
        set({ gameState: newState, raiseAmount: settings.bigBlind * 2 });
        setTimeout(() => get().processAITurns(), 100);
      },

      playerAction: (action, amount) => {
        const { gameState, settings, stats } = get();
        const newState = processAction(gameState, 'human', action, amount, settings);

        const statUpdate = { ...stats };
        if (action === 'fold') statUpdate.folds++;
        else if (action === 'raise') statUpdate.raises++;
        else if (action === 'call') statUpdate.calls++;
        else if (action === 'all_in') statUpdate.allIns++;

        set({ gameState: newState, stats: statUpdate });

        if (newState.phase === 'hand_complete') {
          get().recordHandResult(newState);
        } else {
          setTimeout(() => get().processAITurns(), 100);
        }
      },

      setRaiseAmount: (amount) => set({ raiseAmount: amount }),

      nextHand: () => {
        const { gameState, settings } = get();
        const human = gameState.players.find(p => p.isHuman);
        if (!human || human.chips <= 0) {
          set({ screen: 'menu', gameState: createInitialGame(settings) });
          return;
        }
        get().dealHand();
      },

      toggleTutorial: () => set((s) => ({ showTutorial: !s.showTutorial, tutorialStep: 0 })),

      nextTutorialStep: () => set((s) => ({ tutorialStep: s.tutorialStep + 1 })),

      resetStats: () => set({ stats: initialStats, handHistory: [] }),

      recordHandResult: (state: GameState) => {
        const { stats, handHistory } = get();
        const humanWon = state.winners.some(w => w.playerId === 'human');
        const potWon = state.winners.find(w => w.playerId === 'human')?.amount ?? 0;
        const totalPot = state.winners.reduce((sum, w) => sum + w.amount, 0);

        set({
          stats: {
            ...stats,
            handsPlayed: stats.handsPlayed + 1,
            handsWon: stats.handsWon + (humanWon ? 1 : 0),
            biggestPot: Math.max(stats.biggestPot, totalPot),
            totalWinnings: stats.totalWinnings + potWon,
          },
          handHistory: [{
            handNumber: state.handNumber,
            winner: state.winners.map(w => {
              const p = state.players.find(pl => pl.id === w.playerId);
              return p?.name ?? w.playerId;
            }).join(', '),
            pot: totalPot,
            winningHand: state.winners[0]?.hand?.description ?? 'Last standing',
            players: state.players.map(p => p.name),
            timestamp: Date.now(),
          }, ...handHistory].slice(0, 50),
        });
      },

      processAITurns: () => {
        const { gameState, settings, isProcessingAI } = get();
        if (isProcessingAI) return;

        const activePlayer = gameState.players[gameState.activePlayerIndex];
        if (!activePlayer || activePlayer.isHuman || gameState.phase === 'hand_complete' || gameState.phase === 'waiting') {
          return;
        }

        set({ isProcessingAI: true });
        const decision = getAIDecision(gameState, activePlayer.id);
        const delay = Math.max(decision.thinkTime, SPEED_DELAYS[settings.speed]);

        setTimeout(() => {
          const currentState = get().gameState;
          const active = currentState.players[currentState.activePlayerIndex];
          if (!active || active.isHuman) {
            set({ isProcessingAI: false });
            return;
          }

          const newState = processAction(
            currentState,
            active.id,
            decision.action,
            decision.raiseAmount,
            settings
          );

          set({ gameState: newState, isProcessingAI: false });

          if (newState.phase === 'hand_complete') {
            get().recordHandResult(newState);
          } else {
            setTimeout(() => get().processAITurns(), 100);
          }
        }, delay);
      },
    }),
    {
      name: 'poker-royale-storage',
      partialize: (state) => ({
        stats: state.stats,
        handHistory: state.handHistory,
        settings: state.settings,
      }),
    }
  )
);

export { DEFAULT_SETTINGS, SPEED_DELAYS };
