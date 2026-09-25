// Times get_all_move_scores for positions read from stdin (one move string per line).
// Modes: "cold" resets the solver before every position; "warm" keeps the table across
// the lines of one game (lines are grouped by a leading "game_id " prefix).
use connect_four_ai::{Position, Solver};
use std::io::{self, BufRead, Write};
use std::time::Instant;

const CENTRE_FIRST: [usize; 7] = [3, 2, 4, 1, 5, 0, 6];

fn best(scores: &[Option<i8>; 7]) -> Option<usize> {
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

fn main() {
    let mode = std::env::args().nth(1).unwrap_or_else(|| "cold".into());
    let mut solver = Solver::new();
    let stdin = io::stdin();
    let mut out = io::stdout().lock();
    let mut last_game = String::new();
    for line in stdin.lock().lines() {
        let line = line.unwrap();
        let (game, moves) = line.split_once(' ').unwrap_or(("-", line.as_str()));
        if mode == "cold" || game != last_game {
            solver.reset();
            last_game = game.to_string();
        }
        let pos = Position::from_moves(moves).expect("bad moves");
        let t = Instant::now();
        let scores = solver.get_all_move_scores(&pos);
        let ms = t.elapsed().as_secs_f64() * 1000.0;
        let s: Vec<String> = scores.iter().map(|x| x.map_or("null".into(), |v| v.to_string())).collect();
        writeln!(out, "{}\t{}\t{:.3}\t{}\t[{}]", game, moves, ms, best(&scores).map_or(-1, |c| c as i64), s.join(",")).unwrap();
    }
}
