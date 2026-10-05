export interface SolveParams {
  /** [OOP, IP] in solver range syntax, e.g. "QQ+,AKs,AQo:0.5". */
  ranges: [string, string];
  /** 3–5 cards, e.g. "Td9d6h". The solve starts on that street. */
  board: string;
  pot: number;
  stack: number;
  /** [bet sizes, raise sizes] per street, e.g. ["33%,75%", "3x"]. */
  sizes: { flop: [string, string]; turn: [string, string]; river: [string, string] };
  /** Stop once exploitability is below this % of the starting pot. */
  targetPct: number;
  maxIters: number;
  /** Offer all-in when the biggest bet is at most this many pots (0 = only when sizes reach it). */
  addAllinThreshold: number;
  /** Actions actually played, as tree codes ("X,B18,C,…"), so their exact sizes are in the tree. */
  line: string;
}

export interface NodeData {
  kind: 'action' | 'chance' | 'terminal';
  /** 0 = OOP, 1 = IP; -1 when nobody acts. */
  player: number;
  board: number[];
  /** Chips each player has put in since the flop (or whichever street the solve starts on). */
  bets: [number, number];
  pot: number;
  stack: number;
  /** "F", "X", "C", "B<chips>", "R<chips>", "A<chips>" — chips are the total bet this street. */
  actions: string[];
  possibleCards: number[];
  /** Per hand, indexed like privateCards[player]. */
  weights: [Float32Array, Float32Array];
  equity: [Float32Array, Float32Array] | null;
  ev: [Float32Array, Float32Array] | null;
  /** Player to act only, laid out [action * numHands + hand]. */
  strategy: Float32Array | null;
  actionEvs: Float32Array | null;
}

export type ToWorker =
  | {
      type: 'init';
      /** Shared multithreaded module (`url` = its JS glue), or null for the single-threaded build. */
      mt: { module: WebAssembly.Module; memory: WebAssembly.Memory; threads: number; url: string } | null;
    }
  | { type: 'solve'; params: SolveParams }
  | { type: 'stop' }
  | { type: 'node'; requestId: number; history: number[] };

export type FromWorker =
  | { type: 'progress'; iteration: number; exploitPct: number; elapsedMs: number }
  | {
      type: 'solved';
      iterations: number;
      exploitPct: number;
      elapsedMs: number;
      memoryMB: number;
      threads: number;
      privateCards: [Uint8Array, Uint8Array];
    }
  | { type: 'node'; requestId: number; data: NodeData }
  | { type: 'error'; message: string; requestId?: number };
