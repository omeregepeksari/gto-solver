//! 6-max preflop solver.
//!
//! The usual simplified model used by preflop tools:
//! - Hands are the 169 starting-hand classes (AA, AKs, AKo, …).
//! - Postflop isn't played out. A heads-up pot that sees a flop is split by equity, adjusted for
//!   how well each side *realizes* it: being out of position and holding hard-to-play hands
//!   (offsuit, disconnected) realizes less. An all-in that's called is split by raw equity.
//! - Pots stay heads-up: only the big blind flat-calls an open (everyone else 3-bets or folds,
//!   as in most modern 6-max strategies), and after a 3-bet only the opener continues.
//! - Bet sizes are fixed: open 2.5bb (SB 3bb), 3-bet 3x in position / 4x from the blinds,
//!   squeeze +1 open per caller, 4-bet 2.3x, then all-in.
//!
//! Solved with vector-form Discounted CFR over all six players at once.

#[cfg(feature = "cli")]
use rayon::prelude::*;

pub const NUM_CLASSES: usize = 169;
pub const NUM_PLAYERS: usize = 6;
pub const POSITIONS: [&str; NUM_PLAYERS] = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const SB: usize = 4;
const BB: usize = 5;
/// Postflop acting order (lower = acts first = out of position).
const POSTFLOP_ORDER: [usize; NUM_PLAYERS] = [2, 3, 4, 5, 0, 1];

// ---------------------------------------------------------------------------------------------
// Hand classes

/// Card id = 4 * rank + suit (rank 2 → 0 … A → 12). Grid index matches the app's 13x13 chart:
/// row/col 0 = Ace, suited above the diagonal, offsuit below.
pub fn class_of(c1: u8, c2: u8) -> usize {
    let r1 = 12 - (c1 >> 2) as usize;
    let r2 = 12 - (c2 >> 2) as usize;
    let hi = r1.min(r2);
    let lo = r1.max(r2);
    if hi != lo && c1 & 3 == c2 & 3 {
        hi * 13 + lo
    } else {
        lo * 13 + hi
    }
}

pub fn class_combos() -> Vec<Vec<(u8, u8)>> {
    let mut out = vec![Vec::new(); NUM_CLASSES];
    for a in 0..52u8 {
        for b in a + 1..52u8 {
            out[class_of(a, b)].push((a, b));
        }
    }
    out
}

/// How well a hand plays postflop beyond its raw equity (suited and connected hands make more
/// strong draws and disguised hands; offsuit gappers get bluffed off their equity more).
fn playability(c: usize) -> f32 {
    let (row, col) = (c / 13, c % 13);
    if row == col {
        // Small and medium pairs flop sets and win big pots (implied odds).
        return if row >= 4 { 1.05 } else { 1.0 };
    }
    let suited = row < col;
    let gap = row.abs_diff(col) - 1;
    let low_card = 12 - row.max(col); // rank of the lower card, 2 → 0
    let connected = match gap {
        0 => 0.07,
        1 => 0.04,
        2 => 0.02,
        _ => 0.0,
    };
    if suited {
        1.08 + connected
    } else {
        // Offsuit hands that aren't connected and have a low card make few strong hands and are
        // often dominated — they realize their equity worst.
        let junk = if gap >= 2 && low_card < 8 { 0.08 } else { 0.0 };
        0.92 + connected - junk
    }
}

// ---------------------------------------------------------------------------------------------
// 7-card evaluation and the 169x169 equity table

fn straight_high(mask: u32) -> Option<u32> {
    let m = (mask << 1) | ((mask >> 12) & 1); // ace also plays low
    (4..=13u32).rev().find(|&hi| (m >> (hi - 4)) & 0x1f == 0x1f)
}

fn top_bits(mask: u32, n: u32) -> u32 {
    let mut m = mask;
    while m.count_ones() > n {
        m &= m - 1; // drop the lowest set bit
    }
    m
}

