// electron/lib/termOrder.js
// ─────────────────────────────────────────────────────────────────────────────
// Helpers to compare academic terms chronologically, so we can stop users from
// copying bill config / promoting / moving students BACKWARDS (to the same term
// or an earlier one). Ordering = session name (e.g. "2025/2026") then term rank
// (First < Second < Third).
// ─────────────────────────────────────────────────────────────────────────────
const TERM_RANK = { 'First Term': 1, 'Second Term': 2, 'Third Term': 3 }

/**
 * Returns a sortable numeric/string key for a term id, or null if not found.
 * The key sorts correctly chronologically across sessions and terms.
 */
function termOrderKey(db, termId) {
  if (!termId) return null
  const row = db.prepare(`
    SELECT t.name as term_name, s.name as session_name
    FROM terms t JOIN sessions s ON s.id = t.session_id
    WHERE t.id = ?`).get([termId])
  if (!row) return null
  const rank = TERM_RANK[row.term_name] || 0
  // Session name like "2025/2026" sorts lexicographically; append term rank.
  return `${row.session_name}#${rank}`
}

/**
 * Compares two terms. Returns:
 *   < 0  if A is earlier than B
 *   = 0  if same term
 *   > 0  if A is later than B
 *   null if either term can't be resolved.
 */
function compareTerms(db, termA, termB) {
  const a = termOrderKey(db, termA)
  const b = termOrderKey(db, termB)
  if (a == null || b == null) return null
  if (a === b) return 0
  return a < b ? -1 : 1
}

module.exports = { termOrderKey, compareTerms, TERM_RANK }
