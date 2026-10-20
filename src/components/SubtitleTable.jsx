import { useState, useCallback } from 'react'
import './SubtitleTable.css'

// Format seconds → SRT time string  HH:MM:SS,mmm
function secsToSrt(secs) {
  if (!isFinite(secs)) return '00:00:00,000'
  const ms = Math.round((secs % 1) * 1000)
  const s = Math.floor(secs) % 60
  const m = Math.floor(secs / 60) % 60
  const h = Math.floor(secs / 3600)
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
}

function pad(n, len = 2) { return String(n).padStart(len, '0') }

// Validate/normalise a time string typed by user (loose parsing)
function normalizeTime(raw) {
  // Accept HH:MM:SS,mmm  or  MM:SS,mmm  or  HH:MM:SS.mmm
  const clean = raw.trim().replace('.', ',')
  const match = clean.match(/^(\d{1,2}):(\d{2}):(\d{2}),(\d{1,3})$/)
  if (match) {
    const [, h, m, s, ms] = match
    return `${pad(h)}:${pad(m)}:${pad(s)},${ms.padEnd(3, '0')}`
  }
  return clean // return as-is, user might still be typing
}

function EditableCell({ value, onChange, mono = false, multiline = false }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(value)

  const commit = () => {
    setEditing(false)
    onChange(local)
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          className="cell-input cell-textarea"
          value={local}
          autoFocus
          rows={2}
          onChange={e => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') { setLocal(value); setEditing(false) } }}
        />
      )
    }
    return (
      <input
        className={`cell-input${mono ? ' cell-mono' : ''}`}
        type="text"
        value={local}
        autoFocus
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { commit(); onChange(normalizeTime(local)) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { commit(); onChange(normalizeTime(local)) }
          if (e.key === 'Escape') { setLocal(value); setEditing(false) }
        }}
      />
    )
  }

  return (
    <span
      className={`cell-display${mono ? ' cell-mono' : ''}${multiline ? ' cell-text' : ''}`}
      onClick={() => { setLocal(value); setEditing(true) }}
      title="Click to edit"
    >
      {value || <em className="cell-empty">click to edit</em>}
    </span>
  )
}

export default function SubtitleTable({ subtitles, onAdd, onUpdate, onDelete }) {
  return (
    <div className="subtitle-panel">
      <div className="subtitle-header">
        <span className="subtitle-title">📝 Subtitles</span>
        <span className="subtitle-count">{subtitles.length} entries</span>
        <button className="btn btn-primary" onClick={onAdd}>+ Add Row</button>
      </div>

      <div className="subtitle-scroll">
        {subtitles.length === 0 ? (
          <div className="subtitle-empty">
            No subtitles yet. Click "Add Row" or import an SRT file.
          </div>
        ) : (
          <table className="subtitle-table">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th className="col-time">Start</th>
                <th className="col-time">End</th>
                <th className="col-text">Text</th>
                <th className="col-del"></th>
              </tr>
            </thead>
            <tbody>
              {subtitles.map((sub, idx) => (
                <SubtitleRow
                  key={sub.id}
                  index={idx + 1}
                  sub={sub}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function SubtitleRow({ index, sub, onUpdate, onDelete }) {
  return (
    <tr className="subtitle-row">
      <td className="col-num td-num">{index}</td>
      <td className="col-time">
        <EditableCell
          value={sub.start}
          mono
          onChange={v => onUpdate(sub.id, 'start', normalizeTime(v))}
        />
      </td>
      <td className="col-time">
        <EditableCell
          value={sub.end}
          mono
          onChange={v => onUpdate(sub.id, 'end', normalizeTime(v))}
        />
      </td>
      <td className="col-text">
        <EditableCell
          value={sub.text}
          multiline
          onChange={v => onUpdate(sub.id, 'text', v)}
        />
      </td>
      <td className="col-del">
        <button
          className="btn btn-danger"
          onClick={() => onDelete(sub.id)}
          title="Delete row"
        >🗑</button>
      </td>
    </tr>
  )
}
