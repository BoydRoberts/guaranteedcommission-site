//
// search.js — Live Firestore Search + Mapbox Map
// Build: 2026-02-11b (Fixed: map container ID, filter safety checks, qBox/q compat)
//

import { db } from "/scripts/firebase-init.js";
import { 
  collection, query, orderBy, getDocs, limit, doc as fdoc, updateDoc, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ===== MAPBOX TOKEN =====
const MAPBOX_TOKEN = "pk.eyJ1IjoiZ3VhcmFudGVlZGNvbW1pc3Npb24tY29tIiwiYSI6ImNtaW1idDMwbjFjMWUzZHE3ZzY4ZjBob3IifQ.lF5BvHIsT_SVe0f6mT5nRw";
if (MAPBOX_TOKEN && window.mapboxgl) mapboxgl.accessToken = MAPBOX_TOKEN;

// ===== HELPERS =====
const $ = (id) => document.getElementById(id);
const getParam = (k) => new URL(location.href).searchParams.get(k);
const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const getJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const CAN_HOVER = window.matchMedia && window.matchMedia('(hover: hover)').matches;

// ===== SEARCH INPUT COMPAT =====
// index.html uses id="q", search.html uses id="qBox" — support both
function getSearchInput() {
  return $("q") || $("qBox");
}

function getSearchValue() {
  const el = getSearchInput();
  return (el?.value || "").trim();
}

function setSearchValue(v) {
  const el = getSearchInput();
  if (el) el.value = v;
}

// ===== STATE =====
let map;
let markers = [];
let markerMap = {};
let allListingsWithCoords = [];
let allDocs = [];
let savedSearchesList = [];
const geocodeCache = new Map();

// ===== AUTH =====
function isLoggedIn() {
  return !!(localStorage.getItem('loggedInEmail') || '').trim();
}
function getLoggedInEmail() {
  return (localStorage.getItem('loggedInEmail') || '').trim();
}

function updateAuthUI() {
  const authLink = $('authLink');
  if (!authLink) return;
  const email = getLoggedInEmail();
  if (email) {
    authLink.textContent = 'Log Out';
    authLink.href = '#';
    authLink.onclick = (e) => {
      e.preventDefault();
      ['isLoggedIn','loggedInEmail','userRole','verificationCode','verifyTarget','nextAfterLogin','nextAfterVerify','lastListingId','lastListingAddress']
        .forEach(k=>localStorage.removeItem(k));
      window.location.reload();
    };
  } else {
    authLink.textContent = 'Log In';
    authLink.href = '/login.html';
    authLink.onclick = null;
  }
}

function requireAuth(callback) {
  if (isLoggedIn()) {
    callback();
  } else {
    alert('Please log in to use this feature.');
    window.location.href = '/login.html';
  }
}

// ===== FILTER DROPDOWN UI =====
function wireFilterDropdowns() {
  const dropdowns = document.querySelectorAll('.filter-dropdown');
  if (!dropdowns.length) return; // Safety: no dropdowns on index.html

  dropdowns.forEach(dd => {
    const btn = dd.querySelector(':scope > button');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = dd.classList.contains('open');
        dropdowns.forEach(d => d.classList.remove('open'));
        if (!wasOpen) dd.classList.add('open');
      });
    }
  });

  document.addEventListener('click', () => {
    dropdowns.forEach(d => d.classList.remove('open'));
    const autocomplete = $('searchAutocomplete');
    if (autocomplete) autocomplete.classList.remove('show');
  });

  document.querySelectorAll('.filter-panel').forEach(panel => {
    panel.addEventListener('click', e => e.stopPropagation());
  });

  document.querySelectorAll('.filter-apply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyAllFilters();
      dropdowns.forEach(d => d.classList.remove('open'));
    });
  });
}

// ===== LIKES =====
async function incrementLikeOnce(listingId) {
  try {
    const onceKey = 'likedOnce:' + listingId;
    if (localStorage.getItem(onceKey)) return false;
    await updateDoc(fdoc(db, "listings", listingId), { likes: increment(1), updatedAt: serverTimestamp() });
    localStorage.setItem(onceKey, '1');
    return true;
  } catch (e) {
    console.warn('[likes] increment failed', e);
    return false;
  }
}

