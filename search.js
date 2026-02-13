// search.js — Strip 2 skeleton (Mapbox map + listing tiles + ad tiles)
// Build: 2026-02-11 — Mapbox activated + Firestore integration
// IDs: qBox (search input), mapCanvas (map container), grid (tile grid)
//
// FIX: Text searches are GLOBAL — no viewport filtering.
//      Map auto-zooms (fitBounds) to show all matching results.
//      Clearing search resets to all listings.
//      Geocoding: search bar geocodes city names and flies the map there.

// 🔑 Mapbox token (activated)
const MAPBOX_TOKEN = "pk.eyJ1IjoiZ3VhcmFudGVlZGNvbW1pc3Npb24tY29tIiwiYSI6ImNtaW1idDMwbjFjMWUzZHE3ZzY4ZjBob3IifQ.lF5BvHIsT_SVe0f6mT5nRw";

mapboxgl.accessToken = MAPBOX_TOKEN;

// --- DOM refs (null-safe — only elements that exist in the HTML) -------------
const els = {
  map:       document.getElementById("mapCanvas"),  // map container
  q:         document.getElementById("qBox"),        // search input
  grid:      document.getElementById("grid"),        // tile grid
  count:     document.getElementById("count"),       // result count label
  sortSelect: document.getElementById("sortSelect"), // may not exist on every page
};

// Optional elements that may or may not be in the HTML.
// We grab them here but always null-check before use.
const optEls = {
  minCommissionType: document.getElementById("minCommissionType"),
  planFilter:        document.getElementById("planFilter"),
  applyBtn:          document.getElementById("applyBtn"),
  locateBtn:         document.getElementById("locateBtn"),
};

let map;
let markers = [];

// --- Demo dataset -----------------------------------------------------------
function localCurrentListingToItem() {
  const form = JSON.parse(localStorage.getItem("formData") || "{}");
  const agent = JSON.parse(localStorage.getItem("agentListing") || "{}");
  if (!form.address) return null;

  const lat = 33.5427;
  const lng = -117.7854;

  const plan = (localStorage.getItem("selectedPlan") || "Listed Property Basic").trim();
  const photos = Array.isArray(agent.photos) ? agent.photos : [];
  const primaryIndex = typeof agent.primaryIndex === "number" ? agent.primaryIndex : 0;

  return {
    id: "local-1",
    address: form.address,
    shortAddress: form.address.split(",")[0] || form.address,
    apn: form.apn || "",
    price: Number(agent.price || 0),
    commission: Number(agent.commission || form.commission || 0),
    commissionType: agent.commissionType || form.commissionType || "%",
    bannerText: agent.bannerText || "",
    description: agent.description || "",
    plan,
    lat, lng,
    photos,
    primaryIndex,
    contact: {
      brokerage: form.brokerage || "",
      agent: form.agent || "",
      agentPhone: form.agentPhone || "",
      ownerPhone: form.agentPhone || "",
      ownerEmail: form.brokerage || "",
    },
    createdAt: Date.now(),
  };
}

