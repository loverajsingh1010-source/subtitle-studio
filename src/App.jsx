
import { useState, useRef, useCallback } from 'react'
import VideoPlayer from './components/VideoPlayer.jsx'
import Waveform from './components/Waveform.jsx'
import SubtitleTable from './components/SubtitleTable.jsx'
import SrtControls from './components/SrtControls.jsx'
import TranscribePanel from './components/TranscribePanel.jsx'
import './App.css'

// Your deployed FastAPI backend on Render
const API_URL = 'https://subtitle-studio-fbil.onrender.com'

let idCounter = 1
const newId = () => idCounter++

function toSeconds(time) {
  const parts = String(time).replace(',', '.').split(':')
  if (parts.length !== 3) return 0
  return Number(parts[0]) * 3600 +
    Number(parts[1]) * 60 +
    Number(parts[2])
}

function toTimestamp(seconds) {
  const ms = Math.round(Number(seconds) * 1000)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const milli = ms % 1000

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`
}

export default function App() {
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [subtitles, setSubtitles] = useState([])
  const [projectTitle, setProjectTitle] = useState('My Subtitle Project')
  const [savedProjects, setSavedProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const videoRef = useRef(null)
  const fileInputRef = useRef(null)

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (videoUrl) URL.revokeObjectURL(videoUrl)

    setVideoFile(file)
    setVideoUrl(URL.createObjectURL(file))
    setSubtitles([])
  }, [videoUrl])

  const handleUploadClick = () => fileInputRef.current?.click()

  const addSubtitle = () =>
    setSubtitles(prev => [
      ...prev,
      {
        id: newId(),
        start: '00:00:00,000',
        end: '00:00:01,000',
        text: ''
      }
    ])

  const updateSubtitle = useCallback((id, field, value) =>
    setSubtitles(prev =>
      prev.map(s => s.id === id ? { ...s, [field]: value } : s)
    ), [])

  const deleteSubtitle = useCallback((id) =>
    setSubtitles(prev => prev.filter(s => s.id !== id)), [])

  const importSubtitles = useCallback((parsed) => {
    setSubtitles(parsed)
    setMessage('')
  }, [])

  const handleTranscribed = useCallback((entries) => {
    setSubtitles(entries.map(e => ({ ...e, id: newId() })))
    setMessage('')
  }, [])

  // Retrieve the saved projects from the backend
  const refreshProjects = async () => {
    setBusy(true)
    setMessage('Loading saved projects...')

    try {
      const response = await fetch(`${API_URL}/api/projects`)
      if (!response.ok) throw new Error(`API error: ${response.status}`)

      const projects = await response.json()
      setSavedProjects(projects)
      setMessage(
        projects.length
          ? `Found ${projects.length} saved project(s).`
          : 'No saved projects yet.'
      )
    } catch (error) {
      setMessage(`Could not load projects: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Save subtitle text and timestamps in the backend database
  const saveProject = async () => {
    setBusy(true)
    setMessage('Saving project...')

    try {
      const payload = {
        title: projectTitle.trim() || 'Untitled project',
        subtitles: subtitles.map(s => ({
          start_time: toSeconds(s.start),
          end_time: toSeconds(s.end),
          text: s.text || ''
        }))
      }

      const response = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(`API error ${response.status}: ${detail}`)
      }

      const saved = await response.json()
      setSelectedProjectId(String(saved.id))
      setMessage(`Project saved successfully! ID: ${saved.id}`)
      await refreshProjects()
    } catch (error) {
      setMessage(`Save failed: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Load a saved project and convert its timestamps back to SRT format
  const loadProject = async () => {
    if (!selectedProjectId) {
      setMessage('Select a saved project first.')
      return
    }

    setBusy(true)
    setMessage('Loading project...')

    try {
      const response = await fetch(
        `${API_URL}/api/projects/${selectedProjectId}`
      )

      if (!response.ok) throw new Error(`API error: ${response.status}`)

      const project = await response.json()
      setProjectTitle(project.title || 'Untitled project')
      setSubtitles(
        project.subtitles.map(s => ({
          id: newId(),
          start: toTimestamp(s.start_time),
          end: toTimestamp(s.end_time),
          text: s.text
        }))
      )
      setMessage(`Loaded "${project.title}".`)
    } catch (error) {
      setMessage(`Load failed: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
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

      <section style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        background: '#15191f',
        borderBottom: '1px solid #303640'
      }}>
        <input
          aria-label="Project title"
          value={projectTitle}
          onChange={e => setProjectTitle(e.target.value)}
          placeholder="Project name"
          style={{
            padding: '9px',
            minWidth: '160px',
            background: '#202630',
            color: '#fff',
            border: '1px solid #414955',
            borderRadius: '5px'
          }}
        />

        <button
          className="btn btn-primary"
          onClick={saveProject}
          disabled={busy}
        >
          ☁ Save Project
        </button>

        <button
          className="btn"
          onClick={refreshProjects}
          disabled={busy}
        >
          ↻ Refresh Projects
        </button>

        <select
          aria-label="Saved projects"
          value={selectedProjectId}
          onChange={e => setSelectedProjectId(e.target.value)}
          style={{
            padding: '9px',
            maxWidth: '240px',
            background: '#202630',
            color: '#fff',
            border: '1px solid #414955',
            borderRadius: '5px'
          }}
        >
          <option value="">Select saved project</option>
          {savedProjects.map(p => (
            <option key={p.id} value={String(p.id)}>
              {p.title} (#{p.id})
            </option>
          ))}
        </select>

        <button
          className="btn"
          onClick={loadProject}
          disabled={busy}
        >
          Load Project
        </button>

        {message && (
          <span role="status" style={{ color: '#b8d7ff', fontSize: '13px' }}>
            {message}
          </span>
        )}
      </section>

      <main className="main-layout">
        <section className="left-panel">
          <VideoPlayer
            videoUrl={videoUrl}
            videoFile={videoFile}
            videoRef={videoRef}
          />
          <Waveform videoFile={videoFile} videoRef={videoRef} />
          <TranscribePanel
            videoFile={videoFile}
            onTranscribed={handleTranscribed}
          />
        </section>

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

