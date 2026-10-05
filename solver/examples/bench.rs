// Native timing check: `cargo run --release --example bench`
use poker_royale_solver::Solver;
use std::time::Instant;

fn run(name: &str, oop: &str, ip: &str, board: &str, pot: i32, stack: i32, sizes: [&str; 6], target_pct: f32) {
    run_t(name, oop, ip, board, pot, stack, sizes, target_pct, 1.5)
}

#[allow(clippy::too_many_arguments)]
fn run_t(name: &str, oop: &str, ip: &str, board: &str, pot: i32, stack: i32, sizes: [&str; 6], target_pct: f32, allin: f64) {
    let t = Instant::now();
    let mut s = Solver::new(oop, ip, board, pot, stack, sizes[0], sizes[1], sizes[2], sizes[3], sizes[4], sizes[5], allin, "").unwrap();
    let mem = s.memory_usage();
    s.allocate(true);
    let target = pot as f32 * target_pct / 100.0;
    let mut i = 0;
    let mut e = f32::MAX;
    while i < 1000 {
        s.solve_step(i);
        i += 1;
        if i % 10 == 0 {
            e = s.exploitability();
            if e <= target { break; }
        }
    }
    s.finalize();
    println!("{name}: {:.1}s, {i} iters, expl {:.2}% pot, mem {:.0}MB / compressed {:.0}MB",
        t.elapsed().as_secs_f64(), 100.0 * e / pot as f32, mem[0] / 1e6, mem[1] / 1e6);
}

fn main() {
    let bb = "QQ-22,AQs-A2s,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,74s+,63s+,53s+,43s,AJo-A2o,K8o+,Q9o+,J9o+,T8o+,98o";
    let btn = "22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,74s+,63s+,53s+,43s,A2o+,K8o+,Q9o+,J9o+,T8o+,98o";
    let co_call = "TT-22,AQs-ATs,KTs+,QTs+,JTs,T9s,98s,87s,AQo";
    let utg = "66+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,65s,AJo+,KQo";
    let a = std::env::args().nth(1).unwrap_or_default();
    let allin = ["50%", "a", "66%", "a", "75%", "a"];
    if a == "1" { run("flop wide allin-raises 2%", bb, btn, "Td9d6h", 55, 975, allin, 2.0); }
    if a == "2" { run("flop narrow allin-raises 2%", co_call, utg, "Td9d6h", 65, 975, allin, 2.0); }
    if a == "4" { run("flop wide 33/75 allin-raise", bb, btn, "Td9d6h", 55, 975, ["33%,75%", "a", "66%", "a", "75%", "a"], 2.0); }
    if a == "5" { run("flop wide 33 3x-raise", bb, btn, "Td9d6h", 55, 975, ["33%", "3x", "66%", "a", "75%", "a"], 2.0); }
    if a == "6" { run_t("flop wide 33/3x everywhere, no auto all-in", bb, btn, "Td9d6h", 55, 975, ["33%", "3x", "66%", "3x", "75%", "3x"], 2.0, 0.0); }
    if a == "7" { run_t("flop wide 33,75/3x, no auto all-in", bb, btn, "Td9d6h", 55, 975, ["33%,75%", "3x", "66%", "3x", "75%", "3x"], 2.0, 0.0); }
    if a == "8" { run_t("flop wide 33/3x flop, 66/a, 75/a no auto", bb, btn, "Td9d6h", 55, 975, ["33%", "3x", "66%", "a", "75%", "a"], 2.0, 0.0); }
    if a == "3" { run("flop wide 33/75 2.5x 2%", bb, btn, "Td9d6h", 55, 975, ["33%,75%", "2.5x", "66%", "a", "75%", "a"], 2.0); }
}
