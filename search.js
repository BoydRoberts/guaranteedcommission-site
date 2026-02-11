//
// search.js — Strip 2 skeleton (Mapbox map + listing tiles + ad tiles)
//
// Uses local demo data + whatever is in localStorage from your flows.
// Later we can flip to Firestore geosearch.

//🔑 Mapbox token for map rendering
const MAPBOX_TOKEN = "pk.eyJ1IjoiZ3VhcmFudGVlZGNvbW1pc3Npb24tY29tIiwiYSI6ImNtaW1idDMwbjFjMWUzZHE3ZzY4ZjBob3IifQ.lF5BvHIsT_SVe0f6mT5nRw";

mapboxgl.accessToken = MAPBOX_TOKEN;

const els = {
  map: document.getElementById("map"),
  q: document.getElementById("q"),
  minCommissionType: document.getElementById("minCommissionType"),
  planFilter: document.getElementById("planFilter"),
  applyBtn: document.getElementById("applyBtn"),
  locateBtn: document.getElementById("locateBtn"),
  grid: document.getElementById("grid"),
  count: document.getElementById("count"),
  sortSelect: document.getElementById("sortSelect"),
};

let map;
let markers = [];

// --- Demo dataset -----------------------------------------------------------
// Pull any locally created listing (formData + agentListing) and turn into one item.
function localCurrentListingToItem() {
  const form = JSON.parse(localStorage.getItem("formData") || "{}");
  const agent = JSON.parse(localStorage.getItem("agentListing") || "{}");
  if (!form.address) return null;

  // Naive lat/lng stub (Laguna Beach center) — until we geocode
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

// Some extra demo items so the grid feels real.
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

// Ads to sprinkle in (tile-style)
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

// --- Map ---------------------------------------------------------------------
function initMap(center = [-117.7854, 33.5427], zoom = 12.5) {
  map = new mapboxgl.Map({
    container: "map",
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

function addMarkers(items) {
  clearMarkers();
  items.forEach(item => {
    const el = document.createElement("div");
    el.style.width = "10px";
    el.style.height = "10px";
    el.style.background = "#dc2626";
    el.style.border = "2px solid #fff";
    el.style.borderRadius = "50%";
    el.style.boxShadow = "0 1px 2px rgba(0,0,0,.3)";
    el.title = `${item.shortAddress} — ${fmtUSD(item.price)}`;

    const marker = new mapboxgl.Marker(el)
      .setLngLat([item.lng, item.lat])
      .addTo(map);

    el.addEventListener("click", () => {
      window.location.href = `/listing.html?id=${encodeURIComponent(item.id)}`;
    });

    markers.push(marker);
  });

  if (items.length > 0) {
    const bounds = new mapboxgl.LngLatBounds();
    items.forEach(i => bounds.extend([i.lng, i.lat]));
    if (bounds.isEmpty()) return;
    map.fitBounds(bounds, { padding: 40, maxZoom: 14 });
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
  // % + estimate if price exists
  const est = item.price ? ` (~$${Math.round(item.price * (item.commission / 100)).toLocaleString()})` : "";
  return `Commission: ${item.commission}%${est}`;
}

function renderTiles(items) {
  const grid = els.grid;
  grid.innerHTML = "";

  // Sprinkle ads every N tiles
  const AD_EVERY = 6;
  let adIndex = 0;

  items.forEach((item, idx) => {
    // Insert ad first when appropriate
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

  els.count.textContent = String(items.length);
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
function applyFilters() {
  const q = els.q.value.trim().toLowerCase();
  const plan = els.planFilter.value;
  const comm = els.minCommissionType.value; // e.g. "%:2" or "$:10000"

  let result = allListings.slice();

  if (q) {
    result = result.filter(i =>
      (i.address || "").toLowerCase().includes(q) ||
      (i.shortAddress || "").toLowerCase().includes(q)
    );
  }

  if (plan) {
    result = result.filter(i => (i.plan || "").toLowerCase() === plan.toLowerCase());
  }

  if (comm) {
    const [type, minStr] = comm.split(":");
    const min = Number(minStr);
    result = result.filter(i => {
      if (!i.commission) return false;
      if (type === "%") {
        return i.commissionType === "%" && Number(i.commission) >= min;
      } else {
        // dollars
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
  const sort = els.sortSelect.value;
  if (sort === "newest") {
    result.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  } else if (sort === "price-asc") {
    result.sort((a,b) => (a.price||0) - (b.price||0));
  } else if (sort === "price-desc") {
    result.sort((a,b) => (b.price||0) - (a.price||0));
  } else if (sort === "commission-desc") {
    // order by dollar estimate if possible
    const est = (i) => {
      if (!i.commission) return 0;
      if (i.commissionType === "$") return Number(i.commission) || 0;
      if (i.price) return i.price * (Number(i.commission)/100);
      return 0;
    };
    result.sort((a,b) => est(b) - est(a));
  }

  filtered = result;
  renderTiles(filtered);
  addMarkers(filtered);
}

// --- Geolocate ---------------------------------------------------------------
function useMyLocation() {
  if (!navigator.geolocation) return alert("Geolocation not supported.");
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude } = pos.coords;
    map.flyTo({ center: [longitude, latitude], zoom: 13.5 });
  }, () => alert("Could not get your location."));
}

// --- Boot --------------------------------------------------------------------
function buildDataset() {
  const current = localCurrentListingToItem();
  const list = [...demoListings];
  if (current) {
    // de-dupe if address same as a demo
    const dupIdx = list.findIndex(x => (x.address||"").toLowerCase() === current.address.toLowerCase());
    if (dupIdx >= 0) list.splice(dupIdx, 1);
    list.unshift(current);
  }
  return list;
}

function initEvents() {
  els.applyBtn.addEventListener("click", applyFilters);
  els.locateBtn.addEventListener("click", useMyLocation);
  els.sortSelect.addEventListener("change", applyFilters);

  // Enter key runs search
  els.q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyFilters();
  });
}

(function main() {
  if (!MAPBOX_TOKEN || MAPBOX_TOKEN.includes("YOUR_MAPBOX_TOKEN_HERE")) {
    console.warn("Mapbox token missing. Add your token in search.js for live maps.");
  }
  initMap();
  initEvents();
  allListings = buildDataset();
  applyFilters();
})();