const demoListings = [
  {
    id: "demo-101",
    address: "123 Ocean Ave, Laguna Beach, CA 92651",
    shortAddress: "123 Ocean Ave",
    apn: "APN-123-456",
    price: 2450000,
    commission: 2.5,
    commissionType: "%",
    bannerText: "Open Sun 1–4",
    description: "Panoramic ocean views with indoor-outdoor living. Walk to beach & village.",
    plan: "Listed Property Plus",
    lat: 33.542, lng: -117.783,
    photos: ["https://images.unsplash.com/photo-1494526585095-c41746248156?q=80&w=1200&auto=format&fit=crop"],
    primaryIndex: 0,
    contact: { brokerage: "Coastal Realty", agent: "Ava Nguyen", agentPhone: "(949) 555-1234" },
    createdAt: Date.now() - 1000 * 60 * 60 * 4,
  },
  {
    id: "demo-102",
    address: "88 Cliff Dr, Laguna Beach, CA 92651",
    shortAddress: "88 Cliff Dr",
    apn: "APN-987-654",
    price: 1795000,
    commission: 15000,
    commissionType: "$",
    bannerText: "",
    description: "Cottage charm near Heisler Park. Refreshed interiors and a sunny yard.",
    plan: "Listed Property Basic",
    lat: 33.545, lng: -117.789,
    photos: ["https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=1200&auto=format&fit=crop"],
    primaryIndex: 0,
    contact: { brokerage: "Blue Door Homes", agent: "Miguel Ortega", agentPhone: "(949) 555-7788" },
    createdAt: Date.now() - 1000 * 60 * 60 * 8,
  },
  {
    id: "demo-103",
    address: "15 Temple Hills Dr, Laguna Beach, CA 92651",
    shortAddress: "15 Temple Hills Dr",
    apn: "APN-555-222",
    price: 3250000,
    commission: 3,
    commissionType: "%",
    bannerText: "New Price",
    description: "Architectural with glass walls and canyon-to-ocean vistas.",
    plan: "FSBO Plus",
    lat: 33.538, lng: -117.779,
    photos: ["https://images.unsplash.com/photo-1570129477492-45c003edd2be?q=80&w=1200&auto=format&fit=crop"],
    primaryIndex: 0,
    contact: { ownerPhone: "(949) 555-9900", ownerEmail: "owner@example.com" },
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
  },
];

const adTiles = [
  {
    id: "ad-1",
    title: "Promote Your Listing",
    line: "Premium Placement puts you above the pack.",
    cta: "Upgrade for $10",
    href: "/upsell.html",
  },
  {
    id: "ad-2",
    title: "Loan Rates Update",
    line: "Local lenders competing for your buyers.",
    cta: "View offers",
    href: "#",
  },
];

// --- State -------------------------------------------------------------------
let allListings = [];
let filtered = [];

// --- Geocoding ---------------------------------------------------------------
// Cache to avoid repeat API calls for the same query
const geocodeCache = new Map();

