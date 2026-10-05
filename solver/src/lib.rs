//! Thin WebAssembly wrapper around `postflop-solver` (by b-inary, the engine behind wasm-postflop).
//!
//! The JS side drives everything: build a game, run `solve_step` in a loop (so it can report
//! progress and be stopped), `finalize`, then walk the tree with `apply_history` and read
//! per-hand strategy / EV / equity arrays for the current node.

use postflop_solver::*;
use wasm_bindgen::prelude::*;

pub mod preflop;

#[cfg(feature = "mt")]
pub use wasm_bindgen_rayon::init_thread_pool;

#[wasm_bindgen]
pub struct Solver {
    game: PostFlopGame,
    solved: bool,
}

fn bet_sizes(bet: &str, raise: &str) -> Result<BetSizeOptions, String> {
    BetSizeOptions::try_from((bet, raise)).map_err(|e| format!("Bad bet sizes \"{bet}\" / \"{raise}\": {e}"))
}

fn decode_action(code: &str) -> Option<Action> {
    let amount = || code.get(1..)?.parse().ok();
    match code.chars().next()? {
        'F' => Some(Action::Fold),
        'X' => Some(Action::Check),
        'C' => Some(Action::Call),
        'B' => Some(Action::Bet(amount()?)),
        'R' => Some(Action::Raise(amount()?)),
        'A' => Some(Action::AllIn(amount()?)),
        _ => None,
    }
}

/// Adds every bet/raise of the played line that the tree doesn't already have. Stops at the
/// first one the tree can't take (e.g. an amount below the minimum raise); the app then maps the
/// rest of the line to the nearest available sizes.
fn add_played_line(tree: &mut ActionTree, line: &str) {
    let actions: Vec<Action> = line.split(',').filter(|s| !s.is_empty()).map_while(decode_action).collect();
    for k in 1..=actions.len() {
        let prefix = &actions[..k];
        if matches!(prefix[k - 1], Action::Bet(_) | Action::Raise(_) | Action::AllIn(_)) {
            if let Err(e) = tree.add_line(prefix) {
                if !e.starts_with("Action already exists") {
                    break;
                }
            }
        }
    }
}

#[wasm_bindgen]
impl Solver {
    /// `board` is 3–5 cards written together, e.g. "Td9d6h" or "Td9d6hQc".
    /// The tree starts on the street matching the number of board cards.
    /// `add_allin_threshold`: also offer all-in when the biggest bet is at most this many pots
    /// (0 = never add it; every extra action makes the tree much bigger).
    /// `line`: the actions actually played (e.g. "X,B18,C,X,B55,R165,C"), so their exact sizes
    /// exist in the tree. Empty for none.
    #[allow(clippy::too_many_arguments)]
    #[wasm_bindgen(constructor)]
    pub fn new(
        oop_range: &str,
        ip_range: &str,
        board: &str,
        starting_pot: i32,
        effective_stack: i32,
        flop_bet: &str,
        flop_raise: &str,
        turn_bet: &str,
        turn_raise: &str,
        river_bet: &str,
        river_raise: &str,
        add_allin_threshold: f64,
        line: &str,
    ) -> Result<Solver, String> {
        let board = board.trim();
        if board.len() < 6 || board.len() > 10 || board.len() % 2 != 0 {
            return Err("Board must have 3 to 5 cards".into());
        }
        let flop = flop_from_str(&board[0..6])?;
        let turn = if board.len() >= 8 { card_from_str(&board[6..8])? } else { NOT_DEALT };
        let river = if board.len() == 10 { card_from_str(&board[8..10])? } else { NOT_DEALT };
        let initial_state = match board.len() {
            6 => BoardState::Flop,
            8 => BoardState::Turn,
            _ => BoardState::River,
        };

        let card_config = CardConfig {
            range: [oop_range.parse()?, ip_range.parse()?],
            flop,
            turn,
            river,
        };

        let flop_sizes = bet_sizes(flop_bet, flop_raise)?;
        let turn_sizes = bet_sizes(turn_bet, turn_raise)?;
        let river_sizes = bet_sizes(river_bet, river_raise)?;

        let tree_config = TreeConfig {
            initial_state,
            starting_pot,
            effective_stack,
            rake_rate: 0.0,
            rake_cap: 0.0,
            flop_bet_sizes: [flop_sizes.clone(), flop_sizes],
            turn_bet_sizes: [turn_sizes.clone(), turn_sizes],
            river_bet_sizes: [river_sizes.clone(), river_sizes],
            turn_donk_sizes: None,
            river_donk_sizes: None,
            add_allin_threshold,
            force_allin_threshold: 0.15,
            merging_threshold: 0.1,
        };

        let mut action_tree = ActionTree::new(tree_config)?;
        add_played_line(&mut action_tree, line);
        let game = PostFlopGame::with_config(card_config, action_tree)?;
        Ok(Solver { game, solved: false })
    }

