module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: "GOOGLE_MAPS_API_KEY not set" });

  const { action } = req.query;

  try {
    // ── Geocode an address string → [{line1, line2, shortName, displayName, lat, lng}]
    if (action === "geocode") {
      const { q } = req.query;
      if (!q) return res.status(400).json({ error: "q required" });
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.status !== "OK" && d.status !== "ZERO_RESULTS") {
        return res.status(502).json({ error: d.error_message ?? d.status });
      }
      const results = (d.results ?? []).map((item) => {
        const loc   = item.geometry.location;
        const comps = item.address_components ?? [];
        const get   = (type) => comps.find((c) => c.types.includes(type))?.long_name ?? "";
        const streetNum = get("street_number");
        const route     = get("route");
        const city      = get("locality") || get("administrative_area_level_2") || get("administrative_area_level_1");
        const line1     = route ? (streetNum ? `${route} ${streetNum}` : route) : item.formatted_address.split(",")[0].trim();
        return {
          line1:       line1.trim(),
          line2:       city.trim(),
          shortName:   city ? `${line1.trim()}, ${city.trim()}` : line1.trim(),
          displayName: item.formatted_address,
          lat:         loc.lat,
          lng:         loc.lng,
        };
      });
      return res.json({ results });
    }

    // ── Nearby place search → [{name, address, lat, lng, placeId, openNow}]
    if (action === "nearby") {
      const { lat, lng, keyword, type, radius = 2000 } = req.query;
      if (!lat || !lng) return res.status(400).json({ error: "lat/lng required" });
      let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&key=${key}`;
      if (type)    url += `&type=${encodeURIComponent(type)}`;
      if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
      const r = await fetch(url);
      const d = await r.json();
      const places = (d.results ?? []).map((p) => ({
        name:    p.name,
        address: p.vicinity ?? "",
        lat:     p.geometry.location.lat,
        lng:     p.geometry.location.lng,
        placeId: p.place_id,
        rating:  p.rating ?? null,
        openNow: p.opening_hours?.open_now ?? null,
      }));
      return res.json({ places });
    }

    // ── Distance matrix → {durationMin, distanceKm, durationText, distanceText}
    if (action === "distance") {
      const { origins, destinations, mode = "walking" } = req.query;
      if (!origins || !destinations) return res.status(400).json({ error: "origins/destinations required" });
      const gmMode = mode === "public_transport" ? "transit" : mode === "bicycle" ? "bicycling" : mode === "car" ? "driving" : "walking";
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&mode=${gmMode}&key=${key}`;
      const r = await fetch(url);
      const d = await r.json();
      const elem = d.rows?.[0]?.elements?.[0];
      if (!elem || elem.status !== "OK") return res.json({ durationMin: null, distanceKm: null });
      return res.json({
        durationMin:  Math.ceil(elem.duration.value / 60),
        distanceKm:   Math.round(elem.distance.value / 10) / 100,
        durationText: elem.duration.text,
        distanceText: elem.distance.text,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