/// Larger is better. Category in bits 20+.
pub fn eval7(cards: &[u8; 7]) -> u32 {
    let mut suit_mask = [0u32; 4];
    let mut counts = [0u8; 13];
    let mut all = 0u32;
    for &c in cards {
        let r = (c >> 2) as usize;
        suit_mask[(c & 3) as usize] |= 1 << r;
        counts[r] += 1;
        all |= 1 << r;
    }
    for &m in &suit_mask {
        if m.count_ones() >= 5 {
            return match straight_high(m) {
                Some(h) => (8 << 20) | h,
                None => (5 << 20) | top_bits(m, 5),
            };
        }
    }
    let mut quads = None;
    let mut trips = [0u32; 2];
    let mut n_trips = 0;
    let mut pairs = [0u32; 3];
    let mut n_pairs = 0;
    for r in (0..13).rev() {
        match counts[r] {
            4 => quads = Some(r as u32),
            3 if n_trips < 2 => {
                trips[n_trips] = r as u32;
                n_trips += 1;
            }
            2 if n_pairs < 3 => {
                pairs[n_pairs] = r as u32;
                n_pairs += 1;
            }
            _ => {}
        }
    }
    let highest_except = |skip: &[u32]| (0..13u32).rev().find(|r| counts[*r as usize] > 0 && !skip.contains(r)).unwrap_or(0);
    if let Some(q) = quads {
        return (7 << 20) | (q << 4) | highest_except(&[q]);
    }
    if n_trips >= 1 && (n_trips >= 2 || n_pairs >= 1) {
        let t = trips[0];
        let p = if n_trips >= 2 { trips[1].max(pairs[0] * (n_pairs > 0) as u32) } else { pairs[0] };
        return (6 << 20) | (t << 4) | p;
    }
    if let Some(h) = straight_high(all) {
        return (4 << 20) | h;
    }
    if n_trips == 1 {
        let t = trips[0];
        return (3 << 20) | (t << 8) | top_bits(all & !(1 << t), 2);
    }
    if n_pairs >= 2 {
        let (p1, p2) = (pairs[0], pairs[1]);
        return (2 << 20) | (p1 << 16) | (p2 << 12) | highest_except(&[p1, p2]);
    }
    if n_pairs == 1 {
        let p = pairs[0];
        return (1 << 20) | (p << 16) | top_bits(all & !(1 << p), 3);
    }
    top_bits(all, 5)
}

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

pub struct Equity {
    /// eq[a * 169 + b]: how often class a beats class b (ties count half).
    pub eq: Vec<f32>,
    /// P(opponent holds class b | you hold class a).
    pub cond: Vec<f32>,
    /// Share of all 1326 starting hands in each class.
    pub prior: Vec<f32>,
}

/// Monte Carlo equity of every class against every class (`samples` boards per pair).
pub fn equity_table(samples: usize) -> Equity {
    let combos = class_combos();
    let row = |a: usize| -> (Vec<f32>, Vec<f32>) {
        let mut rng = Rng(0x9E37_79B9_7F4A_7C15 ^ (a as u64 + 1).wrapping_mul(0x1234_5678_9ABC));
        let mut eq = vec![0.5f32; NUM_CLASSES];
        let mut cnt = vec![0f32; NUM_CLASSES];
        for b in 0..NUM_CLASSES {
            let pairs: Vec<_> = combos[a]
                .iter()
                .flat_map(|&x| combos[b].iter().map(move |&y| (x, y)))
                .filter(|&((a1, a2), (b1, b2))| a1 != b1 && a1 != b2 && a2 != b1 && a2 != b2)
                .collect();
            cnt[b] = pairs.len() as f32;
            if pairs.is_empty() || b < a {
                continue; // filled in by symmetry
            }
            let mut score = 0u64;
            for i in 0..samples {
                let ((a1, a2), (b1, b2)) = pairs[i % pairs.len()];
                let mut board = [0u8; 5];
                let mut n = 0;
                while n < 5 {
                    let c = rng.below(52) as u8;
                    if c != a1 && c != a2 && c != b1 && c != b2 && !board[..n].contains(&c) {
                        board[n] = c;
                        n += 1;
                    }
                }
                let ha = eval7(&[a1, a2, board[0], board[1], board[2], board[3], board[4]]);
                let hb = eval7(&[b1, b2, board[0], board[1], board[2], board[3], board[4]]);
                score += match ha.cmp(&hb) {
                    std::cmp::Ordering::Greater => 2,
                    std::cmp::Ordering::Equal => 1,
                    std::cmp::Ordering::Less => 0,
                };
            }
            eq[b] = score as f32 / (2 * samples) as f32;
        }
        (eq, cnt)
    };

    #[cfg(feature = "cli")]
    let rows: Vec<_> = (0..NUM_CLASSES).into_par_iter().map(row).collect();
    #[cfg(not(feature = "cli"))]
    let rows: Vec<_> = (0..NUM_CLASSES).map(row).collect();

    let mut eq = vec![0.5f32; NUM_CLASSES * NUM_CLASSES];
    let mut cond = vec![0f32; NUM_CLASSES * NUM_CLASSES];
    for a in 0..NUM_CLASSES {
        for b in 0..NUM_CLASSES {
            if b >= a {
                eq[a * NUM_CLASSES + b] = rows[a].0[b];
                eq[b * NUM_CLASSES + a] = 1.0 - rows[a].0[b];
            }
            // Each of your combos leaves 1225 two-card hands for the opponent.
            cond[a * NUM_CLASSES + b] = rows[a].1[b] / (combos[a].len() as f32 * 1225.0);
        }
    }
    let prior = combos.iter().map(|c| c.len() as f32 / 1326.0).collect();
    Equity { eq, cond, prior }
}