// ===== FILTERS =====
// FIX 2: Safety checks — if element doesn't exist, return empty/null instead of crashing
function readFiltersFromUI() {
  const val = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  const num = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = el.value.trim();
    if (v === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  };
  return {
    priceMin: num('priceMin'),
    priceMax: num('priceMax'),
    bedsMin: num('bedsMin'),
    bathsMin: num('bathsMin'),
    status: val('status'),
    propType: val('propType'),
  };
}

function writeFiltersToUI(f) {
  const set = (id, v) => { const el = $(id); if (el) el.value = (v ?? ''); };
  set('priceMin', f.priceMin ?? '');
  set('priceMax', f.priceMax ?? '');
  set('bedsMin', f.bedsMin ?? '');
  set('bathsMin', f.bathsMin ?? '');
  set('status', f.status ?? '');
  set('propType', f.propType ?? '');
}

// FIX 3: Null-safe dropdown label updates — skip if element not found
function updateDropdownLabels(f) {
  const statusBtn = document.querySelector('[data-filter="status"] .filter-btn span');
  if (statusBtn) statusBtn.textContent = f.status || 'For Sale';

  const priceBtn = document.querySelector('[data-filter="price"] .filter-btn span');
  if (priceBtn) {
    if (f.priceMin && f.priceMax) priceBtn.textContent = `$${(f.priceMin/1000)}K-$${(f.priceMax/1000)}K`;
    else if (f.priceMin) priceBtn.textContent = `$${(f.priceMin/1000)}K+`;
    else if (f.priceMax) priceBtn.textContent = `Up to $${(f.priceMax/1000)}K`;
    else priceBtn.textContent = 'Price';
  }

  const bedsBtn = document.querySelector('[data-filter="beds"] .filter-btn span');
  if (bedsBtn) bedsBtn.textContent = f.bedsMin ? `${f.bedsMin}+ Beds` : 'Beds';

  const bathsBtn = document.querySelector('[data-filter="baths"] .filter-btn span');
  if (bathsBtn) bathsBtn.textContent = f.bathsMin ? `${f.bathsMin}+ Baths` : 'Baths';

  const propBtn = document.querySelector('[data-filter="propType"] .filter-btn span');
  if (propBtn) propBtn.textContent = f.propType || 'Type';

  document.querySelectorAll('.filter-dropdown').forEach(dd => {
    const filter = dd.dataset.filter;
    if (!filter) return;
    let isActive = false;
    if (filter === 'status' && f.status) isActive = true;
    if (filter === 'price' && (f.priceMin || f.priceMax)) isActive = true;
    if (filter === 'beds' && f.bedsMin) isActive = true;
    if (filter === 'baths' && f.bathsMin) isActive = true;
    if (filter === 'propType' && f.propType) isActive = true;
    const btn = dd.querySelector('.filter-btn');
    if (btn) btn.classList.toggle('active', isActive);
  });
}

function matchesFilters(docu, qtext, f) {
  const address = (docu.address || '').toLowerCase();
  if (qtext && !address.includes(qtext.toLowerCase().trim())) return false;

  const price = Number(docu.price || 0);
  if (f.priceMin && price && price < f.priceMin) return false;
  if (f.priceMax && price && price > f.priceMax) return false;

  const beds = Number(docu.bedrooms || 0);
  const baths = Number(docu.bathrooms || 0);
  if (f.bedsMin && beds < f.bedsMin) return false;
  if (f.bathsMin && baths < f.bathsMin) return false;

  if (f.status) {
    const normalized = (String(docu.status || '').toLowerCase() === 'in_contract') ? 'In Contract' : (docu.status || '');
    if (normalized !== f.status) return false;
  }

  if (f.propType) {
    const type = String(docu.propertyType || '').toLowerCase();
    if (!type || type !== f.propType.toLowerCase()) return false;
  }

  return true;
}

// ===== SENIORITY PRIORITY SORTING =====
function sortListings(items) {
  function getCreatedAtMs(doc) {
    const ca = doc.createdAt;
    if (!ca) return 0;
    if (typeof ca.toMillis === 'function') return ca.toMillis();
    if (typeof ca.toDate === 'function') return ca.toDate().getTime();
    if (typeof ca === 'number') return ca;
    if (typeof ca === 'string') return new Date(ca).getTime() || 0;
    return 0;
  }

  return [...items].sort((a, b) => {
    const aPin = !!(a.paidUpgrades && a.paidUpgrades.pin);
    const bPin = !!(b.paidUpgrades && b.paidUpgrades.pin);
    const aPremium = !!(a.paidUpgrades && a.paidUpgrades.premium);
    const bPremium = !!(b.paidUpgrades && b.paidUpgrades.premium);
    
    if (aPin && !bPin) return -1;
    if (!aPin && bPin) return 1;
    if (aPin && bPin) return getCreatedAtMs(a) - getCreatedAtMs(b);
    
    if (aPremium && !bPremium) return -1;
    if (!aPremium && bPremium) return 1;
    if (aPremium && bPremium) return getCreatedAtMs(a) - getCreatedAtMs(b);
    
    return getCreatedAtMs(b) - getCreatedAtMs(a);
  });
}

