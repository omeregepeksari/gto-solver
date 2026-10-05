import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cardStr, comboStr } from './cards';
import { buildSpot, type Position, type PotType, type Spot } from './spots';
import { comboKey, parseRange } from './range';
import {
  describeAction,
  gradeDecision,
  heroView,
  type ActionInfo,
  type Decision,
} from './analysis';
import { cancelSolve, fetchNode, startSolve, stopSolve } from './solverClient';
import type { NodeData, SolveParams } from './solverTypes';

export type Street = 'flop' | 'turn' | 'river';
export type Preset = 'fast' | 'standard' | 'detailed';

/** Bet-size trees. Every extra size multiplies solve time, so "fast" keeps one size per street. */
export const PRESETS: Record<
  Preset,
  { label: string; hint: string; sizes: SolveParams['sizes']; targetPct: number; addAllinThreshold: number }
> = {
  fast: {
    label: 'Fast',
    hint: 'One bet size per street; raises are all-in. About a minute from the flop for wide ranges, seconds from the turn.',
    sizes: { flop: ['33%', 'a'], turn: ['66%', 'a'], river: ['75%', 'a'] },
    targetPct: 2,
    addAllinThreshold: 0,
  },
  standard: {
    label: 'Standard',
    hint: 'Small and big flop bets plus real-sized flop raises. Several minutes from the flop.',
    sizes: { flop: ['33%,75%', '3x'], turn: ['66%', 'a'], river: ['75%', 'a'] },
    targetPct: 1.5,
    addAllinThreshold: 0,
  },
  detailed: {
    label: 'Detailed',
    hint: 'Three sizes including overbets, plus raises. Meant for turn and river spots — far too slow from the flop.',
    sizes: { flop: ['33%,75%,125%', '3x'], turn: ['33%,75%,150%', '3x'], river: ['33%,75%,150%', '3x'] },
    targetPct: 0.5,
    addAllinThreshold: 1.5,
  },
};

export interface Step {
  node: NodeData;
  actions: ActionInfo[];
  /** Pot at the start of the street this node is on. */
  streetPot: number;
  /** Each player's total investment at the start of this street. */
  streetBets: [number, number];
  /** What was played here (action index or dealt card id), once the user moves on. */
  chosen?: number;
  /** Grade for the hero's choice at this node. */
  decision?: Decision;
}

interface Solved {
  spot: Spot;
  params: SolveParams;
  privateCards: [Uint8Array, Uint8Array];
  heroHandIdx: number;
  heroAddedToRange: boolean;
  exploitPct: number;
  elapsedMs: number;
  iterations: number;
  threads: number;
}

interface AnalyzerStore {
  // ---- setup (persisted) ----
  heroPos: Position;
  villainPos: Position;
  potType: PotType;
  heroCards: [number | null, number | null];
  board: number[];
  preset: Preset;
  startStreet: Street;
  rangeOverride: [string | null, string | null];
  potOverride: number | null;
  stackOverride: number | null;

  // ---- solve / review (not persisted) ----
  status: 'setup' | 'solving' | 'review' | 'error';
  error: string | null;
  progress: { iteration: number; exploitPct: number; elapsedMs: number; target: number } | null;
  solved: Solved | null;
  steps: Step[];
  history: number[];
  busy: boolean;

  set: (patch: Partial<AnalyzerStore>) => void;
  currentSpot: () => Spot | string;
  solve: () => void;
  stop: () => void;
  cancel: () => void;
  backToSetup: () => void;
  choose: (choice: number) => Promise<void>;
  goTo: (stepIdx: number) => Promise<void>;
}

const BOARD_LEN: Record<Street, number> = { flop: 3, turn: 4, river: 5 };

function nextStep(node: NodeData, prev: Step | undefined): Step {
  const newStreet = !prev || node.board.length !== prev.node.board.length;
  const streetBets: [number, number] = newStreet ? [...node.bets] : prev!.streetBets;
  const streetPot = newStreet ? node.pot : prev!.streetPot;
  const toCall = Math.abs(node.bets[0] - node.bets[1]);
  return {
    node,
    streetBets,
    streetPot,
    actions: node.actions.map(code => describeAction(code, streetPot, toCall)),
  };
}

