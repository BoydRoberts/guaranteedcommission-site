<script>
/**
 * Zillow-style listing tiles
 * - Photo on top with banner
 * - 4 lines below photo:
 *   1) Price (left) | Commission % (center) | Total Commission $ (right)
 *   2) BDS | BA | SQFT | Status
 *   3) Full address
 *   4) Listing Brokerage, Listing Agent Name, Listing Agent Phone
 *
 * API:
 *   renderTile({
 *     container: HTMLElement,
 *     formData: { address, brokerage, agent, agentPhone, ... },
 *     agentData: {
 *       price, commission, commissionType ('%'|'$'),
 *       bedrooms, bathrooms, sqft, status, photos, primaryIndex,
 *       bannerText
 *     },
 *     plan: 'Listed Property Basic' | 'Listed Property Plus' | 'FSBO Plus',
 *     onClick?: (ctx) => void
 *   })
 *
 *   renderTileList(list, container, { clear=true, onClick })
 *
 * Notes:
 * - Uses only Tailwind classes already present on your pages (no external CSS).
 * - Commission $ is computed from price and commission% when needed.
 */

(function (global) {
  // ---------- helpers ----------
  function money(n) {
    const v = Number(n || 0);
    if (!v) return "$—";
    return "$" + v.toLocaleString();
  }

  function commissionAmount(price, commission, type) {
    const p = Number(price || 0);
    const c = Number(commission || 0);
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

  function safeText(s, fallback = "—") {
    const t = (s ?? "").toString().trim();
    return t ? t : fallback;
  }

  // ---------- view ----------
  function renderTile(opts) {
    const { container, formData = {}, agentData = {}, plan = "Listed Property Basic", onClick } = opts || {};
    if (!container) throw new Error("renderTile: container is required");

    // Inputs
    const address = safeText(formData.address, "[full address]");
    const price = agentData.price;
    const cType = agentData.commissionType ?? formData.commissionType ?? "%";
    const cVal = (agentData.commission ?? formData.commission ?? "");
    const cPctLabel = (cVal === "" ? "—" : (cType === "$" ? money(cVal) : (Number(cVal) + "%")));
    const cAmt = commissionAmount(price, cVal, cType); // $ total commission
    const banner = (agentData.bannerText || "").trim();

    const bds = agentData.bedrooms ?? "—";
    const ba = agentData.bathrooms ?? "—";
    const sqft = agentData.sqft ? Number(agentData.sqft).toLocaleString() : "—";
    const status = safeText(agentData.status, "Draft");

    const brokerage = safeText(formData.brokerage, plan.includes("FSBO") ? "FOR SALE BY OWNER" : "[listing brokerage]");
    const agentName = safeText(formData.agent, plan.includes("FSBO") ? "" : "[listing agent]");
    const agentPhone = safeText(formData.agentPhone, plan.includes("FSBO") ? "" : "[agent phone]");

    const photo = primaryPhoto(agentData);

    // Create tile
    const card = document.createElement("article");
    card.className = "bg-white rounded-2xl shadow hover:shadow-md transition overflow-hidden cursor-pointer w-full";

    // Template
    card.innerHTML = `
      <div class="relative">
        <img class="w-full h-48 object-cover bg-gray-100" alt="Listing photo" src="${photo}">
        ${banner ? `
          <div class="absolute top-2 left-2 bg-black/80 text-white text-[11px] font-semibold rounded-full px-2 py-1">
            ${escapeHtml(banner)}
          </div>` : ``}
      </div>

      <div class="p-3 space-y-1">
        <!-- Line 1: Price (left) | Commission % (center) | Total Commission $ (right) -->
        <div class="grid grid-cols-3 items-center text-sm font-semibold">
          <div class="text-left truncate">${price ? money(price) : "$—"}</div>
          <div class="text-center truncate">${cPctLabel}</div>
          <div class="text-right truncate">${cAmt ? money(cAmt) : "$—"}</div>
        </div>

        <!-- Line 2: BDS | BA | SQFT | STATUS -->
        <div class="text-[12px] text-gray-700 flex items-center gap-2 flex-wrap">
          <span class="px-2 py-0.5 bg-gray-100 rounded">BDS ${bds}</span>
          <span class="px-2 py-0.5 bg-gray-100 rounded">BA ${ba}</span>
          <span class="px-2 py-0.5 bg-gray-100 rounded">SQFT ${sqft}</span>
          <span class="px-2 py-0.5 rounded ${statusBadgeClass(status)}">${statusLabel(status)}</span>
        </div>

        <!-- Line 3: Full address -->
        <div class="text-sm font-medium">${escapeHtml(address)}</div>

        <!-- Line 4: Brokerage, Agent, Phone -->
        <div class="text-[12px] text-gray-600">
          ${escapeHtml(brokerage)}${agentName !== "—" && agentName !== "" ? ` — ${escapeHtml(agentName)}` : ""}${agentPhone !== "—" && agentPhone !== "" ? ` — ${escapeHtml(agentPhone)}` : ""}
        </div>
      </div>
    `;

    // Click-through → listing detail page
    card.addEventListener("click", () => {
      if (typeof onClick === "function") return onClick({ formData, agentData, plan, el: card });
      if (formData.address) {
        const slug = encodeURIComponent(formData.address);
        window.location.href = `/listing.html?addr=${slug}`;
      } else {
        window.location.href = `/listing.html`;
      }
    });

    container.appendChild(card);
    return card;
  }

  // Status pill styles
  function statusBadgeClass(s) {
    switch ((s || "").toLowerCase()) {
      case "active":       return "bg-emerald-100 text-emerald-700";
      case "in contract":
      case "in_contract":  return "bg-amber-100 text-amber-700";
      case "sold":         return "bg-rose-100 text-rose-700";
      default:             return "bg-gray-100 text-gray-700";
    }
  }
  function statusLabel(s) {
    const t = (s || "").toLowerCase();
    if (t === "in_contract") return "In Contract";
    return s ? s.replace(/\b\w/g, m => m.toUpperCase()) : "Draft";
  }

  // Escape for safety in HTML
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
  }

  // ---------- bulk helper ----------
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

  // expose
  global.renderTile = renderTile;
  global.renderTileList = renderTileList;
})(window);
</script>
