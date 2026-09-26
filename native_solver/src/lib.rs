mod choice;
// Shared with tools/reply-table, which also uses the encoder.
#[allow(dead_code)]
mod reply_table;

use choice::select_best;
use connect_four_ai::{Position, Solver};
use pyo3::exceptions::{PyRuntimeError, PyValueError};
use pyo3::prelude::*;
use reply_table::ReplyTable;
use std::sync::{Mutex, OnceLock};

static SOLVER: OnceLock<Mutex<Solver>> = OnceLock::new();
static REPLY_TABLE_BYTES: &[u8] = include_bytes!("../data/reply-table.bin");
static REPLY_TABLE: OnceLock<Option<ReplyTable<'static>>> = OnceLock::new();

fn solver() -> &'static Mutex<Solver> {
    SOLVER.get_or_init(|| Mutex::new(Solver::new()))
}

/// The embedded table, or `None` when it fails validation and every move is solved live.
fn reply_table() -> Option<&'static ReplyTable<'static>> {
    REPLY_TABLE
        .get_or_init(|| ReplyTable::parse(REPLY_TABLE_BYTES))
        .as_ref()
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

#[pyfunction]
fn best_move(py: Python<'_>, moves: &str) -> PyResult<usize> {
    let position = parse_position(moves)?;
    // Table scores are the exact scores solving would return; anything else is solved live.
    let scores = match reply_table().and_then(|table| table.scores(&position)) {
        Some(scores) => scores,
        None => py.detach(|| exact_scores(&position))?,
    };
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

/// Whether the embedded reply table passed validation, and how many positions it holds.
#[pyfunction]
fn reply_table_info() -> (bool, usize) {
    reply_table().map_or((false, 0), |table| (true, table.len()))
}

/// The table's scores for a position, or `None` when it is not in the table.
#[pyfunction]
fn reply_table_scores(moves: &str) -> PyResult<Option<Vec<Option<i8>>>> {
    let position = parse_position(moves)?;
    Ok(reply_table()
        .and_then(|table| table.scores(&position))
        .map(|scores| scores.to_vec()))
}

#[pymodule]
fn _solver(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_function(wrap_pyfunction!(best_move, module)?)?;
    module.add_function(wrap_pyfunction!(score_moves, module)?)?;
    module.add_function(wrap_pyfunction!(engine_info, module)?)?;
    module.add_function(wrap_pyfunction!(reply_table_info, module)?)?;
    module.add_function(wrap_pyfunction!(reply_table_scores, module)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_embedded_reply_table_is_valid() {
        let table = reply_table().expect("the committed table must pass validation");
        assert!(!table.is_empty());
    }
}
