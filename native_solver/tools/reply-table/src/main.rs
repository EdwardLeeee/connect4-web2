//! Generates `native_solver/data/reply-table.bin`.
//!
//! The Super AI is deterministic, so at a given move it can only face positions reached by
//! every sequence of human moves against its own fixed replies. This enumerates those exact
//! positions after 9, 11 and 13 moves when the AI moves second, and after 8, 10 and 12 moves
//! when it moves first. It solves each symmetric class once with the same engine the server
//! uses and writes the scores sorted by key, so the output is identical whatever the thread
//! count. Usage: `reply-table <output path>`.

// Shared with the server module so both apply the same tie-break and file format.
#[allow(dead_code)]
#[path = "../../../src/choice.rs"]
mod choice;
#[allow(dead_code)]
#[path = "../../../src/reply_table.rs"]
mod reply_table;

use choice::select_best;
use connect_four_ai::{Position, Solver};
use rayon::prelude::*;
use reply_table::{raw_key, to_stored, Scores};
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::time::Instant;

/// The moves after which the table holds the positions the AI faces, when it moves second.
const AI_SECOND_MOVES: [usize; 3] = [9, 11, 13];
/// The same when it moves first.
const AI_FIRST_MOVES: [usize; 3] = [8, 10, 12];

thread_local! {
    static SOLVER: RefCell<Solver> = RefCell::new(Solver::new());
}

/// Every position after one more human move, excluding games the human has just won.
fn human_moves(positions: &[Position]) -> Vec<Position> {
    let mut seen = HashSet::new();
    let mut next = Vec::new();
    for position in positions {
        let possible = position.possible();
        for column in 0..Position::WIDTH {
            if possible & Position::column_mask(column) > 0 {
                let mut child = *position;
                child.play(column);
                // Mirror images are kept apart: the tie-break is not mirror-symmetric.
                if !child.is_won_position() && seen.insert(raw_key(&child)) {
                    next.push(child);
                }
            }
        }
    }
    next
}

/// Solves every position the AI can face from `ai_turn` on, `moves` moves into the game,
/// and adds those at `table_moves` to `table`. `stored` holds every score solved so far.
fn enumerate(
    mut ai_turn: Vec<Position>,
    mut moves: usize,
    table_moves: &[usize],
    stored: &mut HashMap<u64, Scores>,
    table: &mut Vec<(u64, Scores)>,
) {
    let last = *table_moves.last().unwrap();
    loop {
        let started = Instant::now();
        let mut pending = HashSet::new();
        let todo: Vec<Position> = ai_turn
            .iter()
            .filter(|position| {
                let key = position.get_key();
                !stored.contains_key(&key) && pending.insert(key)
            })
            .copied()
            .collect();
        let solved: Vec<(u64, Scores)> = todo
            .par_iter()
            .map(|position| {
                let scores =
                    SOLVER.with(|solver| solver.borrow_mut().get_all_move_scores(position));
                (position.get_key(), to_stored(position, &scores))
            })
            .collect();
        for (key, scores) in solved {
            if table_moves.contains(&moves) {
                table.push((key, scores));
            }
            stored.insert(key, scores);
        }
        eprintln!(
            "after {moves:>2} moves: {:>6} positions the AI can face, {:>6} solved in {:.1} s",
            ai_turn.len(),
            todo.len(),
            started.elapsed().as_secs_f64()
        );
        if moves >= last {
            return;
        }

        let mut seen = HashSet::new();
        let mut human_turn = Vec::new();
        for position in &ai_turn {
            let scores = to_stored(position, &stored[&position.get_key()]);
            if let Some(column) = select_best(&scores) {
                let mut child = *position;
                child.play(column);
                if !child.is_won_position() && seen.insert(raw_key(&child)) {
                    human_turn.push(child);
                }
            }
        }
        ai_turn = human_moves(&human_turn);
        moves += 2;
    }
}

fn main() {
    let output = std::env::args()
        .nth(1)
        .expect("usage: reply-table <output path>");
    let mut stored: HashMap<u64, Scores> = HashMap::new();
    let mut table: Vec<(u64, Scores)> = Vec::new();
    // Moving second, the AI first faces each of the human's opening moves.
    let openings = human_moves(&[Position::new()]);
    enumerate(openings, 1, &AI_SECOND_MOVES, &mut stored, &mut table);
    // Moving first, it starts on the empty board. Its positions have an even number of
    // stones and the others an odd number, so the two sets never share a key.
    enumerate(
        vec![Position::new()],
        0,
        &AI_FIRST_MOVES,
        &mut stored,
        &mut table,
    );

    table.sort_unstable_by_key(|(key, _)| *key);
    let bytes = reply_table::encode(&table);
    assert!(
        reply_table::ReplyTable::parse(&bytes).is_some(),
        "generated an invalid table"
    );
    std::fs::write(&output, bytes).expect("could not write the table");
    eprintln!("wrote {} entries to {output}", table.len());
}