export const useAnalyzer = create<AnalyzerStore>()(
  persist(
    (set, get) => {
      /** Fetch the node after `history`, and auto-deal board cards the user already entered. */
      async function advance(history: number[], steps: Step[]) {
        let h = history;
        let s = steps;
        for (;;) {
          const node = await fetchNode(h);
          const step = nextStep(node, s[s.length - 1]);
          s = [...s, step];
          const nextCard = get().board[node.board.length];
          if (node.kind === 'chance' && nextCard !== undefined && node.possibleCards.includes(nextCard)) {
            step.chosen = nextCard;
            h = [...h, nextCard];
            continue;
          }
          break;
        }
        set({ history: h, steps: s });
      }

      return {
        heroPos: 'BTN',
        villainPos: 'BB',
        potType: 'srp',
        heroCards: [null, null],
        board: [],
        preset: 'fast',
        startStreet: 'flop',
        rangeOverride: [null, null],
        potOverride: null,
        stackOverride: null,

        status: 'setup',
        error: null,
        progress: null,
        solved: null,
        steps: [],
        history: [],
        busy: false,

        set: patch => set(patch),

        currentSpot: () => {
          const { heroPos, villainPos, potType, rangeOverride, potOverride, stackOverride } = get();
          const spot = buildSpot({ heroPos, villainPos, potType });
          if (typeof spot === 'string') return spot;
          return {
            ...spot,
            ranges: [rangeOverride[0] ?? spot.ranges[0], rangeOverride[1] ?? spot.ranges[1]],
            pot: potOverride ?? spot.pot,
            stack: stackOverride ?? spot.stack,
          };
        },

        solve: () => {
          const { heroCards, board, startStreet, preset } = get();
          const spot = get().currentSpot();
          if (typeof spot === 'string') return set({ status: 'error', error: spot });
          const [h1, h2] = heroCards;
          if (h1 === null || h2 === null) return set({ status: 'error', error: 'Pick your two hole cards.' });
          const need = BOARD_LEN[startStreet];
          if (board.length < need) return set({ status: 'error', error: `Enter at least ${need} board cards.` });

          // Make sure the hero's exact hand is in their range, so we can always show its strategy.
          // A tiny weight keeps the rest of the solution unchanged.
          const ranges: [string, string] = [...spot.ranges];
          const heroRange = parseRange(ranges[spot.hero]);
          if (typeof heroRange === 'string') return set({ status: 'error', error: `Your range: ${heroRange}` });
          const villainRange = parseRange(ranges[1 - spot.hero]);
          if (typeof villainRange === 'string') return set({ status: 'error', error: `Their range: ${villainRange}` });
          const heroAddedToRange = !(heroRange.get(comboKey(h1, h2))! > 0);
          if (heroAddedToRange) ranges[spot.hero] += `,${comboStr(h1, h2)}:0.02`;

          const p = PRESETS[preset];
          const params: SolveParams = {
            ranges,
            board: board.slice(0, need).map(cardStr).join(''),
            pot: spot.pot,
            stack: spot.stack,
            sizes: p.sizes,
            targetPct: p.targetPct,
            maxIters: 1000,
            addAllinThreshold: p.addAllinThreshold,
          };

          set({
            status: 'solving',
            error: null,
            progress: { iteration: 0, exploitPct: Infinity, elapsedMs: 0, target: p.targetPct },
            solved: null,
            steps: [],
            history: [],
          });

          startSolve(params, async msg => {
            if (msg.type === 'progress') {
              set({ progress: { ...msg, target: p.targetPct } });
            } else if (msg.type === 'error') {
              set({ status: 'error', error: msg.message });
            } else if (msg.type === 'solved') {
              const heroCardsOf = msg.privateCards[spot.hero];
              let heroHandIdx = -1;
              for (let i = 0; i < heroCardsOf.length / 2; i++) {
                const a = heroCardsOf[2 * i];
                const b = heroCardsOf[2 * i + 1];
                if ((a === h1 && b === h2) || (a === h2 && b === h1)) heroHandIdx = i;
              }
              set({
                solved: {
                  spot,
                  params,
                  privateCards: msg.privateCards,
                  heroHandIdx,
                  heroAddedToRange,
                  exploitPct: msg.exploitPct,
                  elapsedMs: msg.elapsedMs,
                  iterations: msg.iterations,
                  threads: msg.threads,
                },
              });
              try {
                await advance([], []);
                set({ status: 'review' });
              } catch (e) {
                set({ status: 'error', error: (e as Error).message });
              }
            }
          });
        },

        stop: () => stopSolve(),

        cancel: () => {
          cancelSolve();
          set({ status: 'setup', progress: null });
        },

        backToSetup: () => set({ status: 'setup', error: null }),

        choose: async choice => {
          const { steps, history, solved, busy } = get();
          if (busy || !solved) return;
          const last = steps[steps.length - 1];
          const updated: Step = { ...last, chosen: choice };
          if (last.node.kind === 'action' && last.node.player === solved.spot.hero) {
            const view = heroView(last.node, solved.spot.hero, solved.heroHandIdx, last.actions);
            if (view?.options) updated.decision = gradeDecision(view.options, choice, last.node.pot);
          }
          set({ busy: true });
          try {
            await advance([...history, choice], [...steps.slice(0, -1), updated]);
          } catch (e) {
            set({ status: 'error', error: (e as Error).message });
          } finally {
            set({ busy: false });
          }
        },

        goTo: async stepIdx => {
          const { steps, busy } = get();
          if (busy || stepIdx >= steps.length) return;
          const kept = steps.slice(0, stepIdx + 1);
          const target = { ...kept[stepIdx], chosen: undefined, decision: undefined };
          // History = every choice made before this step.
          const history = kept.slice(0, -1).map(s => s.chosen!);
          set({ busy: true });
          try {
            await fetchNode(history); // re-sync the solver's current node
            set({ steps: [...kept.slice(0, -1), target], history });
          } finally {
            set({ busy: false });
          }
        },
      };
    },
    {
      name: 'poker-royale-analyzer',
      partialize: s => ({
        heroPos: s.heroPos,
        villainPos: s.villainPos,
        potType: s.potType,
        heroCards: s.heroCards,
        board: s.board,
        preset: s.preset,
        startStreet: s.startStreet,
        rangeOverride: s.rangeOverride,
        potOverride: s.potOverride,
        stackOverride: s.stackOverride,
      }),
    },
  ),
);