    /// Estimated memory in bytes: [uncompressed, compressed].
    pub fn memory_usage(&self) -> Vec<f64> {
        let (a, b) = self.game.memory_usage();
        vec![a as f64, b as f64]
    }

    pub fn allocate(&mut self, compress: bool) {
        self.game.allocate_memory(compress);
    }

    pub fn solve_step(&self, iteration: u32) {
        solve_step(&self.game, iteration);
    }

    pub fn exploitability(&self) -> f32 {
        compute_exploitability(&self.game)
    }

    pub fn finalize(&mut self) {
        finalize(&mut self.game);
        self.solved = true;
        self.game.cache_normalized_weights();
    }

    pub fn starting_pot(&self) -> i32 {
        self.game.tree_config().starting_pot
    }

    pub fn effective_stack(&self) -> i32 {
        self.game.tree_config().effective_stack
    }

    /// Hole cards of `player` (0 = OOP, 1 = IP) as a flat [c1, c2, c1, c2, ...] list of card ids.
    pub fn private_cards(&self, player: usize) -> Vec<u8> {
        self.game
            .private_cards(player)
            .iter()
            .flat_map(|&(a, b)| [a, b])
            .collect()
    }

    /// Jump to a node: a list of action indices (or card ids at chance nodes) from the root.
    pub fn apply_history(&mut self, history: &[u32]) {
        let history: Vec<usize> = history.iter().map(|&x| x as usize).collect();
        self.game.apply_history(&history);
        if self.solved {
            self.game.cache_normalized_weights();
        }
    }

    /// 0 = a player acts, 1 = chance (deal a card), 2 = terminal (hand over).
    pub fn node_kind(&self) -> u8 {
        if self.game.is_terminal_node() {
            2
        } else if self.game.is_chance_node() {
            1
        } else {
            0
        }
    }

    pub fn current_player(&self) -> usize {
        self.game.current_player()
    }

    pub fn current_board(&self) -> Vec<u8> {
        self.game.current_board()
    }

    /// Chips each player has put in since the start of the tree: [OOP, IP].
    pub fn total_bet_amount(&self) -> Vec<i32> {
        self.game.total_bet_amount().to_vec()
    }

    /// Actions at the current node, encoded as "F", "X", "C", "B<amt>", "R<amt>", "A<amt>",
    /// joined by commas.
    pub fn actions(&self) -> String {
        if self.game.is_terminal_node() || self.game.is_chance_node() {
            return String::new();
        }
        self.game
            .available_actions()
            .iter()
            .map(|a| match a {
                Action::Fold => "F".to_string(),
                Action::Check => "X".to_string(),
                Action::Call => "C".to_string(),
                Action::Bet(x) => format!("B{x}"),
                Action::Raise(x) => format!("R{x}"),
                Action::AllIn(x) => format!("A{x}"),
                _ => "?".to_string(),
            })
            .collect::<Vec<_>>()
            .join(",")
    }

    /// Cards that can be dealt at the current chance node.
    pub fn possible_cards(&self) -> Vec<u8> {
        let mask = self.game.possible_cards();
        (0..52u8).filter(|&c| mask & (1u64 << c) != 0).collect()
    }

    /// Normalized reach weights of each hand of `player` at the current node.
    pub fn weights(&self, player: usize) -> Vec<f32> {
        self.game.normalized_weights(player).to_vec()
    }

    pub fn equity(&self, player: usize) -> Vec<f32> {
        self.game.equity(player)
    }

    pub fn expected_values(&self, player: usize) -> Vec<f32> {
        self.game.expected_values(player)
    }

    /// For the player to act: EV of each action for each hand, laid out `[action][hand]`.
    pub fn action_evs(&self) -> Vec<f32> {
        self.game.expected_values_detail(self.game.current_player())
    }

    /// Strategy of the player to act, laid out `[action][hand]`.
    pub fn strategy(&self) -> Vec<f32> {
        self.game.strategy()
    }
}
