import { useState, useEffect } from 'react'
import { Field } from '../../components/ui'

// ── Token definitions — what schools can insert ───────────────────────────────
const TOKENS = [
  { token: '{PREFIX}',  label: 'School Prefix',    desc: 'Your custom prefix (e.g. BFA, STU, SCH)',    example: 'STU' },
  { token: '{YEAR}',    label: '4-digit Year',      desc: 'Full year of registration',                  example: '2025' },
  { token: '{YY}',      label: '2-digit Year',      desc: 'Short year of registration',                 example: '25' },
  { token: '{SESSION}', label: 'Session Code',      desc: 'Compact academic session (2024/2025 → 2425)',example: '2425' },
  { token: '{SEQ3}',    label: 'Sequence (3 digits)',desc: 'Auto-incrementing number, 3 digits',         example: '001' },
  { token: '{SEQ4}',    label: 'Sequence (4 digits)',desc: 'Auto-incrementing number, 4 digits',         example: '0001' },
  { token: '{SEQ5}',    label: 'Sequence (5 digits)',desc: 'Auto-incrementing number, 5 digits',         example: '00001' },
]

// ── Preset templates schools can pick ────────────────────────────────────────
const PRESETS = [
  { label: 'STU/2025/001',          format: '{PREFIX}/{YEAR}/{SEQ3}',         desc: 'Most common' },
  { label: 'BFA/STU/2025/001',      format: '{PREFIX}/STU/{YEAR}/{SEQ3}',     desc: 'School initials + STU' },
  { label: '2025/0001',             format: '{YEAR}/{SEQ4}',                  desc: 'Year + sequence' },
  { label: '2425/001',              format: '{SESSION}/{SEQ3}',               desc: 'Session code + sequence' },
  { label: 'STU-25-0001',           format: '{PREFIX}-{YY}-{SEQ4}',           desc: 'Prefix + short year' },
  { label: '20250001',              format: '{YEAR}{SEQ4}',                   desc: 'Year + sequence, no separator' },
  { label: 'BFA/2425/0001',         format: '{PREFIX}/{SESSION}/{SEQ4}',      desc: 'Prefix + session' },
  { label: '00001',                 format: '{SEQ5}',                         desc: 'Sequence only' },
]

// Build a live preview from format + prefix
function buildPreview(format, prefix) {
  if (!format) return ''
  return format
    .replace(/{PREFIX}/g,   prefix || 'STU')
    .replace(/{YEAR}/g,     '2025')
    .replace(/{YY}/g,       '25')
    .replace(/{SESSION}/g,  '2425')
    .replace(/{SEQ3}/g,     '001')
    .replace(/{SEQ4}/g,     '0001')
    .replace(/{SEQ5}/g,     '00001')
}

export default function RegNumberTab({ register, watch, setValue }) {
  const format = watch('reg_number_format') || '{PREFIX}/{YEAR}/{SEQ3}'
  const prefix = watch('reg_number_prefix') || 'STU'
  const preview = buildPreview(format, prefix)

  const insertToken = (token) => {
    // Append token to the current format value
    setValue('reg_number_format', (format || '') + token, { shouldDirty: true })
  }

  const applyPreset = (presetFormat) => {
    setValue('reg_number_format', presetFormat, { shouldDirty: true })
  }

  return (
    <div className="space-y-6">

      {/* Live preview */}
      <div className="card bg-blue-50 border-blue-200 p-4 space-y-1">
        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Live Preview</p>
        <p className="text-2xl font-mono font-bold text-blue-900 tracking-wider">
          {preview || <span className="text-blue-300 italic">Build your format below</span>}
        </p>
        <p className="text-xs text-blue-500">This is what the next student's registration number will look like</p>
      </div>

      {/* Prefix setting */}
      <div className="card space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">School Prefix</h3>
          <p className="text-xs text-gray-400 mt-0.5">Used wherever <code className="bg-gray-100 px-1 rounded">{'{PREFIX}'}</code> appears in your format. Usually school initials.</p>
        </div>
        <Field label="Prefix text">
          <input
            className="form-input font-mono uppercase w-40"
            maxLength={10}
            placeholder="STU"
            {...register('reg_number_prefix')}
            onChange={e => setValue('reg_number_prefix', e.target.value.toUpperCase(), { shouldDirty: true })}
          />
        </Field>
      </div>

      {/* Presets */}
      <div className="card space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Quick Presets</h3>
          <p className="text-xs text-gray-400 mt-0.5">Click one to use it as a starting point, then customise.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map(p => (
            <button
              key={p.format}
              type="button"
              onClick={() => applyPreset(p.format)}
              className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                format === p.format
                  ? 'border-blue-400 bg-blue-50 text-blue-900'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
              }`}
            >
              <p className="font-mono font-semibold text-xs">{buildPreview(p.format, prefix)}</p>
              <p className="text-gray-400 text-xs mt-0.5">{p.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Format builder */}
      <div className="card space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Format Builder</h3>
          <p className="text-xs text-gray-400 mt-0.5">Click tokens to add them. Type separators like <code className="bg-gray-100 px-1 rounded">/</code> <code className="bg-gray-100 px-1 rounded">-</code> <code className="bg-gray-100 px-1 rounded">_</code> directly in the box.</p>
        </div>

        {/* Token buttons */}
        <div className="flex flex-wrap gap-2">
          {TOKENS.map(t => (
            <button
              key={t.token}
              type="button"
              onClick={() => insertToken(t.token)}
              title={t.desc}
              className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-xs font-mono font-semibold hover:bg-blue-100 hover:border-blue-400 transition-all"
            >
              {t.token}
              <span className="ml-1.5 text-blue-400 font-normal">→ {t.example}</span>
            </button>
          ))}
        </div>

        {/* Format input */}
        <Field
          label="Format string"
          hint="Edit directly or use the token buttons above. Separators like / - _ can be typed freely."
        >
          <div className="flex gap-2">
            <input
              className="form-input font-mono flex-1"
              placeholder="{PREFIX}/{YEAR}/{SEQ3}"
              {...register('reg_number_format')}
            />
            <button
              type="button"
              onClick={() => setValue('reg_number_format', '', { shouldDirty: true })}
              className="btn-secondary btn btn-sm px-3"
              title="Clear format"
            >✕</button>
          </div>
        </Field>

        {/* Token reference table */}
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Token</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Output</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Description</th>
              </tr>
            </thead>
            <tbody>
              {TOKENS.map((t, i) => (
                <tr key={t.token} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 font-mono text-blue-700 font-semibold">{t.token}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{buildPreview(t.token, prefix)}</td>
                  <td className="px-3 py-2 text-gray-500">{t.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sequence reset */}
      <div className="card space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Sequence Counter Reset</h3>
          <p className="text-xs text-gray-400 mt-0.5">When should the sequence number restart from 001?</p>
        </div>
        <div className="space-y-2">
          {[
            { value: 'year',    label: 'Every year',    desc: 'Resets to 001 each January. e.g. STU/2024/150 → STU/2025/001' },
            { value: 'never',   label: 'Never reset',   desc: 'Always increments globally. Guarantees uniqueness across all years.' },
            { value: 'session', label: 'Each session',  desc: 'Resets when a new academic session is set as current.' },
          ].map(opt => (
            <label key={opt.value} className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                value={opt.value}
                className="mt-0.5 accent-blue-600"
                {...register('reg_seq_reset')}
              />
              <div>
                <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
        <strong>Note:</strong> Changing the format only affects <em>new</em> students registered after saving. Existing student registration numbers are never changed.
      </div>
    </div>
  )
}
