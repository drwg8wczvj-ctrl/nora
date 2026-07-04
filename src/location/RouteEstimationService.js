// ─── Route Estimation Service ──────────────────────────────────────────────
// Uses Google Maps APIs (via /api/places proxy) when available.
// Falls back to Haversine + speed formula when the key is not configured.

export const TRANSPORT_MODES = {
  walking:          { speed: 5,  label: 'Walking',          shortLabel: 'Walk',    icon: 'PersonStanding' },
  bicycle:          { speed: 16, label: 'Bicycle',          shortLabel: 'Bike',    icon: 'Bike' },
  public_transport: { speed: 28, label: 'Public transport', shortLabel: 'Transit', icon: 'Bus' },
  car:              { speed: 45, label: 'Car',              shortLabel: 'Drive',   icon: 'Car' },
  mixed:            { speed: 25, label: 'Mixed',            shortLabel: 'Mixed',   icon: 'Navigation' },
};

export const TRANSPORT_MODE_LIST = Object.entries(TRANSPORT_MODES).map(([id, v]) => ({ id, ...v }));

// ── Haversine (straight-line fallback) ────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R   = 6371;
  const rad = (d) => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Synchronous estimate (used in system-prompt pre-computation and timeline).
// +25% urban detour + 5 min fixed overhead.
export function estimateTravelMinutes(from, to, mode = 'mixed') {
  if (!from?.lat || !from?.lng || !to?.lat || !to?.lng) return null;
  const distKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  if (distKm < 0.05) return 2;
  const { speed } = TRANSPORT_MODES[mode] ?? TRANSPORT_MODES.mixed;
  return Math.ceil((distKm / speed) * 60 * 1.25) + 5;
}

// ── Google Maps helpers (async, server-proxied) ────────────────────────────

