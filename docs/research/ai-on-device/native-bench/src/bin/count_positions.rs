// Counts the symmetric-unique, not-yet-won positions the book generator would store at
// each ply, using the generator's own child rule.
use connect_four_ai::Position;
use std::collections::HashSet;

fn main() {
    let max: usize = std::env::args().nth(1).and_then(|a| a.parse().ok()).unwrap_or(10);
    let mut level = vec![Position::new()];
    let mut cumulative = 0usize;
    for ply in 0..=max {
        cumulative += level.len();
        println!("ply {ply:>2}: {:>10} positions, cumulative {:>11}, book bytes {:>12}", level.len(), cumulative, 8 + 9 * cumulative);
        if ply == max {
            break;
        }
        let mut seen = HashSet::with_capacity(level.len() * 3);
        let mut next = Vec::with_capacity(level.len() * 3);
        for pos in &level {
            let possible = pos.possible();
            for col in 0..Position::WIDTH {
                if possible & Position::column_mask(col) > 0 {
                    let mut child = *pos;
                    child.play(col);
                    if !child.is_won_position() && seen.insert(child.get_key()) {
                        next.push(child);
                    }
                }
            }
        }
        level = next;
    }
}
