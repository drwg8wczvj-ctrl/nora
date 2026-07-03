// ─── Route Estimation Service ──────────────────────────────────────────────
// Pure logic: no React, no Supabase. Designed to be swappable with a real
// Maps API (Google, Mapbox, Apple) when coordinates are available.

export const TRANSPORT_MODES = {
  walking:          { speed: 5,  label: 'Walking',          shortLabel: 'Walk',    icon: 'PersonStanding' },
  bicycle:          { speed: 16, label: 'Bicycle',          shortLabel: 'Bike',    icon: 'Bike' },
  public_transport: { speed: 28, label: 'Public transport', shortLabel: 'Transit', icon: 'Bus' },
  car:              { speed: 45, label: 'Car',              shortLabel: 'Drive',   icon: 'Car' },
  mixed:            { speed: 25, label: 'Mixed',            shortLabel: 'Mixed',   icon: 'Navigation' },
};

export const TRANSPORT_MODE_LIST = Object.entries(TRANSPORT_MODES).map(([id, v]) => ({ id, ...v }));

// Straight-line distance in km between two lat/lng points (Haversine formula)
function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const rad  = (d) => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Estimate travel time in minutes. Returns null if either location has no coords.
// Adds 25% urban detour factor and a 5-minute fixed overhead (walking to/from stop, etc.)
export function estimateTravelMinutes(from, to, mode = 'mixed') {
  if (!from?.lat || !from?.lng || !to?.lat || !to?.lng) return null;
  const distKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  if (distKm < 0.05) return 2; // same block — negligible
  const { speed } = TRANSPORT_MODES[mode] ?? TRANSPORT_MODES.mixed;
  return Math.ceil((distKm / speed) * 60 * 1.25) + 5;
}

// Format a Nominatim address object into "Street Number\nCity" style
function formatAddress(r) {
  const a = r.address ?? {};

  // Line 1: road + house number (or fallback to amenity / display_name first chunk)
  const street = a.road ?? a.pedestrian ?? a.footway ?? a.cycleway ?? "";
  const num    = a.house_number ?? "";
  const line1  = street ? (num ? `${street} ${num}` : street) : (a.amenity ?? r.display_name.split(",")[0].trim());

  // Line 2: city-level name
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? "";

  return {
    line1:       line1.trim(),
    line2:       city.trim(),
    shortName:   city ? `${line1.trim()}, ${city.trim()}` : line1.trim(),
    displayName: r.display_name,
    lat:         parseFloat(r.lat),
    lng:         parseFloat(r.lon),
  };
}

// Geocode an address using Nominatim (OpenStreetMap, no API key needed)
export async function geocodeAddress(query) {
  if (!query?.trim()) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`;
  try {
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await resp.json();
    return data.map(formatAddress);
  } catch {
    return [];
  }
}

export function getModeLabel(mode) {
  return TRANSPORT_MODES[mode]?.label ?? 'Mixed';
}

export function getModeShortLabel(mode) {
  return TRANSPORT_MODES[mode]?.shortLabel ?? 'Mixed';
}