// ===== SAVED SEARCHES =====
function getSavedSearches() { return getJSON('savedSearches', []); }
function setSavedSearches(arr) { setJSON('savedSearches', arr); }

function saveSearchToLocal(name, q, filters) {
  const arr = getSavedSearches();
  const record = {
    id: 'ss_' + Date.now(),
    name: name || q || 'My Search',
    q,
    filters,
    createdAt: Date.now()
  };
  arr.unshift(record);
  setSavedSearches(arr);
  return record;
}

function showSavedSearchAutocomplete(input) {
  const autocomplete = $('searchAutocomplete');
  if (!autocomplete) return;
  const val = input.toLowerCase().trim();
  const searches = getSavedSearches();

  if (!isLoggedIn() || val.length < 2 || searches.length === 0) {
    autocomplete.classList.remove('show');
    return;
  }

  const matches = searches.filter(s =>
    s.name.toLowerCase().includes(val) ||
    (s.q && s.q.toLowerCase().includes(val))
  );

  if (matches.length === 0) {
    autocomplete.classList.remove('show');
    return;
  }

  autocomplete.innerHTML = matches.slice(0, 5).map(s => `
    <div class="search-autocomplete-item" data-search-id="${s.id}">
      ${s.name}
      <span class="saved-label">Saved Search</span>
    </div>
  `).join('');

  autocomplete.querySelectorAll('.search-autocomplete-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const searchId = item.dataset.searchId;
      const saved = searches.find(s => s.id === searchId);
      if (saved) {
        loadSavedSearch(saved);
      }
      autocomplete.classList.remove('show');
    });
  });

  autocomplete.classList.add('show');
}

function loadSavedSearch(saved) {
  setSearchValue(saved.q || '');
  if (saved.filters) {
    writeFiltersToUI(saved.filters);
    updateDropdownLabels(saved.filters);
  }
  applyAllFilters();
}

// ===== URL SYNC =====
function syncFiltersToURL() {
  try {
    const f = readFiltersFromUI();
    const q = getSearchValue();

    const params = new URLSearchParams();

    if (q) params.set("q", q);
    if (f.priceMin != null) params.set("priceMin", String(f.priceMin));
    if (f.priceMax != null) params.set("priceMax", String(f.priceMax));
    if (f.bedsMin != null) params.set("bedsMin", String(f.bedsMin));
    if (f.bathsMin != null) params.set("bathsMin", String(f.bathsMin));
    if (f.status) params.set("status", f.status);
    if (f.propType) params.set("propType", f.propType);

    const newUrl = window.location.pathname + (params.toString() ? ("?" + params.toString()) : "");
    window.history.replaceState({}, "", newUrl);
  } catch (e) {
    console.warn("[url] syncFiltersToURL failed:", e);
  }
}

function readFiltersFromURL() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const out = {
      q: (sp.get("q") || "").trim(),
      priceMin: sp.get("priceMin"),
      priceMax: sp.get("priceMax"),
      bedsMin: sp.get("bedsMin"),
      bathsMin: sp.get("bathsMin"),
      status: (sp.get("status") || "").trim(),
      propType: (sp.get("propType") || "").trim()
    };

    function toNumOrNull(v) {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (s === "") return null;
      const n = Number(s);
      return isFinite(n) ? n : null;
    }

    return {
      q: out.q,
      filters: {
        priceMin: toNumOrNull(out.priceMin),
        priceMax: toNumOrNull(out.priceMax),
        bedsMin: toNumOrNull(out.bedsMin),
        bathsMin: toNumOrNull(out.bathsMin),
        status: out.status || "",
        propType: out.propType || ""
      },
      hasAny: !!(out.q || out.priceMin || out.priceMax || out.bedsMin || out.bathsMin || out.status || out.propType)
    };
  } catch (e) {
    return { q: "", filters: {}, hasAny: false };
  }
}

