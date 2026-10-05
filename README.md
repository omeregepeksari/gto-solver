# Poker Royale

Premium Texas Hold'em poker — offline vs AI, with online multiplayer planned.

## Features

- **Texas Hold'em** — full rules with pre-flop, flop, turn, river, and showdown
- **5 AI personalities** — TAG, LAG, Rock, Maniac, Calling Station (modeled on pro play styles)
- **Premium UI** — casino-style felt table, card animations, gold accents
- **Hand hints** — real-time strength advice for learning
- **Tutorial mode** — step-by-step guide for beginners
- **Statistics** — win rate, action breakdown, hand history
- **Speed controls** — Slow, Normal, Fast, Turbo
- **Hand Analyzer (GTO solver)** — replay a hand you played and see what a solver does at every decision

## Getting Started

The Hand Analyzer's solver is Rust compiled to WebAssembly, so build it once first
(needs [Rust](https://rustup.rs) with the nightly toolchain, `rust-src`, the
`wasm32-unknown-unknown` target, and [wasm-pack](https://rustwasm.github.io/wasm-pack/)):

```bash
npm install
npm run wasm   # builds solver/pkg (single-threaded) and public/solver-mt (multithreaded)
npm run dev
```

Open http://localhost:5173 in your browser.

## Hand Analyzer

Enter a hand you played and the analyzer solves it, then walks you through it street by street:

0. **Paste a hand** — copy a hand's text from CoinPoker's hand history (or any site using the
   standard PokerStars-style format) and paste it. Positions, cards, board, the real pot, stacks
   and bet sizes are filled in, the solve starts, and your line is replayed and graded
   automatically. The exact bet sizes you and your opponent used are added to the solver's tree.
1. **Setup (manual)** — your position, their position, single-raised or 3-bet pot, your cards and the board
   (click cards or type `AsKd Td9d6h`). Preflop ranges, pot and stacks come from simplified 6-max
   100bb charts; all of them are editable under *Advanced*.
2. **Solve** — Discounted CFR runs in a Web Worker. Use *Good enough — show results* to stop early.
3. **Review** — at each of your decisions you see the solver's action mix and how much EV each
   option loses, then click what you actually did to get a grade. At their decisions you see how
   their range plays, and the side panel shows their range as a hand chart plus a breakdown
   ("30% overpairs, 15% draws …") — the hand-reading part. Click any step in the line to go back.

**Speed.** Solves from the turn or river take seconds. Solves from the flop with wide ranges
(e.g. BTN vs BB) take about a minute on an 8-core machine with the *Fast* preset; narrower ranges
(3-bet pots) are quicker. More bet sizes multiply the time — see `solver/examples/bench.rs`
(`cargo run --release --example bench -- 1` in `solver/`) for native timings.

**Multithreading** needs a cross-origin isolated page (the dev/preview servers send the
`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers; a deployed site must too).
Without it, the analyzer falls back to a single thread, which is about 4–5× slower.

**Credits & license.** The solver engine is [postflop-solver](https://github.com/b-inary/postflop-solver)
by Wataru Inariba, the engine behind [WASM Postflop](https://github.com/b-inary/wasm-postflop).
It is licensed under AGPL-3.0, so if you distribute or host this app publicly, its source must be
made available under the AGPL too.

## Tech Stack

- React 19 + TypeScript
- Vite
- Framer Motion (animations)
- Zustand (state + localStorage persistence)
- Rust → WebAssembly solver (`solver/`), multithreaded with wasm-bindgen-rayon

## Roadmap

- [x] Offline vs AI
- [ ] Online multiplayer (WebSocket)
- [ ] Tournament mode
- [ ] Omaha variant
- [ ] Sound effects & haptics
