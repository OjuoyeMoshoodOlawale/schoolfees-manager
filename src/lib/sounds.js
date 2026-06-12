// src/lib/sounds.js
// ─────────────────────────────────────────────────────────────────────────────
// Tiny audio feedback for form validation and critical actions.
// Uses the WebAudio API — no sound files to ship, works offline, ~zero weight.
// Respects the user's preference via localStorage('sf_sounds') = 'off'.
// ─────────────────────────────────────────────────────────────────────────────
let ctx = null
function audioCtx() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)() } catch { return null }
  }
  // Resume if the context was suspended by autoplay policy
  if (ctx.state === 'suspended') { try { ctx.resume() } catch {} }
  return ctx
}

function soundsEnabled() {
  try { return localStorage.getItem('sf_sounds') !== 'off' } catch { return true }
}

function tone(freq, startAt, duration, type = 'sine', gainPeak = 0.18) {
  const ac = audioCtx()
  if (!ac) return
  const osc  = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(ac.destination)
  const t = ac.currentTime + startAt
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(gainPeak, t + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

/** Two-note descending "uh-oh" — clearly an error, but soft on the ears. */
export function playErrorSound() {
  if (!soundsEnabled()) return
  tone(440, 0,    0.14, 'triangle', 0.22)  // A4
  tone(294, 0.13, 0.22, 'triangle', 0.20)  // D4
}

/** Single gentle high blip — confirmation. */
export function playSuccessSound() {
  if (!soundsEnabled()) return
  tone(660, 0,    0.09, 'sine', 0.14)
  tone(880, 0.08, 0.12, 'sine', 0.12)
}

/** Soft single mid tone — neutral attention (warnings). */
export function playWarnSound() {
  if (!soundsEnabled()) return
  tone(523, 0, 0.16, 'sine', 0.16)
}

export function setSoundsEnabled(on) {
  try { localStorage.setItem('sf_sounds', on ? 'on' : 'off') } catch {}
}
export function getSoundsEnabled() { return soundsEnabled() }
