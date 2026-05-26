#!/usr/bin/env node
/**
 * dev-start.js — single command for the full dev startup sequence:
 *   1. git pull (fetch latest changes)
 *   2. delete all database lock files (avoid activation screen)
 *   3. npm run dev (start vite + electron)
 *
 * Usage:  npm start
 */

const { execSync, spawn } = require('child_process')
const fs   = require('fs')
const path = require('path')

const root    = path.resolve(__dirname, '..')
const dbDir   = path.join(root, 'database')
const LOCK_EXTENSIONS = ['.lock', '-journal', '-wal', '-shm']

// ── helpers ──────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`\x1b[36m[start]\x1b[0m ${msg}`) }
function ok(msg)   { console.log(`\x1b[32m[  ok ]\x1b[0m ${msg}`) }
function warn(msg) { console.log(`\x1b[33m[ warn]\x1b[0m ${msg}`) }
function err(msg)  { console.log(`\x1b[31m[error]\x1b[0m ${msg}`) }

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, stdio: 'pipe', ...opts }).toString().trim()
}

// ── step 1: git pull ─────────────────────────────────────────────────────────

log('Pulling latest changes from GitHub…')
try {
  const out = run('git pull')
  if (out.includes('Already up to date')) {
    ok('Already up to date.')
  } else {
    ok(out.split('\n').filter(Boolean).join(' | '))
  }
} catch (e) {
  warn('git pull failed — continuing anyway.')
  warn(e.message?.split('\n')[0] || '')
}

// ── step 2: kill any lingering Electron processes ─────────────────────────────

log('Checking for lingering Electron processes…')
try {
  if (process.platform === 'win32') {
    // taskkill /F kills forcefully; /IM matches by image name; errors OK if none found
    execSync('taskkill /F /IM electron.exe 2>nul', { stdio: 'pipe' })
    ok('Killed electron.exe processes')
  } else {
    execSync('pkill -f "electron ." 2>/dev/null || true', { stdio: 'pipe' })
    ok('Killed electron processes')
  }
  // Wait for OS to fully release file handles
  const end = Date.now() + 1000; while (Date.now() < end) {}
} catch {
  ok('No Electron processes found — clean start.')
}

// ── step 3: clear database lock files ────────────────────────────────────────

log('Clearing database lock files…')
let cleared = 0
if (fs.existsSync(dbDir)) {
  for (const file of fs.readdirSync(dbDir)) {
    const isLock = LOCK_EXTENSIONS.some(ext => file.endsWith(ext))
    if (isLock) {
      const filePath = path.join(dbDir, file)
      let deleted = false
      // Retry up to 5 times with 200ms gap (Windows releases handles slowly)
      for (let t = 0; t < 5; t++) {
        try { fs.unlinkSync(filePath); deleted = true; break }
        catch { const e = Date.now() + 200; while (Date.now() < e) {} }
      }
      if (deleted) { ok(`Removed: database/${file}`); cleared++ }
      else {
        // Check if it became a directory (Windows edge case)
        try {
          const stat = fs.statSync(filePath)
          if (stat.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true })
            ok(`Removed lock directory: database/${file}`)
            cleared++
          } else {
            // Truncate to 0 bytes — SQLite treats 0-byte file as unlocked
            fs.writeFileSync(filePath, Buffer.alloc(0))
            ok(`Cleared (truncated): database/${file}`)
            cleared++
          }
        } catch (e) {
          warn(`Could not clear database/${file}: ${e.message}`)
        }
      }
    }
  }
  if (cleared === 0) ok('No lock files found — database is clean.')
} else {
  ok('No database folder yet — will be created on first run.')
}

// ── step 3: npm run dev ───────────────────────────────────────────────────────

log('Starting dev server…\n')
const child = spawn('npm', ['run', 'dev'], {
  cwd:   root,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', code => process.exit(code ?? 0))
child.on('error', e => { err(e.message); process.exit(1) })
