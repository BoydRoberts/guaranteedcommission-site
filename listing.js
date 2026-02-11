//
// listing.js
// Build: 2026-02-11 (Firestore integration via shared firebase-init.js)
//
// Renders listing.html using Firestore (if listing ID provided) or localStorage fallback.
//

import { db } from "/scripts/firebase-init.js";
import { doc, getDoc, updateDoc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// -----------------------------
// Utilities
// -----------------------------
const $ = (id) => document.getElementById(id);
const fmtUSD = (v) => {
  const n = Number(v || 0);
  if (!n) return "$—";
  return "$" + n.toLocaleString();
};
const setText = (id, text) => {
  const el = $(id);
  if (el) el.textContent = text;
};

// -----------------------------
// DOM population
// -----------------------------
function renderListing(listing, context = {}) {
  // Expected shape:
  // {
  //   address, price, apn, plan, commission, commissionType, bannerText, description,
  //   photos: [url,...], primaryIndex, contact: { brokerage, agent, agentPhone, ownerPhone, ownerEmail }
  // }

  const fullAddress = listing.address || "[full address]";
  const price = listing.price ?? "";
  const apn = listing.apn || "[Parcel # / Pin # / Tax ID # / Folio # / APN #]";
  const plan = (listing.plan || "Listed Property Basic").trim();
  const commission = listing.commission ?? "";
  const commissionType = listing.commissionType || "%";
  const bannerText = (listing.bannerText || "").trim();
  const description = (listing.description || "").trim();
  const photos = Array.isArray(listing.photos) ? listing.photos : [];
  const primaryIndex = (typeof listing.primaryIndex === "number" ? listing.primaryIndex : 0);
  const primaryPhoto = photos[primaryIndex] || "";

  // header/address
  setText("addrLine", fullAddress);
  setText("priceLine", fmtUSD(price));

  // hero
  const heroImg = $("heroImg");
  if (heroImg) {
    heroImg.src = primaryPhoto || "";
    heroImg.alt = fullAddress ? `Photo of ${fullAddress}` : "Main listing photo";
  }
  const ribbon = $("ribbon");
  if (ribbon) {
    if (bannerText) {
      ribbon.textContent = bannerText;
      ribbon.classList.remove("hidden");
    } else {
      ribbon.classList.add("hidden");
    }
  }

  // commission badge
  const pNum = Number(price || 0);
  const cNum = Number(commission || 0);
  const badge = $("commissionBadge");
  if (badge) {
    if (cNum) {
      const text =
        commissionType === "$"
          ? `Commission: $${Math.round(cNum).toLocaleString()}`
          : `Commission: ${cNum}%${pNum ? ` (~$${Math.round(pNum * (cNum / 100)).toLocaleString()})` : ""}`;
      badge.textContent = text;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  // details card
  setText("detailAddress", fullAddress);
  setText("detailPrice", fmtUSD(price));

  const commissionDisplay =
    commissionType === "$"
      ? (cNum ? `$${Math.round(cNum).toLocaleString()}` : "[commission]")
      : (cNum ? `${cNum}%` : "[commission]");

  setText("detailCommission", commissionDisplay);

  let commissionEstimate = "—";
  if (cNum) {
    if (commissionType === "$") {
      commissionEstimate = "$" + Math.round(cNum).toLocaleString();
    } else if (pNum) {
      commissionEstimate = "$" + Math.round(pNum * (cNum / 100)).toLocaleString();
    }
  }
  setText("detailCommissionCalc", commissionEstimate);
  setText("detailAPN", apn);
  setText("detailPlan", plan || "—");

  // description
  const descCard = $("descCard");
  const descEl = $("detailDescription");
  if (descCard && descEl) {
    if (description) {
      descEl.textContent = description;
      descCard.classList.remove("hidden");
    } else {
      descCard.classList.add("hidden");
    }
  }

  // gallery
  const galleryCard = $("galleryCard");
  const galleryGrid = $("galleryGrid");
  if (galleryCard && galleryGrid) {
    galleryGrid.innerHTML = "";
    const otherPhotos = photos.filter((_, i) => i !== primaryIndex);
    if (otherPhotos.length > 0) {
      otherPhotos.forEach((src) => {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "Listing photo";
        img.className = "w-full h-32 object-cover rounded";
        galleryGrid.appendChild(img);
      });
      galleryCard.classList.remove("hidden");
    } else {
      galleryCard.classList.add("hidden");
    }
  }

  // contact
  const listedContact = $("listedContact");
  const fsboContact = $("fsboContact");
  if (listedContact && fsboContact) {
    const isFSBO = (plan || "").includes("FSBO");
    if (isFSBO) {
      // FSBO
      setText("cOwnerPhone", (listing.contact && listing.contact.ownerPhone) || context.ownerPhone || "[owner/seller phone number]");
      setText("cOwnerEmail", (listing.contact && listing.contact.ownerEmail) || context.ownerEmail || "[owner/seller email]");
      fsboContact.classList.remove("hidden");
      listedContact.classList.add("hidden");
    } else {
      // Listed
      setText("cBrokerage", (listing.contact && listing.contact.brokerage) || context.brokerage || "[listing brokerage]");
      setText("cAgent", (listing.contact && listing.contact.agent) || context.agent || "[listing agent]");
      setText("cAgentPhone", (listing.contact && listing.contact.agentPhone) || context.agentPhone || "[agent phone]");
      listedContact.classList.remove("hidden");
      fsboContact.classList.add("hidden");
    }
  }

  // ===== SOLD STATUS DISPLAY =====
  // If listing is sold, show sold date and price
  const statusLower = String(listing.status || '').toLowerCase();
  const isSold = statusLower === 'sold';
  
  const soldInfoEl = $("soldInfo");
  if (soldInfoEl) {
    if (isSold && listing.soldDate && listing.soldPrice) {
      // Format date: YYYY-MM-DD -> M/D/YYYY
      let formattedDate = listing.soldDate;
      try {
        const dateStr = String(listing.soldDate);
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
      
      const formattedPrice = "$" + Number(listing.soldPrice).toLocaleString();
      soldInfoEl.textContent = `SOLD ${formattedDate} for ${formattedPrice}`;
      soldInfoEl.classList.remove("hidden");
    } else if (isSold) {
      soldInfoEl.textContent = "SOLD";
      soldInfoEl.classList.remove("hidden");
    } else {
      soldInfoEl.classList.add("hidden");
    }
  }

  // ===== STATUS BADGE =====
  const statusBadge = $("statusBadge");
  if (statusBadge) {
    const status = listing.status || "Active";
    statusBadge.textContent = status;
    
    // Color coding
    statusBadge.classList.remove("bg-green-600", "bg-gray-800", "bg-red-600");
    if (isSold) {
      statusBadge.classList.add("bg-red-600");
    } else if (statusLower === 'in contract' || statusLower === 'in_contract' || statusLower === 'pending') {
      statusBadge.classList.add("bg-gray-800");
    } else {
      statusBadge.classList.add("bg-green-600");
    }
    statusBadge.classList.remove("hidden");
  }

  // ===== VIEWS/LIKES DISPLAY =====
  const viewsEl = $("viewCount");
  const likesEl = $("likeCount");
  if (viewsEl) viewsEl.textContent = Number(listing.views || 0).toLocaleString();
  if (likesEl) likesEl.textContent = Number(listing.likes || 0).toLocaleString();
}

// -----------------------------
// Data loaders
// -----------------------------

/**
 * Load listing from Firestore using shared db instance
 * @param {string} listingId - Firestore document ID
 * @returns {Promise<object>} Normalized listing data
 */
async function loadFromFirestore(listingId) {
  if (!db) {
    throw new Error("Firestore not initialized");
  }

  const ref = doc(db, "listings", listingId);
  const snap = await getDoc(ref);
  
  if (!snap.exists()) {
    throw new Error("Listing not found in Firestore.");
  }
  
  const data = snap.data();

  // Increment view count (fire-and-forget)
  try {
    const viewedKey = 'viewed:' + listingId;
    if (!localStorage.getItem(viewedKey)) {
      updateDoc(ref, { 
        views: increment(1), 
        updatedAt: serverTimestamp() 
      }).catch(() => {});
      localStorage.setItem(viewedKey, '1');
    }
  } catch (e) {
    // Ignore view tracking errors
  }

  // Normalize Firestore shape to expected render shape:
  const normalized = {
    id: snap.id,
    address: data.address || "",
    price: data.price ?? "",
    apn: data.apn || "",
    plan: data.plan || "Listed Property Basic",
    commission: data.commission ?? "",
    commissionType: data.commissionType || "%",
    bannerText: data.bannerText || "",
    description: data.description || "",
    photos: Array.isArray(data.photos) ? data.photos : [],
    primaryIndex: typeof data.primaryIndex === "number" ? data.primaryIndex : 0,
    status: data.status || "Active",
    soldDate: data.soldDate || null,
    soldPrice: data.soldPrice || null,
    views: data.views || 0,
    likes: data.likes || 0,
    contact: {
      brokerage: data.brokerage || "",
      agent: data.agentName || data.agent || "",
      agentPhone: data.agentPhone || "",
      ownerPhone: data.ownerPhone || "",
      ownerEmail: data.ownerEmail || "",
    },
  };

  console.log('[listing.js] Loaded from Firestore:', listingId);
  return normalized;
}

/**
 * Load listing from localStorage (fallback for draft/preview mode)
 * @returns {object} { data, context }
 */
function loadFromLocalStorage() {
  const formData = JSON.parse(localStorage.getItem("formData") || "{}");
  const agentListing = JSON.parse(localStorage.getItem("agentListing") || "{}");
  const plan = (localStorage.getItem("selectedPlan") || "Listed Property Basic").trim();

  // Assemble a single object with the expected shape:
  const data = {
    address: formData.address || "[full address]",
    price: agentListing.price ?? "",
    apn: formData.apn || "[Parcel # / Pin # / Tax ID # / Folio # / APN #]",
    plan,
    commission: agentListing.commission ?? (formData.commission || ""),
    commissionType: agentListing.commissionType ?? (formData.commissionType || "%"),
    bannerText: (agentListing.bannerText || "").trim(),
    description: (agentListing.description || "").trim(),
    photos: Array.isArray(agentListing.photos) ? agentListing.photos : [],
    primaryIndex: (typeof agentListing.primaryIndex === "number" ? agentListing.primaryIndex : 0),
    status: "Draft",
    soldDate: null,
    soldPrice: null,
    views: 0,
    likes: 0,
    contact: {
      brokerage: formData.brokerage || "",
      agent: formData.agent || "",
      agentPhone: formData.agentPhone || "",
      ownerPhone: formData.agentPhone || "", // FSBO reuse
      ownerEmail: formData.fsboEmail || "",  // FIXED: read FSBO email from fsboEmail
    },
  };

  // Provide some extra context for rendering (FSBO contact fallback)
  const context = {
    brokerage: formData.brokerage || "",
    agent: formData.agent || "",
    agentPhone: formData.agentPhone || "",
    ownerPhone: formData.agentPhone || "",
    ownerEmail: formData.fsboEmail || "",   // FIXED: read FSBO email from fsboEmail
  };

  console.log('[listing.js] Loaded from localStorage (fallback)');
  return { data, context };
}

// -----------------------------
// Boot
// -----------------------------
(async function boot() {
  try {
    const url = new URL(window.location.href);
    const listingId = url.searchParams.get("id");

    if (listingId) {
      // Try to load from Firestore first
      try {
        const data = await loadFromFirestore(listingId);
        renderListing(data);
        console.log('[listing.js] Rendered listing from Firestore:', listingId);
        return;
      } catch (firestoreErr) {
        console.warn('[listing.js] Firestore load failed:', firestoreErr.message);
        // Fall through to localStorage fallback
      }
    }

    // Fallback: Load from localStorage (draft/preview mode)
    const { data, context } = loadFromLocalStorage();
    renderListing(data, context);
    
  } catch (err) {
    console.error("[listing.js] Failed to load listing:", err);
    
    // Final fallback attempt
    try {
      const { data, context } = loadFromLocalStorage();
      renderListing(data, context);
    } catch (err2) {
      console.error("[listing.js] Local fallback also failed:", err2);
    }
  }
})();
