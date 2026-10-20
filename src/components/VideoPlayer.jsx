import { useEffect, useState, useRef } from 'react'
import './VideoPlayer.css'

function formatDuration(secs) {
  if (!isFinite(secs) || isNaN(secs)) return '--:--:--'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

export default function VideoPlayer({ videoUrl, videoFile, videoRef }) {
  const [duration, setDuration] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const internalRef = useRef(null)

  // Use the passed-in ref OR internal ref
  const ref = videoRef || internalRef

  useEffect(() => {
    setDuration(null)
    setCurrentTime(0)
  }, [videoUrl])

  const handleLoadedMetadata = () => {
    if (ref.current) setDuration(ref.current.duration)
  }

  const handleTimeUpdate = () => {
    if (ref.current) setCurrentTime(ref.current.currentTime)
  }

  if (!videoUrl) {
    return (
      <div className="video-placeholder">
        <div className="placeholder-inner">
          <span className="placeholder-icon">🎥</span>
          <p>Upload a video to get started</p>
          <p className="placeholder-sub">Supports MP4, MKV, WebM, MOV and more</p>
        </div>
      </div>
    )
  }

  return (
    <div className="video-panel">
      {/* Meta bar */}
      {videoFile && (
        <div className="video-meta">
          <span className="meta-name" title={videoFile.name}>📄 {videoFile.name}</span>
          <span className="meta-sep">·</span>
          {duration != null
            ? <span className="meta-duration">⏱ {formatDuration(duration)}</span>
            : <span className="meta-duration meta-loading">Loading…</span>
          }
          <span className="meta-sep">·</span>
          <span className="meta-time">
            {formatDuration(currentTime)} / {formatDuration(duration ?? 0)}
          </span>
        </div>
      )}

      {/* Video element */}
      <div className="video-wrapper">
        <video
          ref={ref}
          className="video-element"
          src={videoUrl}
          controls
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          preload="metadata"
          crossOrigin="anonymous"
        />
      </div>
    </div>
  )
}
