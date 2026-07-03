import React, { useState, useRef, useEffect } from "react";
import { MapPin, X, Plus } from "lucide-react";
import "./LocationField.css";

export default function LocationField({ value, onChange, savedPlaces = [], placeholder = "Add location…" }) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const wrapRef  = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  const filtered = query
    ? savedPlaces.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : savedPlaces;

  const handleSelect = (place) => {
    onChange({ name: place.name, address: place.address ?? "", lat: place.lat ?? null, lng: place.lng ?? null, placeId: place.id });
    setOpen(false);
    setQuery("");
  };

  const handleCustom = () => {
    if (!query.trim()) return;
    onChange({ name: query.trim(), address: "", lat: null, lng: null, placeId: null });
    setOpen(false);
    setQuery("");
  };

  if (value) {
    return (
      <div className="lf-chip">
        <MapPin size={12} />
        <span className="lf-chip-name">{value.name}</span>
        <button className="lf-chip-clear" onClick={() => onChange(null)} aria-label="Remove location">
          <X size={11} />
        </button>
      </div>
    );
  }

  return (
    <div className="lf-wrap" ref={wrapRef}>
      <div className="lf-input-row">
        <MapPin size={13} className="lf-input-icon" />
        <input
          ref={inputRef}
          className="lf-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (
        <div className="lf-dropdown">
          {filtered.map((place) => (
            <button key={place.id} className="lf-opt" onMouseDown={() => handleSelect(place)}>
              <MapPin size={11} className="lf-opt-icon" />
              <div className="lf-opt-info">
                <span className="lf-opt-name">{place.name}</span>
                {place.address && <span className="lf-opt-addr">{place.address}</span>}
              </div>
            </button>
          ))}
          {query.trim() && !filtered.find((p) => p.name.toLowerCase() === query.toLowerCase()) && (
            <button className="lf-opt lf-opt-custom" onMouseDown={handleCustom}>
              <Plus size={11} className="lf-opt-icon" />
              <span className="lf-opt-name">Use "{query.trim()}"</span>
            </button>
          )}
          {!filtered.length && !query && (
            <div className="lf-empty">No saved places yet.<br />Add them in Settings → Places.</div>
          )}
        </div>
      )}
    </div>
  );
}
