//! Solves 6-max preflop and writes the solution as JSON for the app.
//!
//!   cargo run --release --features cli --bin preflop -- --out ../public/preflop/100bb.json
//!
//! Options: --stack <bb> (100), --rake <fraction> (0), --cap <bb> (0), --iters <n> (1500)

use poker_royale_solver::preflop::*;
use std::fmt::Write as _;
use std::time::Instant;

fn arg(name: &str, default: &str) -> String {
    let args: Vec<String> = std::env::args().collect();
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1).cloned()).unwrap_or(default.into())
}

fn main() {
    let cfg = Config {
        stack: arg("--stack", "100").parse().unwrap(),
        rake_rate: arg("--rake", "0").parse().unwrap(),
        rake_cap: arg("--cap", "0").parse().unwrap(),
    };
    let iters: u32 = arg("--iters", "1500").parse().unwrap();
    let out = arg("--out", "preflop.json");

    let t = Instant::now();
    let eq = equity_table(6000);
    eprintln!("equity table: {:.1}s", t.elapsed().as_secs_f32());

    let mut solver = Solver::new(cfg, &eq);
    eprintln!("tree: {} nodes, {} decisions", solver.nodes.len(), solver.num_decisions());

    let t = Instant::now();
    let mut prev = solver.snapshot();
    for i in 1..=iters {
        solver.iterate(i);
        if i % 100 == 0 {
            let snap = solver.snapshot();
            let (mut diff, mut n) = (0.0f32, 0usize);
            for (a, b) in snap.iter().zip(&prev) {
                for (x, y) in a.iter().zip(b) {
                    diff += (x - y).abs();
                    n += 1;
                }
            }
            eprintln!("iter {i}: avg strategy change {:.5} ({:.1}s)", diff / n.max(1) as f32, t.elapsed().as_secs_f32());
            prev = snap;
        }
    }
    let evs = solver.action_evs();

    // ---- JSON ----
    let mut s = String::new();
    write!(s, "{{\"stack\":{},\"rake\":{},\"rakeCap\":{},\"iterations\":{iters},\"positions\":[", cfg.stack, cfg.rake_rate, cfg.rake_cap).unwrap();
    s.push_str(&POSITIONS.iter().map(|p| format!("\"{p}\"")).collect::<Vec<_>>().join(","));
    s.push_str("],\"nodes\":[");
    for (id, node) in solver.nodes.iter().enumerate() {
        if id > 0 {
            s.push(',');
        }
        let inv = node.inv.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(",");
        match &node.kind {
            Kind::Decision { player, acts, children } => {
                let strat = solver.average_strategy(id);
                let ints = |v: &[f32], scale: f32| v.iter().map(|x| ((x * scale).round() as i32).to_string()).collect::<Vec<_>>().join(",");
                write!(
                    s,
                    "{{\"p\":{player},\"inv\":[{inv}],\"a\":[{}],\"ch\":[{}],\"s\":[{}],\"ev\":[{}]}}",
                    acts.iter().map(|a| format!("\"{}\"", a.code())).collect::<Vec<_>>().join(","),
                    children.iter().map(|c| c.to_string()).collect::<Vec<_>>().join(","),
                    ints(&strat, 1000.0),
                    ints(&evs[id], 100.0),
                )
                .unwrap();
            }
            Kind::FoldOut { winner } => write!(s, "{{\"t\":\"fold\",\"w\":{winner},\"inv\":[{inv}]}}").unwrap(),
            Kind::Showdown { oop, ip, all_in } => {
                write!(s, "{{\"t\":\"flop\",\"oop\":{oop},\"ip\":{ip},\"allIn\":{all_in},\"inv\":[{inv}]}}").unwrap()
            }
        }
    }
    s.push_str("]}");
    if let Some(dir) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(dir).ok();
    }
    std::fs::write(&out, &s).unwrap();
    eprintln!("wrote {out} ({} KB)", s.len() / 1024);
}