// ---------------------------------------------------------------------------------------------
// Game tree

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Act {
    Fold,
    Call,
    Raise(f32),
    AllIn(f32),
}

impl Act {
    pub fn code(&self) -> String {
        match self {
            Act::Fold => "F".into(),
            Act::Call => "C".into(),
            Act::Raise(x) => format!("R{x}"),
            Act::AllIn(x) => format!("A{x}"),
        }
    }
}

pub enum Kind {
    Decision { player: usize, acts: Vec<Act>, children: Vec<usize> },
    /// Everyone else folded.
    FoldOut { winner: usize },
    /// Heads-up to the flop (or all-in and called).
    Showdown { oop: usize, ip: usize, all_in: bool },
}

pub struct Node {
    pub kind: Kind,
    /// Chips (in bb) each player has put in.
    pub inv: [f32; NUM_PLAYERS],
}

#[derive(Clone, Copy)]
pub struct Config {
    pub stack: f32,
    pub rake_rate: f32,
    pub rake_cap: f32,
}

#[derive(Clone)]
struct State {
    inv: [f32; NUM_PLAYERS],
    folded: [bool; NUM_PLAYERS],
    queue: std::collections::VecDeque<usize>,
    bet: f32,
    level: u8,
    opener: usize,
    caller: Option<usize>,
    three_bettor: usize,
}

fn round_half(x: f32) -> f32 {
    (x * 2.0).round() / 2.0
}

pub fn build_tree(cfg: &Config) -> Vec<Node> {
    let mut inv = [0.0; NUM_PLAYERS];
    inv[SB] = 0.5;
    inv[BB] = 1.0;
    let st = State {
        inv,
        folded: [false; NUM_PLAYERS],
        queue: (0..NUM_PLAYERS).collect(),
        bet: 1.0,
        level: 0,
        opener: 0,
        caller: None,
        three_bettor: 0,
    };
    let mut nodes = Vec::new();
    build(&mut nodes, st, cfg);
    nodes
}

