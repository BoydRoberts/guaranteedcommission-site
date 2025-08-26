<script>
/**
 * Zillow-style listing tiles with:
 * - Photo + banner + heart (favorite)
 * - Top line (bigger): Price (left) | "Commission X% | $Y" (right, red)
 * - Second line: "3 bds | 2 ba | 2,000 sqft | Single Family | Active"
 * - Third: full address
 * - Fourth: Brokerage — Agent — Phone
 * - Whole tile is clickable to /listing.html?addr=<encoded>
 *
 * Data:
 *   formData: { address, brokerage, agent, agentPhone, ... }
 *   agentData: {
 *     price, commission, commissionType ('%'|'$'),
 *     bedrooms, bathrooms, sqft, status, photos, primaryIndex, bannerText,
 *     propertyType
 *   }
 */

(function (global) {
  // ---------- favorites ----------
  const FAV_KEY = 'gcFavorites';
  function getFavs() { try { const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
  function setFavs(arr) { try { localStorage.setItem(FAV_KEY, JSON.stringify(arr || [])); } catch {} }
  function isFav(id) { return getFavs().includes(id); }
  function toggleFav(id) { const favs = getFavs(); const i = favs.indexOf(id); if (i >= 0) favs.splice(i, 1); else favs.push(id); setFavs(favs); return favs.includes(id); }

  // ---------- helpers ----------
  function money(n) { const v = Number(n || 0); return v ? "$" + v.toLocaleString() : "$—"; }
  function commissionAmount(price, commission, type) {
    const p = Number(price || 0), c = Number(commission || 0);
    if (!c) return 0;
    if (type === "$") return Math.round(c);
    if (!p) return 0;
    return Math.round(p * (c / 100));
  }
  function primaryPhoto(agentData) {
    const arr = Array.isArray(agentData?.photos) ? agentData.photos : [];
    const idx = (typeof agentData?.primaryIndex === 'number') ? agentData.primaryIndex : 0;
    return arr[idx] || "";
  }
  function safeText(s, fb = "—") { const t = (s ?? "").toString().trim(); return t ? t : fb; }
  function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
  function statusLabel(s) { const t = (s || "").toLowerCase(); if (t === "in_contract") return "In Contract"; return s ? s.replace(/\b\w/g, m => m.toUpperCase()) : "Draft"; }

  // ---------- view ----------
  function renderTile(opts) {
    const { container, formData = {}, agentData = {}, plan = "Listed Property Basic", onClick } = opts || {};
    if (!container) throw new Error("renderTile: container is required");

    const address = safeText(formData.address, "[full address]");
    const price = agentData.price;
    const cType = agentData.commissionType ?? formData.commissionType ?? "%";
    const cVal = (agentData.commission ?? formData.commission ?? "");
    const cAmt = commissionAmount(price, cVal, cType);

    const bds = agentData.bedrooms ?? "—";
    const ba = agentData.bathrooms ?? "—";
    const sqft = agentData.sqft ? Number(agentData.sqft).toLocaleString() : "—";
    const pType = safeText(agentData.propertyType || "", "").trim(); // may be empty
    const status = safeText(agentData.status, "Draft");
    const banner = (agentData.bannerText || "").trim();

    const brokerage = safeText(formData.brokerage, plan.includes("FSBO") ? "FOR SALE BY OWNER" : "[listing brokerage]");
    const agentName = safeText(formData.agent, plan.includes("FSBO") ? "" : "[listing agent]");
    const agentPhone = safeText(formData.agentPhone, plan.includes("FSBO") ? "" : "[agent phone]");

    const photo = primaryPhoto(agentData);

    const card = document.createElement("article");
    card.className = "bg-white rounded-2xl shadow hover:shadow-md transition overflow-hidden cursor-pointer w-full";

    let rightLabel = "Commission ";
    rightLabel += (cVal === "" ? "—" : (cType === "$" ? money(cVal) : (Number(cVal) + "%")));
    rightLabel += " | ";
    rightLabel += cAmt ? money(cAmt) : "$—";

    const favId = address.toLowerCase();
    const favActive = isFav(favId);

    card.innerHTML = `
      <div class="relative">
        <img class="w-full h-48 object-cover bg-gray-100" alt="Listing photo" src="${photo}">
        ${banner ? `<div class="absolute top-2 left-2 bg-black/80 text-white text-[11px] font-semibold rounded-full px-2 py-1">${escapeHtml(banner)}</div>` : ``}
        <button type="button" data-like class="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow hover:bg-white" aria-label="Like" title="Save">
          ${heartSvg(favActive)}
        </button>
      </div>

      <div class="p-3 space-y-1">
        <!-- Top line -->
        <div class="flex items-center justify-between text-[15px] sm:text-[16px] font-semibold">
          <div class="truncate">${price ? money(price) : "$—"}</div>
          <div class="truncate text-red-600">${escapeHtml(rightLabel)}</div>
        </div>

        <!-- Second line: "3 bds | 2 ba | 2,000 sqft | Single Family | Active" -->
        <div class="text-[12px] text-gray-700">
          ${escapeHtml(`${bds} bds | ${ba} ba | ${sqft} sqft${pType ? ' | ' + pType : ''} | ${statusLabel(status)}`)}
        </div>

        <!-- Third: Full address -->
        <div class="text-sm font-medium">${escapeHtml(address)}</div>

        <!-- Fourth: Brokerage — Agent — Phone -->
        <div class="text-[12px] text-gray-600">
          ${escapeHtml(brokerage.toUpperCase())}${agentName !== "—" && agentName !== "" ? ` — ${escapeHtml(agentName)}` : ""}${agentPhone !== "—" && agentPhone !== "" ? ` — ${escapeHtml(agentPhone)}` : ""}
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      if (typeof onClick === "function") return onClick({ formData, agentData, plan, el: card });
      if (formData.address) {
        const slug = encodeURIComponent(formData.address);
        window.location.href = `/listing.html?addr=${slug}`;
      } else {
        window.location.href = `/listing.html`;
      }
    });

    const likeBtn = card.querySelector('[data-like]');
    likeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nowFav = toggleFav(favId);
      likeBtn.innerHTML = heartSvg(nowFav);
    });

    container.appendChild(card);
    return card;
  }

  function heartSvg(active) {
    return active
      ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="#dc2626" aria-hidden="true"><path d="M12 21s-6.716-4.584-9.428-7.296C.858 12.99.5 11.8.5 10.5.5 7.462 2.962 5 6 5c1.74 0 3.41.81 4.5 2.09C11.59 5.81 13.26 5 15 5c3.038 0 5.5 2.462 5.5 5.5 0 1.3-.358 2.49-2.072 3.204C18.716 16.416 12 21 12 21z"/></svg>`
      : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#dc2626" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  }

  function renderTileList(list, container, options) {
    const opts = Object.assign({ clear: true, onClick: null }, options || {});
    if (!container) return;
    if (opts.clear) container.innerHTML = "";
    (list || []).forEach(item => {
      renderTile({
        container,
        formData: item.formData || {},
        agentData: item.agentData || {},
        plan: item.plan || "Listed Property Basic",
        onClick: opts.onClick
      });
    });
  }

  global.renderTile = renderTile;
  global.renderTileList = renderTileList;
})(window);
</script>