// Geocode an address → [{line1, line2, shortName, displayName, lat, lng}]
export async function geocodeAddress(query) {
  if (!query?.trim()) return [];
  try {
    const res = await fetch(`/api/places?action=geocode&q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("api error");
    const data = await res.json();
    if (data.results?.length) return data.results;
  } catch {}
  // Nominatim fallback
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    const raw  = await resp.json();
    return raw.map((r) => {
      const a = r.address ?? {};
      const street = a.road ?? a.pedestrian ?? a.footway ?? "";
      const num    = a.house_number ?? "";
      const line1  = street ? (num ? `${street} ${num}` : street) : (a.amenity ?? r.display_name.split(",")[0].trim());
      const city   = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? "";
      return { line1: line1.trim(), line2: city.trim(), shortName: city ? `${line1.trim()}, ${city.trim()}` : line1.trim(), displayName: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
    });
  } catch { return []; }
}

// Real travel time via Google Distance Matrix.
// Returns minutes, or falls back to Haversine estimate on error.
export async function fetchTravelMinutes(from, to, mode = 'mixed') {
  if (!from?.lat || !from?.lng || !to?.lat || !to?.lng) return null;
  try {
    const origins      = `${from.lat},${from.lng}`;
    const destinations = `${to.lat},${to.lng}`;
    const res = await fetch(`/api/places?action=distance&origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&mode=${mode}`);
    if (res.ok) {
      const d = await res.json();
      if (d.durationMin != null) return d.durationMin;
    }
  } catch {}
  return estimateTravelMinutes(from, to, mode);
}

// ── Google Maps category → Places API type/keyword ────────────────────────

const PLACE_TYPES = {
  grocery:    { type: "grocery_or_supermarket" },
  pharmacy:   { type: "pharmacy" },
  cafe:       { type: "cafe" },
  restaurant: { type: "restaurant" },
  gym:        { type: "gym" },
  bank:       { type: "bank" },
  atm:        { type: "atm" },
  bakery:     { type: "bakery" },
  hospital:   { type: "hospital" },
  park:       { type: "park" },
  school:     { type: "school" },
  university: { type: "university" },
  library:    { type: "library" },
  post:       { type: "post_office" },
  gas:        { type: "gas_station" },
  parking:    { type: "parking" },
  bar:        { type: "bar" },
  supermarket:{ type: "supermarket" },
};

function matchPlaceCategory(query) {
  const q = (query ?? "").toLowerCase();
  if (/grocer|supermarket|billa|spar|hofer|lidl|aldi|kaufland|rewe|edeka|tesco|carrefour|lebensmittel/.test(q)) return "grocery";
  if (/\bsupermarket\b/.test(q)) return "supermarket";
  if (/pharma|drug|apotheke/.test(q)) return "pharmacy";
  if (/cafe|coffee|kaffee|espresso/.test(q)) return "cafe";
  if (/restaurant|pizzeria|takeaway|fast.?food|diner|bistro|essen/.test(q)) return "restaurant";
  if (/gym|fitness|sport|workout/.test(q)) return "gym";
  if (/\batm\b|cash machine|bankomat/.test(q)) return "atm";
  if (/\bbank\b/.test(q)) return "bank";
  if (/bak|bread|bäck|konditor/.test(q)) return "bakery";
  if (/hospital|clinic|doctor|arzt/.test(q)) return "hospital";
  if (/\bpark\b|garden|grünanlage/.test(q)) return "park";
  if (/\bschool\b|schule/.test(q)) return "school";
  if (/universit|college|hochschule/.test(q)) return "university";
  if (/library|bücherei/.test(q)) return "library";
  if (/post.?office|postamt/.test(q)) return "post";
  if (/gas.?station|tankstelle|petrol/.test(q)) return "gas";
  if (/parking|parkhaus|parkplatz/.test(q)) return "parking";
  if (/\bbar\b|\bpub\b|kneipe/.test(q)) return "bar";
  return null;
}

// Find the nearest real-world POI matching `query` near (lat, lng).
// Returns { name, address, lat, lng, distanceKm, travelMin } or null.
export async function findNearbyPlace(query, lat, lng, radiusM = 2000) {
  if (!lat || !lng) return null;
  const cat = matchPlaceCategory(query);

  try {
    // ── Google Places path ────────────────────────────────────────────────
    const params = new URLSearchParams({ action: "nearby", lat, lng, radius: Math.min(radiusM, 5000) });
    if (cat && PLACE_TYPES[cat]) {
      params.set("type", PLACE_TYPES[cat].type);
    } else {
      // Unknown category — fall back to keyword search
      params.set("keyword", query);
    }
    const res = await fetch(`/api/places?${params}`);
    if (res.ok) {
      const data  = await res.json();
      const places = data.places ?? [];
      if (places.length > 0) {
        // Sort by distance from origin (Google returns by prominence, not distance)
        const withDist = places.map((p) => ({
          ...p,
          distanceKm: haversineKm(lat, lng, p.lat, p.lng),
        })).sort((a, b) => a.distanceKm - b.distanceKm);

        const best = withDist[0];
        return best;
      }
    }
  } catch {}

  // ── Overpass fallback (if Google key not configured) ─────────────────────
  if (!cat) return null;
  const OVERPASS_TAGS = {
    grocery:    [["shop","supermarket"],["shop","grocery"],["shop","convenience"]],
    supermarket:[["shop","supermarket"]],
    pharmacy:   [["amenity","pharmacy"]],
    cafe:       [["amenity","cafe"]],
    restaurant: [["amenity","restaurant"],["amenity","fast_food"]],
    gym:        [["leisure","fitness_centre"],["amenity","fitness_centre"]],
    bank:       [["amenity","bank"]],
    atm:        [["amenity","atm"]],
    bakery:     [["shop","bakery"]],
    hospital:   [["amenity","hospital"],["amenity","clinic"]],
    park:       [["leisure","park"]],
    school:     [["amenity","school"]],
    university: [["amenity","university"],["amenity","college"]],
    library:    [["amenity","library"]],
    post:       [["amenity","post_office"]],
    gas:        [["amenity","fuel"]],
    parking:    [["amenity","parking"]],
    bar:        [["amenity","bar"],["amenity","pub"]],
  };
  const tags = OVERPASS_TAGS[cat];
  if (!tags) return null;

  const union = tags.flatMap(([k, v]) => [
    `node["${k}"="${v}"](around:${radiusM},${lat},${lng});`,
    `way["${k}"="${v}"](around:${radiusM},${lat},${lng});`,
  ]).join("");
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: `[out:json][timeout:15];(${union});out center 10;`,
    });
    const d = await r.json();
    const hits = (d.elements ?? []).map((el) => {
      const eLat = el.lat ?? el.center?.lat;
      const eLng = el.lon ?? el.center?.lon;
      if (!eLat || !eLng) return null;
      const name    = el.tags?.name ?? cat;
      const street  = el.tags?.["addr:street"] ?? "";
      const num     = el.tags?.["addr:housenumber"] ?? "";
      return { name, address: [street, num].filter(Boolean).join(" "), lat: eLat, lng: eLng, distanceKm: haversineKm(lat, lng, eLat, eLng) };
    }).filter(Boolean).sort((a, b) => a.distanceKm - b.distanceKm);
    return hits[0] ?? null;
  } catch { return null; }
}

export function getModeLabel(mode) { return TRANSPORT_MODES[mode]?.label ?? 'Mixed'; }
export function getModeShortLabel(mode) { return TRANSPORT_MODES[mode]?.shortLabel ?? 'Mixed'; }