fn build(nodes: &mut Vec<Node>, mut st: State, cfg: &Config) -> usize {
    // Skip players who already folded or who can only fold (keeps pots heads-up).
    let player = loop {
        let active = st.folded.iter().filter(|f| !**f).count();
        let Some(&p) = st.queue.front() else { break None };
        if active == 1 {
            break None;
        }
        let forced = st.level >= 2 && p != st.opener && p != st.three_bettor;
        if st.folded[p] || forced {
            st.folded[p] = st.folded[p] || forced;
            st.queue.pop_front();
            continue;
        }
        break Some(p);
    };

    let Some(p) = player else {
        let alive: Vec<usize> = (0..NUM_PLAYERS).filter(|&i| !st.folded[i]).collect();
        let kind = if alive.len() == 1 {
            Kind::FoldOut { winner: alive[0] }
        } else {
            let (a, b) = (alive[0], alive[1]);
            let (oop, ip) = if POSTFLOP_ORDER[a] < POSTFLOP_ORDER[b] { (a, b) } else { (b, a) };
            Kind::Showdown { oop, ip, all_in: st.inv[a] >= cfg.stack - 1e-3 }
        };
        nodes.push(Node { kind, inv: st.inv });
        return nodes.len() - 1;
    };

    let id = nodes.len();
    nodes.push(Node { kind: Kind::FoldOut { winner: p }, inv: st.inv }); // placeholder
    st.queue.pop_front();

    let open_size = |opener: usize| if opener == SB { 3.0 } else { 2.5 };
    let three_bet_size = |st: &State, p: usize| {
        let open = open_size(st.opener);
        let base = if p == BB && st.opener == SB {
            9.0
        } else if p == SB || p == BB {
            4.0 * open
        } else {
            3.0 * open
        };
        base + if st.caller.is_some() { open } else { 0.0 }
    };
    let after = |p: usize, st: &State| -> std::collections::VecDeque<usize> {
        (p + 1..NUM_PLAYERS).chain(0..p).filter(|&i| !st.folded[i]).collect()
    };

    let mut options: Vec<(Act, State)> = Vec::new();
    let mut fold = st.clone();
    fold.folded[p] = true;
    options.push((Act::Fold, fold));

    match st.level {
        0 => {
            let size = open_size(p);
            let mut s = st.clone();
            s.inv[p] = size;
            s.bet = size;
            s.level = 1;
            s.opener = p;
            s.queue = (p + 1..NUM_PLAYERS).filter(|&i| !st.folded[i]).collect();
            options.push((Act::Raise(size), s));
        }
        1 => {
            // Only the big blind flats: it closes the action, so the pot stays heads-up.
            if p == BB {
                let mut s = st.clone();
                s.inv[p] = st.bet;
                s.caller = Some(p);
                options.push((Act::Call, s));
            }
            let size = three_bet_size(&st, p).min(cfg.stack);
            let mut s = st.clone();
            s.inv[p] = size;
            s.bet = size;
            s.level = 2;
            s.three_bettor = p;
            s.queue = after(p, &s);
            options.push((Act::Raise(size), s));
        }
        2 => {
            // Only the opener gets here.
            let mut s = st.clone();
            s.inv[p] = st.bet;
            options.push((Act::Call, s));
            let size = round_half(2.3 * st.bet);
            let mut s = st.clone();
            s.level = 3;
            s.queue = [st.three_bettor].into();
            if size >= cfg.stack * 0.5 {
                s.inv[p] = cfg.stack;
                s.bet = cfg.stack;
                s.level = 4;
                options.push((Act::AllIn(cfg.stack), s));
            } else {
                s.inv[p] = size;
                s.bet = size;
                options.push((Act::Raise(size), s));
            }
        }
        3 => {
            let mut s = st.clone();
            s.inv[p] = st.bet;
            options.push((Act::Call, s));
            let mut s = st.clone();
            s.inv[p] = cfg.stack;
            s.bet = cfg.stack;
            s.level = 4;
            s.queue = [st.opener].into();
            options.push((Act::AllIn(cfg.stack), s));
        }
        _ => {
            let mut s = st.clone();
            s.inv[p] = st.bet;
            options.push((Act::Call, s));
        }
    }

    let acts: Vec<Act> = options.iter().map(|(a, _)| *a).collect();
    let children = options.into_iter().map(|(_, s)| build(nodes, s, cfg)).collect();
    nodes[id].kind = Kind::Decision { player: p, acts, children };
    id
}

// ---------------------------------------------------------------------------------------------
// Solver

type Vec169 = [f32; NUM_CLASSES];
type PerPlayer = [Vec169; NUM_PLAYERS];

pub struct Solver<'a> {
    pub nodes: Vec<Node>,
    pub cfg: Config,
    eq: &'a Equity,
    play: Vec169,
    /// Per decision node, laid out [action][class].
    regret: Vec<Vec<f32>>,
    strat_sum: Vec<Vec<f32>>,
}

impl<'a> Solver<'a> {
    pub fn new(cfg: Config, eq: &'a Equity) -> Self {
        let nodes = build_tree(&cfg);
        let sizes: Vec<usize> = nodes
            .iter()
            .map(|n| match &n.kind {
                Kind::Decision { acts, .. } => acts.len() * NUM_CLASSES,
                _ => 0,
            })
            .collect();
        let mut play = [0.0; NUM_CLASSES];
        for (c, x) in play.iter_mut().enumerate() {
            *x = playability(c);
        }
        Solver {
            regret: sizes.iter().map(|&n| vec![0.0; n]).collect(),
            strat_sum: sizes.iter().map(|&n| vec![0.0; n]).collect(),
            nodes,
            cfg,
            eq,
            play,
        }
    }

    pub fn num_decisions(&self) -> usize {
        self.nodes.iter().filter(|n| matches!(n.kind, Kind::Decision { .. })).count()
    }

    fn current_strategy(&self, node: usize, n_acts: usize) -> Vec<f32> {
        let r = &self.regret[node];
        let mut s = vec![0.0; n_acts * NUM_CLASSES];
        for c in 0..NUM_CLASSES {
            let total: f32 = (0..n_acts).map(|a| r[a * NUM_CLASSES + c].max(0.0)).sum();
            for a in 0..n_acts {
                s[a * NUM_CLASSES + c] =
                    if total > 0.0 { r[a * NUM_CLASSES + c].max(0.0) / total } else { 1.0 / n_acts as f32 };
            }
        }
        s
    }

