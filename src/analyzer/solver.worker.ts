/// <reference lib="webworker" />
// Runs the WASM solver off the main thread so the UI stays responsive while it crunches.

import type { Solver } from '../../solver/pkg/poker_royale_solver.js';
import type { NodeData, SolveParams, ToWorker, FromWorker } from './solverTypes';

type SolverModule = typeof import('../../solver/pkg/poker_royale_solver.js');

let solver: Solver | null = null;
let stopRequested = false;
const post = (msg: FromWorker, transfer: Transferable[] = []) => self.postMessage(msg, transfer);
const tick = () => new Promise(r => setTimeout(r, 0));

let resolveMod!: (m: { Solver: SolverModule['Solver']; threads: number }) => void;
const mod = new Promise<{ Solver: SolverModule['Solver']; threads: number }>(r => (resolveMod = r));

/**
 * The page sends either a compiled multithreaded module plus its shared memory (the thread pool
 * was started on the page — some browsers can't spawn workers from inside a worker), or nothing,
 * in which case we use the single-threaded build.
 */
async function load(
  mt: { module: WebAssembly.Module; memory: WebAssembly.Memory; threads: number; url: string } | null,
) {
  if (mt) {
    try {
      const m: typeof import('../../public/solver-mt/poker_royale_solver.js') = await import(/* @vite-ignore */ mt.url);
      await m.default({ module_or_path: mt.module, memory: mt.memory });
      return resolveMod({ Solver: m.Solver as unknown as SolverModule['Solver'], threads: mt.threads });
    } catch (err) {
      console.warn('Multithreaded solver failed to start, using single thread', err);
    }
  }
  const st = await import('../../solver/pkg/poker_royale_solver.js');
  await st.default();
  resolveMod({ Solver: st.Solver, threads: 1 });
}

/** Each solve gets a number; an older loop that sees a newer number quits quietly. */
let generation = 0;
let running: Promise<void> = Promise.resolve();

async function solve(p: SolveParams) {
  const gen = ++generation;
  stopRequested = true;
  await running; // let any previous solve unwind and free its memory
  if (gen !== generation) return;
  stopRequested = false;
  let done!: () => void;
  running = new Promise(r => (done = r));
  try {
    await runSolve(p, gen);
  } finally {
    done();
  }
}

async function runSolve(p: SolveParams, gen: number) {
  const { Solver, threads } = await mod;

  solver?.free();
  solver = null;

  const s = new Solver(
    p.ranges[0], p.ranges[1], p.board, p.pot, p.stack,
    p.sizes.flop[0], p.sizes.flop[1],
    p.sizes.turn[0], p.sizes.turn[1],
    p.sizes.river[0], p.sizes.river[1],
    p.addAllinThreshold,
  );

  const [mem, memCompressed] = s.memory_usage();
  // WASM can address 4GB; stay well under it so the browser doesn't kill the tab.
  const compress = mem > 1.2e9;
  if ((compress ? memCompressed : mem) > 3e9) {
    s.free();
    throw new Error(
      `This spot needs ${(memCompressed / 1e9).toFixed(1)}GB of memory — too big for the browser. ` +
      'Use fewer bet sizes or narrower ranges.',
    );
  }
  s.allocate(compress);

  const target = (p.pot * p.targetPct) / 100;
  const start = performance.now();
  let exploit = Infinity;
  let checkedAt = -1;
  let i = 0;
  while (i < p.maxIters) {
    s.solve_step(i);
    i++;
    // Exploitability costs about one iteration, so only check it now and then.
    if (i % (i <= 20 ? 5 : 10) === 0) {
      exploit = s.exploitability();
      checkedAt = i;
    }
    post({ type: 'progress', iteration: i, exploitPct: (100 * exploit) / p.pot, elapsedMs: performance.now() - start });
    if (exploit <= target) break;
    await tick(); // let a "stop" message in
    if (stopRequested) break;
  }
  if (gen !== generation) {
    s.free();
    return;
  }
  if (checkedAt !== i) exploit = s.exploitability();
  s.finalize();
  solver = s;

  post({
    type: 'solved',
    iterations: i,
    exploitPct: (100 * exploit) / p.pot,
    elapsedMs: performance.now() - start,
    memoryMB: (compress ? memCompressed : mem) / 1e6,
    threads,
    privateCards: [s.private_cards(0), s.private_cards(1)],
  });
}

function node(history: number[]): NodeData {
  const s = solver;
  if (!s) throw new Error('Nothing solved yet');
  s.apply_history(Uint32Array.from(history));
  const kindCode = s.node_kind();
  const kind = kindCode === 0 ? 'action' : kindCode === 1 ? 'chance' : 'terminal';
  const bets = Array.from(s.total_bet_amount()) as [number, number];
  const base: NodeData = {
    kind,
    player: kind === 'action' ? s.current_player() : -1,
    board: Array.from(s.current_board()),
    bets,
    pot: s.starting_pot() + bets[0] + bets[1],
    stack: s.effective_stack(),
    actions: [],
    possibleCards: [],
    weights: [s.weights(0), s.weights(1)],
    equity: null,
    ev: null,
    strategy: null,
    actionEvs: null,
  };
  if (kind === 'terminal') return base;
  base.equity = [s.equity(0), s.equity(1)];
  base.ev = [s.expected_values(0), s.expected_values(1)];
  if (kind === 'chance') {
    base.possibleCards = Array.from(s.possible_cards());
    return base;
  }
  base.actions = s.actions().split(',');
  base.strategy = s.strategy();
  base.actionEvs = s.action_evs();
  return base;
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      await load(msg.mt);
    } else if (msg.type === 'stop') {
      stopRequested = true;
    } else if (msg.type === 'solve') {
      await solve(msg.params);
    } else if (msg.type === 'node') {
      post({ type: 'node', requestId: msg.requestId, data: node(msg.history) });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A Rust panic surfaces as "unreachable"; the instance is unusable after that.
    if (message.includes('unreachable')) solver = null;
    post({ type: 'error', message, requestId: msg.type === 'node' ? msg.requestId : undefined });
  }
};
