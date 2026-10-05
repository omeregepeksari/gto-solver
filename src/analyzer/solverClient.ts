// Main-thread handle on the solver worker.
//
// Multithreading: the rayon thread pool is started here on the page (some browsers can't create
// workers from inside a worker), then the compiled module and its shared memory are handed to the
// solver worker, which joins the same pool. Without cross-origin isolation we fall back to the
// single-threaded build.

import type { FromWorker, NodeData, SolveParams, ToWorker } from './solverTypes';

type MtModule = typeof import('../../public/solver-mt/poker_royale_solver.js');

/**
 * The multithreaded build lives in public/ and is loaded unbundled: bundling it would drag app
 * code into the thread workers. The worker is sent the same URL so both load the same file.
 */
const MT_MODULE_URL = `${import.meta.env.BASE_URL}solver-mt/poker_royale_solver.js`;

type Listener = (msg: FromWorker) => void;

let worker: Worker | null = null;
let listener: Listener | null = null;
let nextRequestId = 1;
const pending = new Map<number, { resolve: (d: NodeData) => void; reject: (e: Error) => void }>();

let mtSetup: Promise<Extract<ToWorker, { type: 'init' }>['mt']> | null = null;

async function startThreadPool() {
  if (!self.crossOriginIsolated) return null;
  try {
    const url = new URL(MT_MODULE_URL, location.href).href;
    const mt: MtModule = await import(/* @vite-ignore */ url);
    const module = await WebAssembly.compileStreaming(fetch(url.replace(/\.js$/, '_bg.wasm')));
    const exports = await mt.default({ module_or_path: module });
    const threads = Math.max(1, navigator.hardwareConcurrency || 4);
    await mt.initThreadPool(threads);
    return { module, memory: exports.memory as WebAssembly.Memory, threads, url };
  } catch (err) {
    console.warn('Could not start solver threads, using a single thread', err);
    return null;
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  worker = w;
  w.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if (msg.type === 'node') {
      pending.get(msg.requestId)?.resolve(msg.data);
      pending.delete(msg.requestId);
    } else if (msg.type === 'error' && msg.requestId !== undefined) {
      pending.get(msg.requestId)?.reject(new Error(msg.message));
      pending.delete(msg.requestId);
    } else {
      listener?.(msg);
    }
  };
  w.onerror = e => listener?.({ type: 'error', message: e.message || 'Solver failed to load' });
  // Messages sent before init is processed simply wait in the worker until the module is ready.
  mtSetup ??= startThreadPool();
  void mtSetup.then(mt => w.postMessage({ type: 'init', mt } satisfies ToWorker));
  return w;
}

const send = (msg: ToWorker) => getWorker().postMessage(msg);

export function startSolve(params: SolveParams, onMessage: Listener) {
  listener = onMessage;
  send({ type: 'solve', params });
}

/** Ask the solver to stop after the current iteration (results are still produced). */
export function stopSolve() {
  send({ type: 'stop' });
}

/** Stop and ignore whatever the current solve produces. */
export function cancelSolve() {
  listener = null;
  stopSolve();
}

export function fetchNode(history: number[]): Promise<NodeData> {
  const requestId = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    send({ type: 'node', requestId, history });
  });
}
