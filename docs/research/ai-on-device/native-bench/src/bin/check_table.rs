// Checks the reply table against positions the server actually faced: every position
// must be present, and the table's re-oriented scores must pick the server's column.
// Usage: check_table <table> < native-cold.tsv (game, moves, ms, best, scores)
use connect_four_ai::Position;
use std::collections::HashMap;
use std::io::{self, BufRead};

const CENTRE_FIRST: [usize; 7] = [3, 2, 4, 1, 5, 0, 6];

fn main() {
    let table_path = std::env::args().nth(1).expect("table path");
    let mut table: HashMap<u64, [Option<i8>; 7]> = HashMap::new();
    for line in std::fs::read_to_string(table_path).unwrap().lines() {
        let mut parts = line.split('\t');
        let _moves = parts.next();
        let key: u64 = parts.next().unwrap().parse().unwrap();
        let mut scores = [None; 7];
        for (i, s) in parts.next().unwrap().split(',').enumerate() {
            scores[i] = if s == "n" { None } else { Some(s.parse().unwrap()) };
        }
        table.insert(key, scores);
    }
    let (mut checked, mut missing, mut wrong) = (0, 0, 0);
    for line in io::stdin().lock().lines() {
        let line = line.unwrap();
        let cols: Vec<&str> = line.split('\t').collect();
        let (game, moves, best) = (cols[0], cols[1], cols[3].parse::<i64>().unwrap());
        let n = moves.len();
        if !game.starts_with('g') || !(n == 9 || n == 11 || n == 13) {
            continue;
        }
        checked += 1;
        let pos = Position::from_moves(moves).unwrap();
        let sym = pos.get_key();
        let Some(stored) = table.get(&sym) else {
            missing += 1;
            eprintln!("missing {moves}");
            continue;
        };
        let mut scores = *stored;
        if pos.position + pos.mask != sym {
            scores.reverse();
        }
        let mut choice: Option<(usize, i8)> = None;
        for c in CENTRE_FIRST {
            if let Some(s) = scores[c] {
                if choice.is_none_or(|(_, b)| s > b) {
                    choice = Some((c, s));
                }
            }
        }
        if choice.map_or(-1, |(c, _)| c as i64) != best {
            wrong += 1;
            eprintln!("wrong {moves}: table {:?} server {best}", choice);
        }
    }
    println!("checked {checked} server positions at 9/11/13 moves: missing {missing}, wrong column {wrong}");
}