// ===== GEOCODING =====
async function geocodeWithBounds(q) {
  if (!MAPBOX_TOKEN || !q) return null;
  try {
    const resp = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=1&access_token=${MAPBOX_TOKEN}`);
    const data = await resp.json();
    const f = data?.features?.[0];
    if (!f) return null;
    return { center: f.center || null, bbox: f.bbox || null };
  } catch {
    return null;
  }
}

async function geocodeExactAddress(addr) {
  const a = String(addr || '').trim();
  if (!a) return null;
  if (geocodeCache.has(a)) return geocodeCache.get(a);

  try {
    const resp = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(a)}.json?limit=1&access_token=${MAPBOX_TOKEN}`);
    const data = await resp.json();
    const c = data?.features?.[0]?.center || null;
    if (c && Array.isArray(c) && c.length === 2) {
      geocodeCache.set(a, c);
      return c;
    }
  } catch {}
  geocodeCache.set(a, null);
  return null;
}

// ===== MAP =====
function formatPriceShort(price) {
  const p = Number(price || 0);
  if (!p) return '$-';
  if (p >= 1000000) return '$' + (p / 1000000).toFixed(p % 1000000 === 0 ? 0 : 1) + 'M';
  if (p >= 1000) return '$' + Math.round(p / 1000) + 'K';
  return '$' + p.toLocaleString();
}

function getListingKey(it) {
  return it?.id ? String(it.id) : String(it?.address || '').trim().toLowerCase();
}

function isValidLatLng(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  return !isNaN(latNum) && !isNaN(lngNum)
    && latNum >= -90 && latNum <= 90
    && lngNum >= -180 && lngNum <= 180
    && (latNum !== 0 || lngNum !== 0);
}

function clearMarkers() {
  markers.forEach(m => m.remove());
  markers = [];
  markerMap = {};
  allListingsWithCoords = [];
}

function highlightMarker(listingKey, on) {
  const wrap = markerMap[listingKey];
  if (wrap) wrap.classList.toggle('highlighted', !!on);
}

function highlightTile(listingKey, on) {
  const tile = document.querySelector(`[data-listing-id="${listingKey}"]`);
  if (tile) tile.classList.toggle('highlighted', !!on);
}

// FIX 1: Map container — try 'map' first, fall back to 'mapCanvas' for legacy pages
async function initMap(q) {
  const DEFAULT_CENTER = [-98.5795, 39.8283];
  const DEFAULT_ZOOM = 4.2;

  // Determine which container element exists on this page
  const mapContainer = $('map') || $('mapCanvas');
  if (!mapContainer) {
    console.warn('[search] No map container found (#map or #mapCanvas). Skipping map init.');
    return null;
  }
  const containerId = mapContainer.id;

  let center = DEFAULT_CENTER;
  let bbox = null;

  const qTrim = String(q || '').trim();
  if (qTrim) {
    const geo = await geocodeWithBounds(qTrim);
    if (geo?.center) center = geo.center;
    if (geo?.bbox && Array.isArray(geo.bbox) && geo.bbox.length === 4) bbox = geo.bbox;
  }

  map = new mapboxgl.Map({
    container: containerId,  // FIX 1: uses whichever ID exists on the page
    style: 'mapbox://styles/mapbox/streets-v12',
    center,
    zoom: qTrim ? 11.5 : DEFAULT_ZOOM
  });
  map.addControl(new mapboxgl.NavigationControl());

  if (bbox) {
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
      padding: 70,
      maxZoom: 12.8,
      duration: 0
    });
  }

  setTimeout(() => { try { map.resize(); } catch (e) {} }, 140);
  return center;
}

// ===== CURRENCY FORMATTING =====
function money(n) { 
  const v = Number(n || 0); 
  return v ? ("$" + v.toLocaleString()) : "$—"; 
}

function commissionAmount(price, commission, type) {
  const p = Number(price || 0), c = Number(commission || 0);
  if (!c) return 0;
  return type === '$' ? Math.round(c) : (p ? Math.round(p * (c / 100)) : 0);
}

