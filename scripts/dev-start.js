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

// ── step 2: clear database lock files ────────────────────────────────────────

log('Clearing database lock files…')
let cleared = 0
if (fs.existsSync(dbDir)) {
  for (const file of fs.readdirSync(dbDir)) {
    const isLock = LOCK_EXTENSIONS.some(ext => file.endsWith(ext))
    if (isLock) {
      try {
        fs.unlinkSync(path.join(dbDir, file))
        ok(`Removed: database/${file}`)
        cleared++
      } catch (e) {
        warn(`Could not remove database/${file}: ${e.message}`)
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
