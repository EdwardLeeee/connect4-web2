//! How the Super AI picks among exact move scores. Shared with the reply-table generator
//! so both always apply the same tie-break.

/// Columns in preference order among equal scores: centre first, then left before right.
/// The order is not mirror-symmetric, so a position and its mirror can get moves that are
/// not mirror images of each other.
pub const CENTRE_FIRST: [usize; 7] = [3, 2, 4, 1, 5, 0, 6];

/// Returns the column with the highest exact score, breaking ties by `CENTRE_FIRST`.
pub fn select_best(scores: &[Option<i8>; 7]) -> Option<usize> {
    let mut best: Option<(usize, i8)> = None;
    for column in CENTRE_FIRST {
        if let Some(score) = scores[column] {
            if best.is_none_or(|(_, best_score)| score > best_score) {
                best = Some((column, score));
            }
        }
    }
    best.map(|(column, _)| column)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn centre_wins_ties() {
        assert_eq!(select_best(&[Some(0); 7]), Some(3));
    }

    #[test]
    fn left_wins_ties_at_equal_distance() {
        assert_eq!(
            select_best(&[None, None, Some(1), None, Some(1), None, None]),
            Some(2)
        );
    }

    #[test]
    fn highest_exact_score_wins() {
        assert_eq!(
            select_best(&[Some(-2), Some(1), None, Some(0), Some(4), Some(4), Some(-1)]),
            Some(4)
        );
    }

    #[test]
    fn no_legal_move_gives_none() {
        assert_eq!(select_best(&[None; 7]), None);
    }
}