    pub fn average_strategy(&self, node: usize) -> Vec<f32> {
        let Kind::Decision { acts, .. } = &self.nodes[node].kind else { return vec![] };
        let n = acts.len();
        let ss = &self.strat_sum[node];
        let mut s = vec![0.0; n * NUM_CLASSES];
        for c in 0..NUM_CLASSES {
            let total: f32 = (0..n).map(|a| ss[a * NUM_CLASSES + c]).sum();
            for a in 0..n {
                s[a * NUM_CLASSES + c] = if total > 0.0 { ss[a * NUM_CLASSES + c] / total } else { 1.0 / n as f32 };
            }
        }
        s
    }

    fn mass(&self, reach: &Vec169) -> f32 {
        reach.iter().zip(&self.eq.prior).map(|(r, p)| r * p).sum()
    }

    /// Counterfactual values at a terminal for every player.
    fn terminal(&self, node: &Node, reach: &PerPlayer) -> PerPlayer {
        let masses: Vec<f32> = reach.iter().map(|r| self.mass(r)).collect();
        let pot: f32 = node.inv.iter().sum();
        let mut out = [[0.0; NUM_CLASSES]; NUM_PLAYERS];
        let others = |skip: &[usize]| -> f32 { (0..NUM_PLAYERS).filter(|j| !skip.contains(j)).map(|j| masses[j]).product() };
        match node.kind {
            Kind::FoldOut { winner } => {
                for (p, row) in out.iter_mut().enumerate() {
                    let payoff = if p == winner { pot - node.inv[p] } else { -node.inv[p] };
                    row.fill(payoff * others(&[p]));
                }
            }
            Kind::Showdown { oop, ip, all_in } => {
                for (p, row) in out.iter_mut().enumerate() {
                    if p != oop && p != ip {
                        row.fill(-node.inv[p] * others(&[p]));
                    }
                }
                let rake = (pot * self.cfg.rake_rate).min(self.cfg.rake_cap);
                let net = pot - rake;
                let spr = (self.cfg.stack - node.inv[oop]) / pot;
                let depth = (spr / 10.0).min(1.0);
                let r_oop = if all_in { 1.0 } else { 1.0 - 0.14 * depth };
                // Playability is mostly implied odds, so it fades as stacks get shallow.
                let play = |c: usize| 1.0 + (self.play[c] - 1.0) * depth;
                let k = others(&[oop, ip]);
                for (me, opp, my_r) in [(oop, ip, r_oop), (ip, oop, 1.0)] {
                    let opp_r = if me == oop { 1.0 } else { r_oop };
                    for c in 0..NUM_CLASSES {
                        let mut v = 0.0;
                        for d in 0..NUM_CLASSES {
                            let w = self.eq.cond[c * NUM_CLASSES + d] * reach[opp][d];
                            if w == 0.0 {
                                continue;
                            }
                            let e = self.eq.eq[c * NUM_CLASSES + d];
                            let share = if all_in {
                                e
                            } else {
                                let a = e * my_r * play(c);
                                let b = (1.0 - e) * opp_r * play(d);
                                a / (a + b)
                            };
                            v += w * (net * share - node.inv[me]);
                        }
                        out[me][c] = k * v;
                    }
                }
            }
            Kind::Decision { .. } => unreachable!(),
        }
        out
    }

