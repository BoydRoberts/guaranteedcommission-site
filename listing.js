// listing.js
// Renders listing.html using either Firestore (when enabled) or localStorage fallback.

// -----------------------------
// Toggle Firestore on/off here:
// -----------------------------
const USE_FIRESTORE = false; // set to true when you’ve added your Firebase config below

// If enabling Firestore, fill in your config:
const FIREBASE_CONFIG = {
  // apiKey: "YOUR_KEY",
  // authDomain: "YOUR_DOMAIN",
  // projectId: "YOUR_PROJECT_ID",
  // storageBucket: "YOUR_BUCKET",
  // messagingSenderId: "YOUR_SENDER_ID",
  // appId: "YOUR_APP_ID",
};

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
}

// -----------------------------
// Data loaders
// -----------------------------
async function loadFromFirestore(listingId) {
  // Lightweight dynamic import so listing.html loads even without Firebase
  const [{ initializeApp }, { getFirestore, doc, getDoc }] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"),
  ]);

  const app = initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);

  // Assuming collection "listings" with document = listingId
  const ref = doc(db, "listings", listingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Listing not found in Firestore.");
  }
  const data = snap.data();

  // Normalize Firestore shape to expected render shape:
  const normalized = {
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
    contact: {
      brokerage: data.brokerage || "",
      agent: data.agent || "",
      agentPhone: data.agentPhone || "",
      ownerPhone: data.ownerPhone || "",
      ownerEmail: data.ownerEmail || "",
    },
  };

  return normalized;
}

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
    contact: {
      brokerage: formData.brokerage || "",
      agent: formData.agent || "",
      agentPhone: formData.agentPhone || "",
      ownerPhone: formData.agentPhone || "", // FSBO reuse
      ownerEmail: formData.brokerage || "",  // FSBO reuse (email captured in brokerage field during FSBO)
    },
  };

  // Provide some extra context for rendering (FSBO contact fallback)
  const context = {
    brokerage: formData.brokerage || "",
    agent: formData.agent || "",
    agentPhone: formData.agentPhone || "",
    ownerPhone: formData.agentPhone || "",
    ownerEmail: formData.brokerage || "",
  };

  return { data, context };
}

// -----------------------------
// Boot
// -----------------------------
(async function boot() {
  try {
    const url = new URL(window.location.href);
    const listingId = url.searchParams.get("id"); // if present, try Firestore when enabled

    if (USE_FIRESTORE && listingId) {
      const data = await loadFromFirestore(listingId);
      renderListing(data);
    } else {
      const { data, context } = loadFromLocalStorage();
      renderListing(data, context);
    }
  } catch (err) {
    console.error("Failed to load listing:", err);
    // Graceful fallback to localStorage if Firestore path failed for some reason
    try {
      const { data, context } = loadFromLocalStorage();
      renderListing(data, context);
    } catch (err2) {
      console.error("Local fallback also failed:", err2);
    }
  }
})();
