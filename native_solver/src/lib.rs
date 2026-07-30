use connect_four_ai::{Position, Solver};
use pyo3::exceptions::{PyRuntimeError, PyValueError};
use pyo3::prelude::*;
use std::sync::{Mutex, OnceLock};

const CENTRE_FIRST: [usize; 7] = [3, 2, 4, 1, 5, 0, 6];
static SOLVER: OnceLock<Mutex<Solver>> = OnceLock::new();

fn solver() -> &'static Mutex<Solver> {
    SOLVER.get_or_init(|| Mutex::new(Solver::new()))
}

fn parse_position(moves: &str) -> PyResult<Position> {
    if moves.len() > Position::BOARD_SIZE || !moves.bytes().all(|b| (b'1'..=b'7').contains(&b)) {
        return Err(PyValueError::new_err(
            "move history must contain at most 42 digits from 1 through 7",
        ));
    }

    let position = Position::from_moves(moves)
        .map_err(|error| PyValueError::new_err(format!("invalid move history: {error:?}")))?;

    if position.is_won_position() {
        return Err(PyValueError::new_err(
            "cannot solve an already won position",
        ));
    }
    Ok(position)
}

fn exact_scores(position: &Position) -> PyResult<[Option<i8>; 7]> {
    let mut guard = solver()
        .lock()
        .map_err(|_| PyRuntimeError::new_err("solver lock is poisoned"))?;
    Ok(guard.get_all_move_scores(position))
}

fn select_best(scores: &[Option<i8>; 7]) -> Option<usize> {
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

#[pyfunction]
fn best_move(py: Python<'_>, moves: &str) -> PyResult<usize> {
    let position = parse_position(moves)?;
    let scores = py.detach(|| exact_scores(&position))?;
    select_best(&scores).ok_or_else(|| PyValueError::new_err("position has no legal moves"))
}

#[pyfunction]
fn score_moves(py: Python<'_>, moves: &str) -> PyResult<Vec<Option<i8>>> {
    let position = parse_position(moves)?;
    Ok(py.detach(|| exact_scores(&position))?.to_vec())
}

#[pyfunction]
fn engine_info() -> (&'static str, &'static str, bool) {
    ("connect-four-ai", "1.0.0", true)
}

#[pymodule]
fn _solver(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_function(wrap_pyfunction!(best_move, module)?)?;
    module.add_function(wrap_pyfunction!(score_moves, module)?)?;
    module.add_function(wrap_pyfunction!(engine_info, module)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn centre_wins_ties() {
        assert_eq!(
            select_best(&[
                Some(0),
                Some(0),
                Some(0),
                Some(0),
                Some(0),
                Some(0),
                Some(0)
            ]),
            Some(3)
        );
    }

    #[test]
    fn highest_exact_score_wins() {
        assert_eq!(
            select_best(&[Some(-2), Some(1), None, Some(0), Some(4), Some(4), Some(-1)]),
            Some(4)
        );
    }
}