async function geocodeQuery(queryText) {
  const q = (queryText || "").trim();
  if (!q || !MAPBOX_TOKEN) return null;

  // Check cache first
  if (geocodeCache.has(q.toLowerCase())) return geocodeCache.get(q.toLowerCase());

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=1&access_token=${MAPBOX_TOKEN}`;
    const resp = await fetch(url);
    const data = await resp.json();
    const feature = data?.features?.[0];

    if (!feature) {
      geocodeCache.set(q.toLowerCase(), null);
      return null;
    }

    const result = {
      center: feature.center || null,   // [lng, lat]
      bbox: feature.bbox || null,       // [sw_lng, sw_lat, ne_lng, ne_lat]
      placeName: feature.place_name || q,
    };

    geocodeCache.set(q.toLowerCase(), result);
    return result;
  } catch (err) {
    console.warn("[geocode] Failed for:", q, err);
    return null;
  }
}

// --- Map ---------------------------------------------------------------------
function initMap(center = [-117.7854, 33.5427], zoom = 12.5) {
  map = new mapboxgl.Map({
    container: "mapCanvas",
    style: "mapbox://styles/mapbox/streets-v12",
    center,
    zoom,
  });

  map.addControl(new mapboxgl.NavigationControl());
}

function clearMarkers() {
  markers.forEach(m => m.remove());
  markers = [];
}

// Returns true if lat/lng are real coordinates (not 0,0 or NaN)
function isValidLatLng(lat, lng) {
  const la = Number(lat), lo = Number(lng);
  return isFinite(la) && isFinite(lo) && (la !== 0 || lo !== 0)
    && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
}

function addMarkers(items) {
  clearMarkers();

  const bounds = new mapboxgl.LngLatBounds();
  let hasValidBounds = false;

  items.forEach(item => {
    // Skip items without valid coordinates
    if (!isValidLatLng(item.lat, item.lng)) return;

    const el = document.createElement("div");
    el.style.width = "10px";
    el.style.height = "10px";
    el.style.background = "#dc2626";
    el.style.border = "2px solid #fff";
    el.style.borderRadius = "50%";
    el.style.boxShadow = "0 1px 2px rgba(0,0,0,.3)";
    el.title = `${item.shortAddress || item.address} — ${fmtUSD(item.price)}`;

    const marker = new mapboxgl.Marker(el)
      .setLngLat([item.lng, item.lat])
      .addTo(map);

    el.addEventListener("click", () => {
      window.location.href = `/listing.html?id=${encodeURIComponent(item.id)}`;
    });

    markers.push(marker);
    bounds.extend([item.lng, item.lat]);
    hasValidBounds = true;
  });

  // AUTO-ZOOM: Fit the map to show ALL result markers (if we have any)
  if (hasValidBounds && !bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
  }
}

// --- Render tiles ------------------------------------------------------------
function fmtUSD(n) {
  const v = Number(n || 0);
  if (!v) return "$—";
  return "$" + v.toLocaleString();
}
function commissionLabel(item) {
  if (!item.commission) return "Commission: —";
  if (item.commissionType === "$") return `Commission: $${Math.round(item.commission).toLocaleString()}`;
  const est = item.price ? ` (~$${Math.round(item.price * (item.commission / 100)).toLocaleString()})` : "";
  return `Commission: ${item.commission}%${est}`;
}

function renderTiles(items) {
  const grid = els.grid;
  if (!grid) return;
  grid.innerHTML = "";

  if (items.length === 0) {
    grid.innerHTML = `<div class="text-sm text-gray-500 p-4">No listings match your search.</div>`;
    if (els.count) els.count.textContent = "0";
    return;
  }

  const AD_EVERY = 6;
  let adIndex = 0;

  items.forEach((item, idx) => {
    if (idx > 0 && idx % AD_EVERY === 0 && adIndex < adTiles.length) {
      grid.appendChild(renderAdTile(adTiles[adIndex++]));
    }

    const a = document.createElement("a");
    a.href = `/listing.html?id=${encodeURIComponent(item.id)}`;
    a.className = "tile relative block hover:shadow-md transition-shadow";
    a.innerHTML = `
      <div class="relative">
        <img src="${(item.photos && item.photos[item.primaryIndex || 0]) || ""}" alt="Listing photo">
        ${item.bannerText ? `<div class="banner">${escapeHTML(item.bannerText)}</div>` : ""}
        <div class="badge">${escapeHTML(item.plan || "—")}</div>
      </div>
      <div class="body">
        <div class="addr">${escapeHTML(item.shortAddress || item.address)}</div>
        <div class="price">${fmtUSD(item.price)}</div>
        <div class="meta">${escapeHTML(commissionLabel(item))}</div>
      </div>
    `;
    grid.appendChild(a);
  });

  if (els.count) els.count.textContent = String(items.length);
}

function renderAdTile(ad) {
  const div = document.createElement("a");
  div.href = ad.href || "#";
  div.className = "tile ad block hover:shadow-md transition-shadow";
  div.innerHTML = `
    <div class="body">
      <div class="tag">Sponsored</div>
      <div class="addr mt-1">${escapeHTML(ad.title)}</div>
      <div class="meta mt-1">${escapeHTML(ad.line)}</div>
      <div class="mt-2">
        <span class="inline-block bg-blue-600 text-white text-xs px-3 py-1 rounded">${escapeHTML(ad.cta)}</span>
      </div>
    </div>
  `;
  return div;
}

function escapeHTML(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}

// --- Filters / sorting -------------------------------------------------------
// CRITICAL: This always searches the ENTIRE allListings array.
//           There is NO viewport/bounds filtering. The map auto-zooms to fit results.
//           When user searches a city/location, the map geocodes and flies there.
async function applyFilters() {
  // Read search text from #qBox
  const q = (els.q ? els.q.value : "").trim();
  const qLower = q.toLowerCase();

  // Optional filter elements — read only if they exist in the DOM
  const plan = optEls.planFilter ? optEls.planFilter.value : "";
  const comm = optEls.minCommissionType ? optEls.minCommissionType.value : "";

  // GLOBAL SEARCH: Always start from the full dataset — never from a viewport subset
  let result = allListings.slice();

  // Text filter — matches against full address string
  if (qLower) {
    result = result.filter(i =>
      (i.address || "").toLowerCase().includes(qLower) ||
      (i.shortAddress || "").toLowerCase().includes(qLower)
    );
  }

  // Plan filter (optional UI)
  if (plan) {
    result = result.filter(i => (i.plan || "").toLowerCase() === plan.toLowerCase());
  }

  // Commission filter (optional UI)
  if (comm) {
    const [type, minStr] = comm.split(":");
    const min = Number(minStr);
    result = result.filter(i => {
      if (!i.commission) return false;
      if (type === "%") {
        return i.commissionType === "%" && Number(i.commission) >= min;
      } else {
        if (i.commissionType === "$") return Number(i.commission) >= min;
        if (i.commissionType === "%" && i.price) {
          const est = i.price * (Number(i.commission) / 100);
          return est >= min;
        }
        return false;
      }
    });
  }

  // Sort
  const sort = els.sortSelect ? els.sortSelect.value : "newest";
  if (sort === "newest") {
    result.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  } else if (sort === "price-asc") {
    result.sort((a,b) => (a.price||0) - (b.price||0));
  } else if (sort === "price-desc") {
    result.sort((a,b) => (b.price||0) - (a.price||0));
  } else if (sort === "commission-desc") {
    const est = (i) => {
      if (!i.commission) return 0;
      if (i.commissionType === "$") return Number(i.commission) || 0;
      if (i.price) return i.price * (Number(i.commission)/100);
      return 0;
    };
    result.sort((a,b) => est(b) - est(a));
  }

  filtered = result;

  // Render tiles (full list, no viewport clipping)
  renderTiles(filtered);

  // -----------------------------------------------------------------------
  // GEOCODE + MAP MOVE LOGIC
  // -----------------------------------------------------------------------
  // Strategy:
  //   1. If results have valid coords → fitBounds to show all markers
  //   2. If the user typed a search query → ALSO geocode the query text
  //      and fly the map to that city/location. This ensures the map moves
  //      even when there are zero matching listings in the database.
  //
  // This mirrors what the homepage does when it passes ?q=Newport to the
  // results page — but now it also works for subsequent searches.
  // -----------------------------------------------------------------------

  // Check if any results have plottable coordinates
  const hasPlottableResults = result.some(i => isValidLatLng(i.lat, i.lng));

  if (hasPlottableResults) {
    // Results have coords — place markers and let fitBounds handle the zoom
    addMarkers(filtered);
  } else {
    // No plottable results — clear old markers
    clearMarkers();
  }

  // Geocode the query text to move the map to that city/region
  if (q && map) {
    const geo = await geocodeQuery(q);
    if (geo?.center) {
      // If we have a bounding box (city/region), use fitBounds for better framing
      if (geo.bbox && Array.isArray(geo.bbox) && geo.bbox.length === 4) {
        map.fitBounds(
          [[geo.bbox[0], geo.bbox[1]], [geo.bbox[2], geo.bbox[3]]],
          { padding: 50, maxZoom: 14, duration: 1200 }
        );
      } else {
        // Point result — fly to center
        map.flyTo({ center: geo.center, zoom: 12, duration: 1200 });
      }
    }
    // If geocode returned nothing, we still showed tiles above — map just stays put
  }
}

// --- Geolocate ---------------------------------------------------------------
function useMyLocation() {
  if (!navigator.geolocation) return alert("Geolocation not supported.");
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude } = pos.coords;
    map.flyTo({ center: [longitude, latitude], zoom: 13.5 });
  }, () => alert("Could not get your location."));
}

// --- Firestore: Fetch live listings ------------------------------------------
async function fetchListingsFromFirestore() {
  try {
    const { db } = await import("/scripts/firebase-init.js");
    const { collection, query, orderBy, getDocs, limit } =
      await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

    const snap = await getDocs(
      query(collection(db, "listings"), orderBy("createdAt", "desc"), limit(200))
    );

    const results = [];
    snap.forEach(d => {
      const data = d.data() || {};

      const addr = data.address || "";
      const lat = Number(data.lat || 0);
      const lng = Number(data.lng || 0);

      let createdAtMs = 0;
      const ca = data.createdAt;
      if (ca) {
        if (typeof ca.toMillis === "function") createdAtMs = ca.toMillis();
        else if (typeof ca.toDate === "function") createdAtMs = ca.toDate().getTime();
        else if (typeof ca === "number") createdAtMs = ca;
      }

      results.push({
        id: d.id,
        address: addr,
        shortAddress: addr.split(",")[0] || addr,
        apn: data.apn || "",
        price: Number(data.price || 0),
        commission: Number(data.commission || 0),
        commissionType: data.commissionType || "%",
        bannerText: data.bannerText || "",
        description: data.description || "",
        plan: data.plan || "Listed Property Basic",
        lat: lat,
        lng: lng,
        photos: Array.isArray(data.photos) ? data.photos : [],
        primaryIndex: typeof data.primaryIndex === "number" ? data.primaryIndex : 0,
        contact: {
          brokerage: data.brokerage || "",
          agent: data.agentName || data.agent || "",
          agentPhone: data.agentPhone || "",
          ownerPhone: data.ownerPhone || "",
          ownerEmail: data.ownerEmail || "",
        },
        createdAt: createdAtMs,
      });
    });

    console.log("[search] Loaded", results.length, "listings from Firestore");
    return results;
  } catch (err) {
    console.warn("[search] Firestore fetch failed, falling back to demo data:", err);
    return [];
  }
}

// --- Boot --------------------------------------------------------------------
function buildLocalDataset() {
  const current = localCurrentListingToItem();
  const list = [...demoListings];
  if (current) {
    const dupIdx = list.findIndex(x => (x.address||"").toLowerCase() === current.address.toLowerCase());
    if (dupIdx >= 0) list.splice(dupIdx, 1);
    list.unshift(current);
  }
  return list;
}

function mergeListings(firestoreDocs, localDocs) {
  const seen = new Set();
  const merged = [];

  firestoreDocs.forEach(doc => {
    const key = (doc.address || "").toLowerCase().trim();
    if (key) seen.add(key);
    merged.push(doc);
  });

  localDocs.forEach(doc => {
    const key = (doc.address || "").toLowerCase().trim();
    if (!seen.has(key)) {
      merged.push(doc);
    }
  });

  return merged;
}

function initEvents() {
  // Wire optional buttons only if they exist
  if (optEls.applyBtn)  optEls.applyBtn.addEventListener("click", () => applyFilters());
  if (optEls.locateBtn) optEls.locateBtn.addEventListener("click", useMyLocation);
  if (els.sortSelect)   els.sortSelect.addEventListener("change", () => applyFilters());

  // Enter key in #qBox runs global search + geocode
  if (els.q) {
    els.q.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyFilters();
      }
    });

    // RESET LOGIC: When input is cleared, reset to show all listings
    els.q.addEventListener("input", () => {
      if (els.q.value.trim() === "") {
        applyFilters(); // No query → shows all listings + fits map to all
      }
    });
  }
}

(async function main() {
  if (!MAPBOX_TOKEN || MAPBOX_TOKEN.includes("YOUR_MAPBOX_TOKEN_HERE")) {
    console.warn("Mapbox token missing. Add your token in search.js for live maps.");
  }
  initMap();
  initEvents();

  // 1. Build local/demo dataset (instant, no network)
  const localDocs = buildLocalDataset();

  // 2. Fetch live listings from Firestore
  const firestoreDocs = await fetchListingsFromFirestore();

  // 3. Merge: Firestore wins on duplicates, demo fills in the rest
  allListings = mergeListings(firestoreDocs, localDocs);

  console.log("[search] Total listings after merge:", allListings.length,
    "(Firestore:", firestoreDocs.length, "/ Local:", localDocs.length, ")");

  // Initial render — show all listings, fit map to all markers
  await applyFilters();
})();