    /// One CFR pass. With `learn = false` it only evaluates the average strategy and records
    /// each action's value into `evs`.
    fn walk(&mut self, id: usize, reach: &PerPlayer, t: f32, learn: bool, evs: &mut Vec<Vec<f32>>) -> PerPlayer {
        let (player, n_acts, children) = match &self.nodes[id].kind {
            Kind::Decision { player, acts, children } => (*player, acts.len(), children.clone()),
            _ => return self.terminal(&self.nodes[id], reach),
        };
        let sigma = if learn { self.current_strategy(id, n_acts) } else { self.average_strategy(id) };
        let mut total = [[0.0; NUM_CLASSES]; NUM_PLAYERS];
        let mut action_values = vec![[0.0f32; NUM_CLASSES]; n_acts];
        for (a, &child) in children.iter().enumerate() {
            let mut r = *reach;
            for c in 0..NUM_CLASSES {
                r[player][c] *= sigma[a * NUM_CLASSES + c];
            }
            let v = self.walk(child, &r, t, learn, evs);
            for p in 0..NUM_PLAYERS {
                for c in 0..NUM_CLASSES {
                    total[p][c] += if p == player { sigma[a * NUM_CLASSES + c] * v[p][c] } else { v[p][c] };
                }
            }
            action_values[a] = v[player];
        }
        if learn {
            let regret = &mut self.regret[id];
            for a in 0..n_acts {
                for c in 0..NUM_CLASSES {
                    regret[a * NUM_CLASSES + c] += action_values[a][c] - total[player][c];
                }
            }
            // Linear weighting of the average strategy (later iterations count more).
            let ss = &mut self.strat_sum[id];
            for a in 0..n_acts {
                for c in 0..NUM_CLASSES {
                    ss[a * NUM_CLASSES + c] += t * reach[player][c] * sigma[a * NUM_CLASSES + c];
                }
            }
        } else {
            // Normalize by how likely the opponents are to be here, giving EV in bb.
            let opp_mass: f32 =
                (0..NUM_PLAYERS).filter(|&j| j != player).map(|j| self.mass(&reach[j])).product();
            let e = &mut evs[id];
            for a in 0..n_acts {
                for c in 0..NUM_CLASSES {
                    e[a * NUM_CLASSES + c] = if opp_mass > 1e-12 { action_values[a][c] / opp_mass } else { 0.0 };
                }
            }
        }
        total
    }

    /// Discounted CFR (alpha = 1.5, beta = 0): shrink old positive / negative regrets.
    fn discount(&mut self, t: f32) {
        let pos = t.powf(1.5) / (t.powf(1.5) + 1.0);
        for r in self.regret.iter_mut() {
            for x in r.iter_mut() {
                *x *= if *x > 0.0 { pos } else { 0.5 };
            }
        }
    }

    pub fn iterate(&mut self, t: u32) {
        let reach = [[1.0; NUM_CLASSES]; NUM_PLAYERS];
        let mut unused = Vec::new();
        self.walk(0, &reach, t as f32, true, &mut unused);
        self.discount(t as f32);
    }

    /// EV (bb) of each action for the acting player's classes, under the average strategy.
    pub fn action_evs(&mut self) -> Vec<Vec<f32>> {
        let mut evs: Vec<Vec<f32>> = self.regret.iter().map(|r| vec![0.0; r.len()]).collect();
        let reach = [[1.0; NUM_CLASSES]; NUM_PLAYERS];
        self.walk(0, &reach, 0.0, false, &mut evs);
        evs
    }

    /// Average strategy of every node (compare two snapshots to watch convergence).
    pub fn snapshot(&self) -> Vec<Vec<f32>> {
        (0..self.nodes.len()).map(|i| self.average_strategy(i)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cards(s: &str) -> [u8; 7] {
        let mut out = [0u8; 7];
        for (i, ch) in s.as_bytes().chunks(2).enumerate() {
            let r = b"23456789TJQKA".iter().position(|&x| x == ch[0]).unwrap() as u8;
            let su = b"cdhs".iter().position(|&x| x == ch[1]).unwrap() as u8;
            out[i] = 4 * r + su;
        }
        out
    }

    #[test]
    fn ranks_hands() {
        let order = [
            "2c3d4h5s7c9dJh", // high card
            "2c2d4h5s7c9dJh", // pair
            "2c2d4h4s7c9dJh", // two pair
            "2c2d2h5s7c9dJh", // trips
            "Ac2d3h4s5c9dJh", // wheel
            "6c7d8h9sTc2dJh", // straight
            "2c4c6c8cTc9dJh", // flush
            "2c2d2h5s5c9dJh", // full house
            "2c2d2h2s7c9dJh", // quads
            "Ac2c3c4c5c9dJh", // straight flush
        ];
        let scores: Vec<u32> = order.iter().map(|s| eval7(&cards(s))).collect();
        assert!(scores.windows(2).all(|w| w[0] < w[1]), "{scores:?}");
        assert!(eval7(&cards("AcAd4h5s7c9dJh")) > eval7(&cards("KcKd4h5s7c9dJh")));
    }

    #[test]
    fn classes_cover_all_combos() {
        let c = class_combos();
        assert_eq!(c.iter().map(|v| v.len()).sum::<usize>(), 1326);
        assert_eq!(c[0].len(), 6); // AA
        assert_eq!(c[1].len(), 4); // AKs
        assert_eq!(c[13].len(), 12); // AKo
    }
}
