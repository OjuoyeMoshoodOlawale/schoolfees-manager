'use strict'
/**
 * System Error Handler
 * - Wraps all IPC handlers to catch raw errors
 * - Logs errors to system_errors table with context
 * - Translates raw DB/SQL errors into friendly user messages
 * - Provides IPC for admin to view and resolve errors
 */

const { ipcMain } = require('electron')
const { getDb }   = require('../lib/database')

// ── Friendly error message translator ────────────────────────────────────────
const FRIENDLY_MESSAGES = [
  // SQLite constraint errors
  { match: /NOT NULL constraint failed.*boarding_type/i,  msg: 'Please select a student type (Day or Boarding).' },
  { match: /NOT NULL constraint failed.*gender/i,         msg: 'Please select the student\'s gender.' },
  { match: /NOT NULL constraint failed.*first_name/i,     msg: 'Student first name is required.' },
  { match: /NOT NULL constraint failed.*last_name/i,      msg: 'Student last name is required.' },
  { match: /NOT NULL constraint failed.*name/i,           msg: 'Name is required.' },
  { match: /NOT NULL constraint failed/i,                 msg: 'A required field is missing. Please fill in all required fields.' },
  { match: /UNIQUE constraint failed.*reg_number/i,       msg: 'This registration number is already taken. Please use a different one.' },
  { match: /UNIQUE constraint failed.*staff_number/i,     msg: 'This staff number is already in use.' },
  { match: /UNIQUE constraint failed.*email/i,            msg: 'This email address is already registered.' },
  { match: /UNIQUE constraint failed.*name/i,             msg: 'A record with this name already exists.' },
  { match: /UNIQUE constraint failed/i,                   msg: 'A duplicate entry was detected. This record may already exist.' },
  { match: /FOREIGN KEY constraint failed/i,              msg: 'Cannot complete this action — a related record is required first.' },
  { match: /CHECK constraint failed/i,                    msg: 'An invalid value was entered. Please check your input and try again.' },
  { match: /database is locked/i,                         msg: 'The database is busy. Please try again in a moment.' },
  { match: /unable to open database/i,                    msg: 'Cannot access the database. Please restart the app.' },
  { match: /no such table/i,                              msg: 'A data table is missing. Please contact support.' },
  { match: /no such column/i,                             msg: 'A data field is missing. Please update the app to the latest version.' },
  // File errors
  { match: /ENOENT/i,                                     msg: 'A required file was not found.' },
  { match: /EACCES|EPERM/i,                               msg: 'Permission denied. Run the app as administrator or check file permissions.' },
  { match: /ENOSPC/i,                                     msg: 'Disk is full. Please free up space and try again.' },
  // Network errors
  { match: /ECONNREFUSED|ENOTFOUND/i,                     msg: 'Network connection failed. Check your internet connection.' },
  // Generic fallback — never show raw SQL
  { match: /.*/,                                          msg: null },  // null = use sanitised version
]

function getFriendlyMessage(rawError, handlerName) {
  const msg = rawError?.message || String(rawError)
  for (const { match, msg: friendly } of FRIENDLY_MESSAGES) {
    if (match.test(msg)) {
      if (friendly) return friendly
      // Sanitise: remove SQL details but keep the gist
      const sanitised = msg
        .replace(/\bSELECT\b.*?(?=\n|$)/gi, '')
        .replace(/\bINSERT\b.*?(?=\n|$)/gi, '')
        .replace(/\bUPDATE\b.*?(?=\n|$)/gi, '')
        .replace(/\bDELETE\b.*?(?=\n|$)/gi, '')
        .replace(/sqlite3?[^:]*:/gi, '')
        .replace(/\s+/g, ' ').trim()
      return sanitised.length > 5 && sanitised.length < 200
        ? sanitised
        : `An unexpected error occurred in ${handlerName || 'the app'}. The error has been logged for the administrator.`
    }
  }
  return `An unexpected error occurred. Please try again or contact your system administrator.`
}

// ── Log error to DB ───────────────────────────────────────────────────────────
function logError({ handler, message, stack, context, severity = 'error' }) {
  try {
    const db = getDb()
    db.prepare(`INSERT INTO system_errors (handler, message, stack, context, severity)
      VALUES (?,?,?,?,?)`).run([
      handler  || '',
      message  || 'Unknown error',
      stack    || '',
      typeof context === 'object' ? JSON.stringify(context) : (context || ''),
      severity,
    ])
  } catch {
    // Never throw from error logger
    console.error('[ErrorHandler] Failed to log error to DB:', message)
  }
}
module.exports.logError = logError

// ── Wrap an IPC handler with error catching ───────────────────────────────────
// Usage: instead of ipcMain.handle('foo', fn), use safeHandle('foo', fn)
function safeHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (e) {
      const friendly = getFriendlyMessage(e, channel)
      logError({
        handler:  channel,
        message:  e.message || String(e),
        stack:    e.stack   || '',
        context:  JSON.stringify(args).slice(0, 500),
        severity: 'error',
      })
      // Throw the friendly message — frontend receives it via try/catch
      throw new Error(friendly)
    }
  })
}
module.exports.safeHandle = safeHandle

// ─────────────────────────────────────────────────────────────────────────────
// IPC handlers for the System Errors admin page
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('errors:list', (_, { resolved = false, limit = 200 } = {}) => {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM system_errors
    WHERE resolved = ?
    ORDER BY created_at DESC LIMIT ?
  `).all([resolved ? 1 : 0, limit])
})

ipcMain.handle('errors:resolve', (_, { id, resolution = '' }) => {
  getDb().prepare(`
    UPDATE system_errors SET resolved=1, resolution=? WHERE id=?
  `).run([resolution, id])
  return { ok: true }
})

ipcMain.handle('errors:resolve-all', () => {
  getDb().prepare(`UPDATE system_errors SET resolved=1 WHERE resolved=0`).run([])
  return { ok: true }
})

ipcMain.handle('errors:delete', (_, id) => {
  getDb().prepare('DELETE FROM system_errors WHERE id=?').run([id])
  return { ok: true }
})

ipcMain.handle('errors:clear-resolved', () => {
  getDb().prepare('DELETE FROM system_errors WHERE resolved=1').run([])
  return { ok: true }
})

ipcMain.handle('errors:count-unresolved', () => {
  return getDb().prepare('SELECT COUNT(*) as n FROM system_errors WHERE resolved=0').get()?.n || 0
})