// ===== HEART BUTTON =====
function wireHeart(btn, keyId, onFirstLike) {
  const KEY = 'gcFavorites';
  const favs = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const setF = a => { try { localStorage.setItem(KEY, JSON.stringify(a || [])); } catch {} };
  const isFav = id => favs().includes(id);
  const tog = id => { const a = favs(); const i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); setF(a); return a.includes(id); };
  const svg = a => a
    ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="#dc2626"><path d="M12 21s-6.716-4.584-9.428-7.296C.858 12.99.5 11.8.5 10.5.5 7.462 2.962 5 6 5c1.74 0 3.41.81 4.5 2.09C11.59 5.81 13.26 5 15 5c3.038 0 5.5 2.462 5.5 5.5 0 1.3-.358 2.49-2.072 3.204C18.716 16.416 12 21 12 21z"/></svg>`
    : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#dc2626" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  btn.innerHTML = svg(isFav(keyId));
  btn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nowLiked = tog(keyId);
    btn.innerHTML = svg(nowLiked);
    if (nowLiked && typeof onFirstLike === 'function') onFirstLike();
  };
}

function buildContactLine(doc) {
  const plan = String(doc.plan || "Listed Property Basic");
  const isFSBO = plan.includes("FSBO");

  if (isFSBO) {
    let line = 'FOR SALE BY OWNER';
    if (doc.ownerName) line += ' - ' + doc.ownerName;
    if (doc.ownerPhone) line += ' - ' + doc.ownerPhone;
    return line;
  } else {
    let line = (doc.brokerage || '[listing brokerage]').toUpperCase();
    if (doc.agentName) line += ' - ' + doc.agentName;
    if (doc.agentPhone) line += ' - ' + doc.agentPhone;
    return line;
  }
}

// ===== TILE RENDERER =====
function renderTile(doc) {
  const id = doc.id;
  const address = String(doc.address || "").trim();
  const banner = String(doc.bannerText || "");
  const pType = String(doc.propertyType || "");
  const bds = doc.bedrooms ?? "—";
  const ba = doc.bathrooms ?? "—";
  const sqft = doc.sqft ? Number(doc.sqft).toLocaleString() : "—";
  const price = (typeof doc.price === "number") ? doc.price : (Number(doc.price) || 0);
  const cType = (doc.commissionType === "%" || doc.commissionType === "$") ? doc.commissionType : "%";
  const cRaw = doc.commission ?? "";
  const cAmt = commissionAmount(price, cRaw, cType);
  const cPctLbl = cRaw ? (cType === '$' ? money(cRaw) : (Number(cRaw) + '%')) : "—";

  const photos = Array.isArray(doc.photos) ? doc.photos.filter(u => typeof u === "string" && u) : [];
  let pIdx = (typeof doc.primaryIndex === "number") ? doc.primaryIndex : 0;
  if (pIdx < 0 || pIdx >= photos.length) pIdx = 0;
  const primaryPhoto = photos[pIdx] || "";

  const views = Number(doc.views || 0);
  const likes = Number(doc.likes || 0);

  const contactLine = buildContactLine(doc);
  
  // SOLD DATE/PRICE LOGIC
  const rawStatus = doc.status;
  const statusStr = String(rawStatus || "Active").trim();
  const statusLower = statusStr.toLowerCase();
  const isSold = (statusLower === "sold");
  
  let statusDisplayText = statusStr;
  let statusDisplayClass = "";
  
  if (isSold) {
    const soldDateRaw = doc.soldDate;
    const soldPriceRaw = doc.soldPrice;
    
    if (soldDateRaw && soldPriceRaw) {
      let formattedDate = null;
      try {
        const dateStr = String(soldDateRaw);
        if (dateStr.includes('-')) {
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            const year = parts[0];
            const month = parseInt(parts[1], 10);
            const day = parseInt(parts[2], 10);
            if (year && month && day) {
              formattedDate = `${month}/${day}/${year}`;
            }
          }
        }
      } catch (e) {}
      
      let formattedPrice = null;
      try {
        const priceNum = Number(soldPriceRaw);
        if (priceNum > 0) {
          formattedPrice = "$" + priceNum.toLocaleString();
        }
      } catch (e) {}
      
      if (formattedDate && formattedPrice) {
        statusDisplayText = `Sold ${formattedDate} for ${formattedPrice}`;
        statusDisplayClass = "sold-details-text";
      } else if (formattedDate) {
        statusDisplayText = `Sold ${formattedDate}`;
        statusDisplayClass = "sold-details-text";
      } else if (formattedPrice) {
        statusDisplayText = `Sold for ${formattedPrice}`;
        statusDisplayClass = "sold-details-text";
      } else {
        statusDisplayText = "Sold";
        statusDisplayClass = "sold-details-text";
      }
    } else {
      statusDisplayText = "Sold";
      statusDisplayClass = "sold-details-text";
    }
  }

  const card = document.createElement("article");
  card.className = "gc-tile relative";
  card.onclick = () => { window.location.href = `/listing.html?id=${encodeURIComponent(id)}`; };

  const statusSpan = statusDisplayClass 
    ? `<span class="${statusDisplayClass}">${statusDisplayText}</span>`
    : statusDisplayText;

  card.innerHTML = `
    <div class="relative">
      <img class="gc-photo" alt="Listing photo" src="${primaryPhoto}">
      ${banner ? `<div class="gc-ribbon">${banner}</div>` : ''}
      ${isSold ? `<div class="absolute top-2 left-2 bg-red-600 text-white font-bold text-[11px] px-2 py-1 rounded shadow">SOLD</div>` : ''}
      <button type="button" class="gc-heart" aria-label="Like"></button>
      <button type="button" class="gc-share gc-share-left" data-share="email">Email</button>
      <button type="button" class="gc-share gc-share-right" data-share="text">Text</button>
    </div>
    <div class="p-3 space-y-1">
      <div class="flex items-center justify-between text-[15px] font-semibold">
        <div class="truncate">${price ? money(price) : "$—"}</div>
        <div class="truncate text-red-600">Commission ${cPctLbl} | ${cAmt ? money(cAmt) : "$—"}</div>
      </div>
      <div class="text-[12px] text-gray-700">
        ${bds} bd | ${ba} ba | ${sqft} sqft${pType ? " | " + pType : ""} | ${statusSpan}
      </div>
      <div class="text-sm font-medium truncate">${address || "[address]"}</div>
      <div class="text-[11px] text-gray-600 truncate">
        ${contactLine}
      </div>
      <div class="text-[11px] text-gray-500 text-center tile-stats">
        ${views.toLocaleString()} views | ${likes.toLocaleString()} likes
      </div>
    </div>
  `;

  const heart = card.querySelector(".gc-heart");
  const statsEl = card.querySelector(".tile-stats");
  if (heart) {
    wireHeart(heart, `fav:${id}`, async () => {
      const did = await incrementLikeOnce(id);
      if (did && statsEl) {
        const newLikes = likes + 1;
        statsEl.textContent = `${views.toLocaleString()} views | ${newLikes.toLocaleString()} likes`;
      }
    });
  }

  const shareUrl = window.location.origin + '/listing.html?id=' + encodeURIComponent(id);
  card.querySelectorAll("[data-share]").forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const kind = btn.getAttribute("data-share");
      const subject = encodeURIComponent(address ? `Listing: ${address}` : 'Listing');
      const body = encodeURIComponent(`${address ? (address + " — ") : ""}commission posted with photos.\n\n${shareUrl}`);
      if (kind === "email") window.location.href = `mailto:?subject=${subject}&body=${body}`;
      else window.location.href = `sms:&body=${body}`;
    });
  });

  return card;
}

// ===== MAP MARKERS =====
async function addDotPriceMarkers(items) {
  if (!map) return;
  clearMarkers();

  const subset = items.slice(0, 100);

  for (const it of subset) {
    const addr = (it?.address || '').trim();
    if (!addr) continue;

    let coords = null;
    if (isValidLatLng(it.lat, it.lng)) {
      coords = [Number(it.lng), Number(it.lat)];
    } else {
      coords = await geocodeExactAddress(addr);
    }
    if (!coords) continue;

    const listingKey = getListingKey(it);
    allListingsWithCoords.push({ ...it, _lng: coords[0], _lat: coords[1] });

    const wrap = document.createElement('div');
    wrap.className = 'gc-marker-wrap';
    wrap.dataset.listingId = listingKey;
    wrap.title = addr;

    const statusLower = String(it.status || '').trim().toLowerCase();
    const isSold = statusLower === 'sold';
    const isPending = statusLower === 'in contract' || statusLower === 'in_contract' || statusLower === 'pending';

    if (isSold) {
      wrap.classList.add('sold');
    } else if (isPending) {
      wrap.classList.add('pending');
    }

    const dot = document.createElement('div');
    dot.className = 'gc-marker-dot';

    const label = document.createElement('div');
    label.className = 'gc-marker-label';

    const basePrice = formatPriceShort(it.price);
    if (isSold) {
      label.textContent = basePrice + ' (SOLD)';
    } else if (isPending) {
      label.textContent = basePrice + ' (PENDING)';
    } else {
      label.textContent = basePrice;
    }

    const goListing = (e) => {
      e.stopPropagation();
      if (it.id) window.location.href = `/listing.html?id=${encodeURIComponent(it.id)}`;
      else window.location.href = `/listing.html?addr=${encodeURIComponent(addr)}`;
    };
    dot.addEventListener('click', goListing);
    label.addEventListener('click', goListing);

    if (CAN_HOVER) {
      wrap.addEventListener('mouseenter', () => highlightTile(listingKey, true));
      wrap.addEventListener('mouseleave', () => highlightTile(listingKey, false));
    }

    wrap.appendChild(dot);
    wrap.appendChild(label);

    const marker = new mapboxgl.Marker({ element: wrap, anchor: 'center' })
      .setLngLat(coords)
      .addTo(map);

    markers.push(marker);
    markerMap[listingKey] = wrap;
  }

  syncTilesToViewport();
}

function renderTilesWithHover(grid, items) {
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = `<div class="text-sm text-gray-500">No listings in this map area. Pan or zoom out to see more.</div>`;
    return;
  }
  
  const sortedItems = sortListings(items);
  
  sortedItems.forEach(it => {
    const tile = renderTile(it);
    const listingKey = getListingKey(it);
    tile.dataset.listingId = listingKey;

    if (CAN_HOVER) {
      tile.addEventListener('mouseenter', () => highlightMarker(listingKey, true));
      tile.addEventListener('mouseleave', () => highlightMarker(listingKey, false));
    }
    grid.appendChild(tile);
  });
}

function syncTilesToViewport() {
  if (!map) return;
  const bounds = map.getBounds();
  const visible = allListingsWithCoords.filter(it => bounds.contains([it._lng, it._lat]));
  const grid = $('grid');
  if (grid) renderTilesWithHover(grid, visible);
}

function wireMapSync() {
  if (!map) return;
  map.on('moveend', syncTilesToViewport);
  map.on('zoomend', syncTilesToViewport);
}

// ===== FETCH LISTINGS FROM FIRESTORE =====
async function fetchListings() {
  const docs = [];
  try {
    const snap = await getDocs(query(collection(db, "listings"), orderBy("createdAt", "desc"), limit(200)));
    snap.forEach(d => {
      const data = d.data() || {};
      // Include signed ISC listings OR active listings
      const signed = !!(data.signedISC && typeof data.signedISC === 'object' && data.signedISC.date);
      const statusLower = String(data.status || '').toLowerCase();
      const isActive = statusLower === 'active';
      const isSold = statusLower === 'sold';
      const isPending = statusLower === 'in contract' || statusLower === 'in_contract' || statusLower === 'pending';
      
      // Include if signed, active, sold, or pending
      if (signed || isActive || isSold || isPending) {
        docs.push({ id: d.id, ...data });
      }
    });
  } catch (e) {
    console.warn("[search] Firestore fetch failed:", e);
  }
  return docs;
}

// ===== APPLY FILTERS + GEOCODE CITY FLYTO =====
async function applyAllFilters() {
  const f = readFiltersFromUI();
  setJSON('lastFilters', f);
  updateDropdownLabels(f);

  const q = getSearchValue();
  
  // CRUCIAL UX FIX: If user typed a city/location, fly to it even if 0 listings
  if (q && map) {
    const geo = await geocodeWithBounds(q);
    if (geo?.center) {
      if (geo.bbox && Array.isArray(geo.bbox) && geo.bbox.length === 4) {
        map.fitBounds([[geo.bbox[0], geo.bbox[1]], [geo.bbox[2], geo.bbox[3]]], {
          padding: 70,
          maxZoom: 12.8,
          duration: 1000
        });
      } else {
        map.flyTo({ center: geo.center, zoom: 11.5, duration: 1000 });
      }
    }
  }
  
  const filtered = allDocs.filter(d => matchesFilters(d, q, f));
  const sorted = sortListings(filtered);
  
  await addDotPriceMarkers(sorted);
  syncFiltersToURL();
}

// ===== BOOT =====
(async function boot() {
  updateAuthUI();
  wireFilterDropdowns();

  // URL params take priority
  const fromUrl = readFiltersFromURL();

  const qParam = (fromUrl.hasAny ? fromUrl.q : (getParam('q') || localStorage.getItem('lastSearch') || '')).trim();
  setSearchValue(qParam);
  localStorage.setItem('lastSearch', qParam);

  const lastFilters = fromUrl.hasAny ? fromUrl.filters : getJSON('lastFilters', {});
  writeFiltersToUI(lastFilters);
  updateDropdownLabels(lastFilters);
  setJSON('lastFilters', lastFilters);

  await initMap(qParam);
  wireMapSync();

  // Fetch live data from Firestore
  allDocs = await fetchListings();
  allDocs = sortListings(allDocs);
  
  console.log('[search] Loaded', allDocs.length, 'listings from Firestore');

  const filtered = allDocs.filter(d => matchesFilters(d, qParam, lastFilters));
  const sorted = sortListings(filtered);
  
  await addDotPriceMarkers(sorted);
  syncFiltersToURL();

  // Wire search input — works with either #q (index.html) or #qBox (search.html)
  const qBoxEl = getSearchInput();
  if (qBoxEl) {
    qBoxEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyAllFilters();
        const autocomplete = $('searchAutocomplete');
        if (autocomplete) autocomplete.classList.remove('show');
      }
    });

    qBoxEl.addEventListener('input', (e) => {
      showSavedSearchAutocomplete(e.target.value);
    });
  }

  // Wire the search button if it exists (index.html has #searchBtn)
  const searchBtn = $('searchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      applyAllFilters();
    });
  }

  // Clear all filters
  const clearBtn = $("clearFiltersBtn");
  if (clearBtn) {
    clearBtn.onclick = async () => {
      setJSON('lastFilters', {});
      document.querySelectorAll('#priceMin, #priceMax, #bedsMin, #bathsMin, #status, #propType').forEach(el => {
        if (el) el.value = '';
      });
      updateDropdownLabels({});
      const q = getSearchValue();
      const refiltered = allDocs.filter(d => matchesFilters(d, q, {}));
      const resorted = sortListings(refiltered);
      await addDotPriceMarkers(resorted);
      syncFiltersToURL();
    };
  }

  // GATED ACTIONS
  const saveSearchBtn = $("saveSearchBtn");
  if (saveSearchBtn) {
    saveSearchBtn.onclick = () => {
      requireAuth(() => {
        const q = getSearchValue();
        const filters = readFiltersFromUI();
        const nameInput = $("searchNameInput");
        const name = (nameInput?.value || '').trim() || q || "My Search";
        saveSearchToLocal(name, q, filters);
        if (nameInput) nameInput.value = '';
        alert("Search saved as: " + name);
      });
    };
  }

  const emailSearchBtn = $("emailSearchBtn");
  if (emailSearchBtn) {
    emailSearchBtn.onclick = () => {
      requireAuth(() => {
        const q = getSearchValue();
        const subject = encodeURIComponent(`Search Results: ${q || 'All Listings'}`);
        const body = encodeURIComponent(`View my search results:\n\n${window.location.href}`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
      });
    };
  }

  const textSearchBtn = $("textSearchBtn");
  if (textSearchBtn) {
    textSearchBtn.onclick = () => {
      requireAuth(() => {
        const body = encodeURIComponent(`Check out these listings:\n\n${window.location.href}`);
        window.location.href = `sms:&body=${body}`;
      });
    };
  }

  const autoEmailBtn = $("autoEmailBtn");
  if (autoEmailBtn) {
    autoEmailBtn.onclick = () => {
      requireAuth(() => {
        const q = getSearchValue();
        const filters = readFiltersFromUI();
        saveSearchToLocal("Auto-Email: " + (q || "Search"), q, filters);
        alert("Auto-Email saved for this search (delivery wiring is post-MVP).");
      });
    };
  }

  const autoTextBtn = $("autoTextBtn");
  if (autoTextBtn) {
    autoTextBtn.onclick = () => {
      requireAuth(() => {
        const q = getSearchValue();
        const filters = readFiltersFromUI();
        saveSearchToLocal("Auto-Text: " + (q || "Search"), q, filters);
        alert("Auto-Text saved for this search (delivery wiring is post-MVP).");
      });
    };
  }

  console.log('[search] Boot complete');
})();
