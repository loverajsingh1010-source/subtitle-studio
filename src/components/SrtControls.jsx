import { useRef } from 'react'
import './SrtControls.css'

// ── SRT parsing ──────────────────────────────────────────────────────
function parseSrt(text) {
  const blocks = text.trim().split(/\r?\n\r?\n/)
  const subtitles = []
  let counter = 1

  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/)
    if (lines.length < 3) continue

    // Find the timing line (contains -->)
    const timingIdx = lines.findIndex(l => l.includes('-->'))
    if (timingIdx < 0) continue

    const timingLine = lines[timingIdx]
    const match = timingLine.match(
      /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/
    )
    if (!match) continue

    const start = match[1].replace('.', ',')
    const end = match[2].replace('.', ',')
    const text = lines.slice(timingIdx + 1).join('\n').trim()

    subtitles.push({ id: Date.now() + counter++, start, end, text })
  }

  return subtitles
}

// ── SRT generation ───────────────────────────────────────────────────
function buildSrt(subtitles) {
  return subtitles
    .map((s, i) =>
      `${i + 1}\n${s.start} --> ${s.end}\n${s.text}\n`
    )
    .join('\n')
}

// ── Trigger browser download ─────────────────────────────────────────
function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function SrtControls({ subtitles, onImport }) {
  const importRef = useRef(null)

  const handleExport = () => {
    if (subtitles.length === 0) {
      alert('No subtitles to export.')
      return
    }
    downloadFile(buildSrt(subtitles), 'subtitles.srt', 'text/srt')
  }

  const handleImportClick = () => importRef.current?.click()

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = parseSrt(ev.target.result)
        if (parsed.length === 0) {
          alert('No valid subtitle entries found in the SRT file.')
          return
        }
        onImport(parsed)
      } catch (err) {
        alert('Failed to parse SRT file: ' + err.message)
      }
    }
    reader.readAsText(file)
    // Reset input so the same file can be re-imported
    e.target.value = ''
  }

  return (
    <div className="srt-controls">
      <input
        ref={importRef}
        type="file"
        accept=".srt"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <button className="btn" onClick={handleImportClick} title="Import an SRT file">
        ⬆ Import SRT
      </button>
      <button className="btn" onClick={handleExport} title="Export subtitles as SRT">
        ⬇ Export SRT
      </button>
    </div>
  )
}
