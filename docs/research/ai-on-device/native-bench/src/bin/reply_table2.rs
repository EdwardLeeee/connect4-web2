// Reply table v2. The server's centre-first tie-break is not mirror-symmetric, so
// reachability follows exact positions; solved scores are cached per symmetric key in
// canonical orientation (scores mirror exactly) and re-oriented before choosing.
use connect_four_ai::{Position, Solver};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::Write;
use std::time::Instant;

const CENTRE_FIRST: [usize; 7] = [3, 2, 4, 1, 5, 0, 6];
type Scores = [Option<i8>; 7];

fn raw_key(p: &Position) -> u64 {
    p.position + p.mask
}

fn choose(scores: &Scores) -> Option<usize> {
    let mut best: Option<(usize, i8)> = None;
    for c in CENTRE_FIRST {
        if let Some(s) = scores[c] {
            if best.is_none_or(|(_, b)| s > b) {
                best = Some((c, s));
            }
        }
    }
    best.map(|(c, _)| c)
}

fn mirrored(s: &Scores) -> Scores {
    let mut m = *s;
    m.reverse();
    m
}

fn main() {
    let last: usize = std::env::args().nth(1).and_then(|a| a.parse().ok()).unwrap_or(13);
    let mut out = File::create(std::env::args().nth(2).unwrap_or("reply-table2.txt".into())).unwrap();
    let mut solver = Solver::new();
    let mut cache: HashMap<u64, Scores> = HashMap::new();
    let mut human_turn = vec![Position::new()];
    let mut moves = 0;
    loop {
        let mut ai_turn = Vec::new();
        let mut seen = HashSet::new();
        for pos in &human_turn {
            let possible = pos.possible();
            for col in 0..Position::WIDTH {
                if possible & Position::column_mask(col) > 0 {
                    let mut child = *pos;
                    child.play(col);
                    if !child.is_won_position() && seen.insert(raw_key(&child)) {
                        ai_turn.push(child);
                    }
                }
            }
        }
        moves += 1;
        let started = Instant::now();
        let mut slowest = 0.0f64;
        let mut solved = 0usize;
        let mut next = Vec::new();
        let mut seen = HashSet::new();
        for pos in &ai_turn {
            let sym = pos.get_key();
            let canonical = raw_key(pos) == sym;
            let scores = match cache.get(&sym) {
                Some(stored) => if canonical { *stored } else { mirrored(stored) },
                None => {
                    let t = Instant::now();
                    let s = solver.get_all_move_scores(pos);
                    slowest = slowest.max(t.elapsed().as_secs_f64());
                    solved += 1;
                    cache.insert(sym, if canonical { s } else { mirrored(&s) });
                    if moves >= 9 {
                        let c = if canonical { s } else { mirrored(&s) };
                        let txt: Vec<String> = c.iter().map(|x| x.map_or("n".into(), |v| v.to_string())).collect();
                        writeln!(out, "{}\t{}\t{}", moves, sym, txt.join(",")).unwrap();
                    }
                    s
                }
            };
            if let Some(col) = choose(&scores) {
                let mut child = *pos;
                child.play(col);
                if !child.is_won_position() && seen.insert(raw_key(&child)) {
                    next.push(child);
                }
            }
        }
        println!(
            "AI to move after {moves:>2} moves: {:>7} exact positions, {:>7} new symmetric classes solved in {:>8.1} s (slowest {:>6.2} s)",
            ai_turn.len(), solved, started.elapsed().as_secs_f64(), slowest
        );
        if moves >= last {
            break;
        }
        human_turn = next;
        moves += 1;
    }
}
