import React, { useState, useRef } from "react";
import { MapPin, Plus, Trash2, Search, Check, Navigation, Car, Bus, Bike, PersonStanding } from "lucide-react";
import { geocodeAddress, TRANSPORT_MODE_LIST } from "../location";
import "./SavedPlacesManager.css";

const MODE_ICONS = { walking: PersonStanding, bicycle: Bike, public_transport: Bus, car: Car, mixed: Navigation };

function uid() { return Math.random().toString(36).slice(2, 10); }

function PlaceRow({ place, onDelete }) {
  return (
    <div className="spm-place-row">
      <div className="spm-place-icon">
        <MapPin size={13} />
      </div>
      <div className="spm-place-info">
        <span className="spm-place-name">{place.name}</span>
        {place.address && <span className="spm-place-addr">{place.address}</span>}
      </div>
      <button className="spm-delete-btn" onClick={() => onDelete(place.id)} aria-label="Remove place">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function AddPlaceForm({ onAdd, onCancel }) {
  const [name,    setName]    = useState("");
  const [address, setAddress] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const handleAddressChange = (v) => {
    setAddress(v);
    setSelected(null);
    clearTimeout(debounceRef.current);
    if (v.trim().length < 3) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await geocodeAddress(v);
      setResults(res);
      setSearching(false);
    }, 600);
  };

  const handlePickResult = (r) => {
    setAddress(r.shortName);
    setSelected(r);
    setResults([]);
  };

  const fmtResult = (r) => r.line1 && r.line2 ? { top: r.line1, sub: r.line2 } : { top: r.shortName, sub: null };

  const handleSave = () => {
    if (!name.trim()) return;
    onAdd({
      id:      uid(),
      name:    name.trim(),
      address: selected ? selected.shortName : address.trim(),
      lat:     selected?.lat ?? null,
      lng:     selected?.lng ?? null,
      tags:    [],
    });
  };

  return (
    <div className="spm-add-form">
      <input
        className="spm-input"
        placeholder="Place name (e.g. Work, Gym)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <div className="spm-address-wrap">
        <div className="spm-address-row">
          <Search size={12} className="spm-search-icon" />
          <input
            className="spm-input spm-address-input"
            placeholder="Address (optional, for travel time)"
            value={address}
            onChange={(e) => handleAddressChange(e.target.value)}
          />
          {searching && <span className="spm-searching">…</span>}
        </div>
        {results.length > 0 && (
          <div className="spm-geo-results">
            {results.map((r, i) => {
              const fmt = fmtResult(r);
              return (
                <button key={i} className="spm-geo-opt" onClick={() => handlePickResult(r)}>
                  <MapPin size={11} />
                  <span className="spm-geo-opt-info">
                    <span className="spm-geo-opt-line1">{fmt.top}</span>
                    {fmt.sub && <span className="spm-geo-opt-line2">{fmt.sub}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {selected && (
        <div className="spm-coords-badge">
          <Check size={11} /> Coordinates saved — travel time will be accurate
        </div>
      )}
      <div className="spm-add-actions">
        <button className="spm-cancel-btn" onClick={onCancel}>Cancel</button>
        <button className="spm-save-btn" onClick={handleSave} disabled={!name.trim()}>
          <Plus size={13} /> Save place
        </button>
      </div>
    </div>
  );
}

export default function SavedPlacesManager({ savedPlaces, onSavedPlacesChange, transportProfile, onTransportProfileChange }) {
  const [adding, setAdding] = useState(false);

  const handleAdd = (place) => {
    onSavedPlacesChange([...savedPlaces, place]);
    setAdding(false);
  };

  const handleDelete = (id) => {
    onSavedPlacesChange(savedPlaces.filter((p) => p.id !== id));
  };

  const setMode = (mode) => {
    onTransportProfileChange({ ...transportProfile, defaultMode: mode });
  };

  return (
    <div className="spm-root">
      {/* Transport mode */}
      <div className="spm-section-head">Default transport</div>
      <div className="spm-mode-row">
        {TRANSPORT_MODE_LIST.map(({ id, shortLabel }) => {
          const Icon = MODE_ICONS[id] ?? Navigation;
          const active = (transportProfile?.defaultMode ?? 'mixed') === id;
          return (
            <button
              key={id}
              className={`spm-mode-btn${active ? " active" : ""}`}
              onClick={() => setMode(id)}
              title={shortLabel}
            >
              <Icon size={14} />
              <span>{shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Saved places list */}
      <div className="spm-section-head" style={{ marginTop: 14 }}>
        Saved places
        {!adding && (
          <button className="spm-add-btn" onClick={() => setAdding(true)}>
            <Plus size={12} /> Add
          </button>
        )}
      </div>

      {savedPlaces.length === 0 && !adding && (
        <p className="spm-empty">No saved places yet. Add your home, office, or gym to enable travel-time planning.</p>
      )}

      {savedPlaces.map((place) => (
        <PlaceRow key={place.id} place={place} onDelete={handleDelete} />
      ))}

      {adding && (
        <AddPlaceForm onAdd={handleAdd} onCancel={() => setAdding(false)} />
      )}
    </div>
  );
}
