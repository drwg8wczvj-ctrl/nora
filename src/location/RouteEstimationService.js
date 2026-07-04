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

// ── Nearby place search via OpenStreetMap Overpass API ─────────────────────

const NEARBY_TAGS = {
  grocery:    [["shop","supermarket"],["shop","grocery"],["shop","convenience"],["shop","food"]],
  pharmacy:   [["amenity","pharmacy"]],
  cafe:       [["amenity","cafe"]],
  restaurant: [["amenity","restaurant"],["amenity","fast_food"]],
  gym:        [["leisure","fitness_centre"],["amenity","fitness_centre"]],
  bank:       [["amenity","bank"]],
  atm:        [["amenity","atm"]],
  bakery:     [["shop","bakery"]],
  hospital:   [["amenity","hospital"],["amenity","clinic"]],
  park:       [["leisure","park"],["leisure","garden"]],
  school:     [["amenity","school"]],
  university: [["amenity","university"],["amenity","college"]],
  library:    [["amenity","library"]],
  post:       [["amenity","post_office"]],
  gas:        [["amenity","fuel"]],
  parking:    [["amenity","parking"]],
};

function matchOverpassCategory(query) {
  const q = (query ?? "").toLowerCase();
  if (/grocer|supermarket|billa|spar|hofer|lidl|aldi|kaufland|rewe|edeka|tesco|carrefour|food shop|lebensmittel/.test(q)) return "grocery";
  if (/pharma|drug|apotheke/.test(q)) return "pharmacy";
  if (/cafe|coffee|kaffee|espresso/.test(q)) return "cafe";
  if (/restaurant|pizzeria|eat out|dinner|lunch|takeaway|fast.?food|diner|bistro/.test(q)) return "restaurant";
  if (/gym|fitness|sport|workout/.test(q)) return "gym";
  if (/\batm\b|cash machine/.test(q)) return "atm";
  if (/\bbank\b/.test(q)) return "bank";
  if (/bak|bread|bäck|konditor/.test(q)) return "bakery";
  if (/hospital|clinic|doctor|arzt|notaufnahme/.test(q)) return "hospital";
  if (/\bpark\b|garden|grünanlage/.test(q)) return "park";
  if (/\bschool\b|schule/.test(q)) return "school";
  if (/universit|college|hochschule/.test(q)) return "university";
  if (/library|bücherei/.test(q)) return "library";
  if (/post.?office|postamt/.test(q)) return "post";
  if (/gas.?station|tankstelle|petrol/.test(q)) return "gas";
  if (/parking|parkhaus|parkplatz/.test(q)) return "parking";
  return null;
}

// Search Overpass API for the closest matching POI within radiusM metres of (lat,lng).
// Returns { name, address, lat, lng, distanceKm } or null.
export async function findNearbyPlace(query, lat, lng, radiusM = 2000) {
  if (!lat || !lng) return null;
  const cat = matchOverpassCategory(query);
  if (!cat) return null;
  const tags = NEARBY_TAGS[cat];

  const union = tags.flatMap(([k, v]) => [
    `node["${k}"="${v}"](around:${radiusM},${lat},${lng});`,
    `way["${k}"="${v}"](around:${radiusM},${lat},${lng});`,
  ]).join("");

  const oq = `[out:json][timeout:15];(${union});out center 10;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: oq,
    });
    const data = await res.json();
    const hits = (data.elements ?? [])
      .map((el) => {
        const elLat = el.lat ?? el.center?.lat;
        const elLng = el.lon ?? el.center?.lon;
        if (!elLat || !elLng) return null;
        const distKm = haversineKm(lat, lng, elLat, elLng);
        const name    = el.tags?.name ?? el.tags?.["name:en"] ?? cat;
        const street  = el.tags?.["addr:street"] ?? "";
        const num     = el.tags?.["addr:housenumber"] ?? "";
        const address = [street, num].filter(Boolean).join(" ");
        return { name, address, lat: elLat, lng: elLng, distanceKm: distKm };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return hits[0] ?? null;
  } catch {
    return null;
  }
}
