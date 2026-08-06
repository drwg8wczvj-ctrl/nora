import React from "react";
import {
  Airplay, ChevronLeft, ChevronRight, Music2, Pause, Play,
  Volume2, Waves,
} from "lucide-react";

const AMBIENT_SOUNDS = [
  { id: "none", label: "Off" },
  { id: "rain", label: "Rain" },
  { id: "forest", label: "Forest" },
  { id: "cafe", label: "Cafe" },
  { id: "ocean", label: "Ocean" },
  { id: "brown", label: "Brown Noise" },
  { id: "pink", label: "Pink Noise" },
  { id: "white", label: "White Noise" },
];

const formatPosition = (seconds) => {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
};

export default function MusicWorkspace({
  controller,
  focusOverlay,
  ambientSound,
  ambientVolume,
}) {
  const { media } = controller;
  const playing = media.playbackState === "playing";
  const positionPct = media.duration && media.position != null
    ? Math.max(0, Math.min(100, (media.position / media.duration) * 100))
    : 0;

  return (
    <section
      className="desk-workspace desk-music-workspace"
      aria-label="Music workspace"
      style={media.artwork ? { "--desk-artwork": `url("${media.artwork}")` } : undefined}
    >
      <div className="desk-music-backdrop" aria-hidden="true" />
      <div className="desk-music-artwork">
        {media.artwork ? <img src={media.artwork} alt="" /> : <Music2 size={72} />}
        {focusOverlay && (
          <div className="desk-music-focus-overlay">
            <span>Focus</span>
            <strong>{focusOverlay}</strong>
          </div>
        )}
      </div>
      <div className="desk-music-details">
        <span className="desk-eyebrow">Browser media</span>
        <h1>{media.title}</h1>
        <p>{media.artist}{media.album ? ` · ${media.album}` : ""}</p>
        {!media.available && (
          <div className="desk-media-unavailable">
            Media Session can read media owned by Nora’s page. Other browser tabs are isolated;
            Spotify, Apple Music, and YouTube Music require their own provider or a native integration.
          </div>
        )}
        <div className="desk-playback-position">
          <input
            type="range"
            min="0"
            max={media.duration || 100}
            value={media.position ?? 0}
            disabled={!media.duration}
            onChange={(event) => controller.seek(Number(event.target.value))}
            aria-label="Playback position"
            style={{ "--position": `${positionPct}%` }}
          />
          <span>{formatPosition(media.position)}</span>
          <span>{formatPosition(media.duration)}</span>
        </div>
        <div className="desk-media-controls">
          <button onClick={controller.previous} disabled={!media.available} aria-label="Previous track"><ChevronLeft /></button>
          <button className="desk-media-play" onClick={playing ? controller.pause : controller.play} disabled={!media.available} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause /> : <Play />}
          </button>
          <button onClick={controller.next} disabled={!media.available} aria-label="Next track"><ChevronRight /></button>
        </div>
        <div className="desk-volume-row">
          <Volume2 size={16} />
          <input
            type="range"
            min="0"
            max="1"
            step=".05"
            value={media.volume ?? 0.7}
            disabled={media.volume == null}
            onChange={(event) => controller.setVolume(Number(event.target.value))}
            aria-label="Media volume"
          />
          <Airplay size={16} />
          <span>{media.outputDevice}</span>
        </div>
        <div className="desk-lyrics-placeholder">
          <strong>Lyrics</strong>
          <span>Available when the connected media provider supplies them.</span>
        </div>
      </div>

      <aside className="desk-ambient-mixer">
        <div><Waves size={16} /><strong>Ambient layer</strong><span>Mix independently with music</span></div>
        <div className="desk-ambient-options">
          {AMBIENT_SOUNDS.map((sound) => (
            <button
              key={sound.id}
              className={ambientSound === sound.id ? "active" : ""}
              onClick={() => controller.setAmbientSound(sound.id)}
            >
              {sound.label}
            </button>
          ))}
        </div>
        <label>
          <span>Ambient volume</span>
          <input
            type="range"
            min="0"
            max="1"
            step=".05"
            value={ambientVolume}
            onChange={(event) => controller.setAmbientVolume(Number(event.target.value))}
          />
        </label>
      </aside>
    </section>
  );
}
