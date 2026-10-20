import { useState, useRef, useCallback } from 'react'
import VideoPlayer from './components/VideoPlayer.jsx'
import Waveform from './components/Waveform.jsx'
import SubtitleTable from './components/SubtitleTable.jsx'
import SrtControls from './components/SrtControls.jsx'
import TranscribePanel from './components/TranscribePanel.jsx'
import './App.css'

let idCounter = 1
const newId = () => idCounter++

export default function App() {
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  // Start with an empty subtitle list — no sample entry
  const [subtitles, setSubtitles] = useState([])
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    const url = URL.createObjectURL(file)
    setVideoFile(file)
    setVideoUrl(url)
    // Clear subtitles when a new video is loaded
    setSubtitles([])
  }, [videoUrl])

  const handleUploadClick = () => fileInputRef.current?.click()

  // ── Subtitle CRUD ────────────────────────────────────────────────
  const addSubtitle = () =>
    setSubtitles(prev => [...prev, { id: newId(), start: '00:00:00,000', end: '00:00:01,000', text: '' }])

  const updateSubtitle = useCallback((id, field, value) =>
    setSubtitles(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s)), [])

  const deleteSubtitle = useCallback((id) =>
    setSubtitles(prev => prev.filter(s => s.id !== id)), [])

  const importSubtitles = useCallback((parsed) => setSubtitles(parsed), [])

  // Called by TranscribePanel when Whisper finishes
  const handleTranscribed = useCallback((entries) => {
    setSubtitles(entries.map(e => ({ ...e, id: newId() })))
  }, [])

  return (
    <div className="app-shell">
      {/* ── Top toolbar ─────────────────────────────────────────── */}
      <header className="toolbar">
        <div className="toolbar-left">
          <span className="logo">🎬 Subtitle Studio</span>
        </div>
        <div className="toolbar-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button className="btn btn-primary" onClick={handleUploadClick}>
            ⬆ Upload Video
          </button>
          {videoFile && (
            <span className="file-badge">📄 {videoFile.name}</span>
          )}
        </div>
        <div className="toolbar-right">
          <SrtControls subtitles={subtitles} onImport={importSubtitles} />
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────── */}
      <main className="main-layout">
        {/* Left: video + waveform + transcribe */}
        <section className="left-panel">
          <VideoPlayer videoUrl={videoUrl} videoFile={videoFile} videoRef={videoRef} />
          <Waveform videoFile={videoFile} videoRef={videoRef} />
          <TranscribePanel videoFile={videoFile} onTranscribed={handleTranscribed} />
        </section>

        {/* Right: subtitle table */}
        <section className="right-panel">
          <SubtitleTable
            subtitles={subtitles}
            onAdd={addSubtitle}
            onUpdate={updateSubtitle}
            onDelete={deleteSubtitle}
          />
        </section>
      </main>
    </div>
  )
}
