//! The Super AI reply table: exact move scores for every position the deterministic AI can
//! face after 9, 11 and 13 moves, precomputed by `tools/reply-table` so those moves need no
//! search. A lookup returns the same exact scores as solving, so play is unchanged.
//!
//! File format (all integers little-endian), read by the server and later by the app:
//!
//! | offset | size | content                                                   |
//! |--------|------|-----------------------------------------------------------|
//! | 0      | 4    | magic `C4RT`                                              |
//! | 4      | 4    | format version, `1`                                       |
//! | 8      | 4    | entry count `n`                                           |
//! | 12     | 4    | reserved, `0`                                             |
//! | 16     | 15n  | entries sorted by strictly increasing key                 |
//!
//! Each entry is a `u64` key (`Position::get_key`, which is shared by a position and its
//! mirror image) followed by seven `i8` scores, column 0 first, for the orientation whose
//! own key `position + mask` equals the shared key. `-128` marks a full column. A lookup
//! for the other orientation reverses the scores.

use connect_four_ai::Position;

pub const MAGIC: [u8; 4] = *b"C4RT";
pub const VERSION: u32 = 1;
pub const HEADER_LEN: usize = 16;
pub const ENTRY_LEN: usize = 15;
pub const NO_MOVE: i8 = i8::MIN;

pub type Scores = [Option<i8>; 7];

/// The position's own key, which differs from `get_key` for the mirrored orientation.
pub fn raw_key(position: &Position) -> u64 {
    position.position + position.mask
}

pub fn mirrored(scores: &Scores) -> Scores {
    let mut mirror = *scores;
    mirror.reverse();
    mirror
}

/// Turns scores for `position` into scores for the orientation stored in the table.
pub fn to_stored(position: &Position, scores: &Scores) -> Scores {
    if raw_key(position) == position.get_key() {
        *scores
    } else {
        mirrored(scores)
    }
}

/// Serialises entries that are already sorted by strictly increasing key.
pub fn encode(entries: &[(u64, Scores)]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(HEADER_LEN + ENTRY_LEN * entries.len());
    bytes.extend_from_slice(&MAGIC);
    bytes.extend_from_slice(&VERSION.to_le_bytes());
    bytes.extend_from_slice(&(entries.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&0u32.to_le_bytes());
    for (key, scores) in entries {
        bytes.extend_from_slice(&key.to_le_bytes());
        for score in scores {
            bytes.push(score.unwrap_or(NO_MOVE) as u8);
        }
    }
    bytes
}

pub struct ReplyTable<'a> {
    entries: &'a [u8],
}

impl<'a> ReplyTable<'a> {
    /// Validates the whole table; any malformed byte rejects it, so a bad file can only
    /// make the server solve live, never play from wrong scores.
    pub fn parse(bytes: &'a [u8]) -> Option<Self> {
        let word = |offset: usize| -> Option<u32> {
            Some(u32::from_le_bytes(
                bytes.get(offset..offset + 4)?.try_into().ok()?,
            ))
        };
        if bytes.get(0..4)? != MAGIC || word(4)? != VERSION || word(12)? != 0 {
            return None;
        }
        let count = word(8)? as usize;
        let entries = bytes.get(HEADER_LEN..)?;
        if entries.len() != count.checked_mul(ENTRY_LEN)? {
            return None;
        }
        let table = ReplyTable { entries };
        let mut previous: Option<u64> = None;
        for index in 0..count {
            let key = table.key_at(index);
            if previous.is_some_and(|before| before >= key) {
                return None;
            }
            previous = Some(key);
            let start = index * ENTRY_LEN + 8;
            let scores = &entries[start..start + 7];
            if scores.iter().all(|&byte| byte as i8 == NO_MOVE)
                || scores.iter().any(|&byte| {
                    let score = byte as i8;
                    score != NO_MOVE && !(-21..=21).contains(&score)
                })
            {
                return None;
            }
        }
        Some(table)
    }

    pub fn len(&self) -> usize {
        self.entries.len() / ENTRY_LEN
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    fn key_at(&self, index: usize) -> u64 {
        let start = index * ENTRY_LEN;
        u64::from_le_bytes(self.entries[start..start + 8].try_into().unwrap())
    }

    /// Exact scores for `position` in its own orientation, if the table has them.
    pub fn scores(&self, position: &Position) -> Option<Scores> {
        let key = position.get_key();
        let (mut low, mut high) = (0, self.len());
        while low < high {
            let middle = (low + high) / 2;
            match self.key_at(middle).cmp(&key) {
                std::cmp::Ordering::Less => low = middle + 1,
                std::cmp::Ordering::Greater => high = middle,
                std::cmp::Ordering::Equal => {
                    let start = middle * ENTRY_LEN + 8;
                    let mut stored = [None; 7];
                    for (column, &byte) in self.entries[start..start + 7].iter().enumerate() {
                        let score = byte as i8;
                        stored[column] = (score != NO_MOVE).then_some(score);
                    }
                    return Some(to_stored(position, &stored));
                }
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn position(moves: &str) -> Position {
        Position::from_moves(moves).unwrap()
    }

    fn table_with(moves: &str, scores: Scores) -> Vec<u8> {
        let pos = position(moves);
        encode(&[(pos.get_key(), to_stored(&pos, &scores))])
    }

    #[test]
    fn lookup_restores_the_orientation_of_a_mirrored_position() {
        let left = [Some(1), Some(2), Some(3), Some(4), Some(5), Some(6), None];
        let bytes = table_with("12", left);
        let table = ReplyTable::parse(&bytes).unwrap();
        assert_eq!(table.len(), 1);
        assert_eq!(table.scores(&position("12")), Some(left));
        assert_eq!(table.scores(&position("76")), Some(mirrored(&left)));
        assert_eq!(table.scores(&position("44")), None);
    }

    #[test]
    fn an_empty_table_is_valid() {
        let bytes = encode(&[]);
        let table = ReplyTable::parse(&bytes).unwrap();
        assert!(table.is_empty());
        assert_eq!(table.scores(&position("4")), None);
    }

    #[test]
    fn malformed_tables_are_rejected() {
        let good = table_with("12", [Some(0); 7]);
        assert!(ReplyTable::parse(&good).is_some());

        let mut bad_magic = good.clone();
        bad_magic[0] = b'X';
        let mut bad_version = good.clone();
        bad_version[4] = 2;
        let mut bad_reserved = good.clone();
        bad_reserved[12] = 1;
        let mut bad_count = good.clone();
        bad_count[8] = 2;
        let truncated = good[..good.len() - 1].to_vec();
        let mut bad_score = good.clone();
        bad_score[HEADER_LEN + 8] = 40;
        let mut no_moves = good.clone();
        for byte in &mut no_moves[HEADER_LEN + 8..] {
            *byte = NO_MOVE as u8;
        }
        for bytes in [
            bad_magic,
            bad_version,
            bad_reserved,
            bad_count,
            truncated,
            bad_score,
            no_moves,
        ] {
            assert!(ReplyTable::parse(&bytes).is_none());
        }
    }

    #[test]
    fn keys_must_strictly_increase() {
        let a = position("12").get_key();
        let b = position("44").get_key();
        let (low, high) = (a.min(b), a.max(b));
        let scores = [Some(0); 7];
        assert!(ReplyTable::parse(&encode(&[(low, scores), (high, scores)])).is_some());
        assert!(ReplyTable::parse(&encode(&[(high, scores), (low, scores)])).is_none());
        assert!(ReplyTable::parse(&encode(&[(low, scores), (low, scores)])).is_none());
    }
}
