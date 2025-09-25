// /scripts/tiles.js — render-only (no demo data, no fetching)
// Exposes:
//   window.renderTile(doc)
//   window.renderTileList(list, container, options)
//
// Expected doc shape (Firestore):
// {
//   id, address, price, commission, commissionType ('%'|'$'),
//   bedrooms, bathrooms, sqft, propertyType, status,
//   plan, bannerText, photos: [url,...], primaryIndex,
//   brokerage, agentName, agentPhone
// }

(function (global) {
  "use strict";

  // ---------- helpers ----------
  function money(n) {
    const v = Number(n || 0);
    return v ? "$" + v.toLocaleString() : "$—";
  }
  function commissionAmount(price, commission, type) {
    const p = Number(price || 0), c = Number(commission || 0);
    if (!c) return 0;
    if (type === "$") return Math.round(c);
    if (!p) return 0;
    return Math.round(p * (c / 100));
  }
  function safeText(s, fb = "—") {
    const t = (s ?? "").toString().trim();
    return t ? t : fb;
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
  }
  function statusLabel(s) {
    const t = (s || "").toLowerCase();
    if (t === "in_contract") return "In Contract";
    return s ? s.replace(/\b\w/g, m => m.toUpperCase()) : "Draft";
  }

  // ---------- single tile ----------
  function renderTile(doc, options) {
    const opts = Object.assign({ onClick: null }, options || {});
    const d = doc || {};

    const id = d.id || "";
    const address = safeText(d.address, "[full address]");
    const price = d.price;
    const cType = d.commissionType || "%";
    const cVal  = (d.commission != null ? d.commission : "");
    const cAmt  = commissionAmount(price, cVal, cType);

    const bds = (d.bedrooms != null ? d.bedrooms : "—");
    const ba  = (d.bathrooms != null ? d.bathrooms : "—");
    const sqft= d.sqft ? Number(d.sqft).toLocaleString() : "—";
    const pType = safeText(d.propertyType || "", "").trim(); // may be empty
    const status = safeText(d.status, "Draft");
    const banner = (d.bannerText || "").trim();
    const plan = (d.plan || "").toString();

    const brokerage = safeText(d.brokerage, plan.includes("FSBO") ? "FOR SALE BY OWNER" : "[listing brokerage]");
    const agentName = safeText(d.agentName, plan.includes("FSBO") ? "" : "[listing agent]");
    const agentPhone= safeText(d.agentPhone, plan.includes("FSBO") ? "" : "[agent phone]");

    const photos = Array.isArray(d.photos) ? d.photos : [];
    const primaryIndex = (typeof d.primaryIndex === "number") ? d.primaryIndex : 0;
    const photo = photos[primaryIndex] || "";

    const card = document.createElement("article");
    card.className = "gc-tile cursor-pointer";

    // commission label
    let rightLabel = "Commission ";
    rightLabel += (cVal === "" || cVal == null ? "—" : (cType === "$" ? money(cVal) : (Number(cVal) + "%")));
    rightLabel += " | ";
    rightLabel += cAmt ? money(cAmt) : "$—";

    card.innerHTML = `
      <div class="relative">
        <img class="gc-photo" alt="Listing photo" src="${photo}">
        ${banner ? `<div class="gc-ribbon">${escapeHtml(banner)}</div>` : ``}
      </div>

      <div class="p-3 space-y-1">
        <!-- Top line -->
        <div class="flex items-center justify-between text-[15px] sm:text-[16px] font-semibold">
          <div class="truncate">${price ? money(price) : "$—"}</div>
          <div class="truncate text-red-600">${escapeHtml(rightLabel)}</div>
        </div>

        <!-- Second line -->
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
      if (typeof opts.onClick === "function") {
        return opts.onClick({ doc: d, el: card });
      }
      // default behavior: go by Firestore id if present
      if (id) {
        window.location.href = `/listing.html?id=${encodeURIComponent(id)}`;
      }
    });

    return card;
  }

  // ---------- list renderer ----------
  function renderTileList(list, container, options) {
    const opts = Object.assign({ clear: true, onClick: null, emptyText: "No results. Try a different search." }, options || {});
    if (!container) return;
    if (opts.clear) container.innerHTML = "";
    const items = Array.isArray(list) ? list : [];
    if (!items.length) {
      const div = document.createElement("div");
      div.className = "text-sm text-gray-500";
      div.textContent = opts.emptyText;
      container.appendChild(div);
      return;
    }
    items.forEach(doc => {
      const tile = renderTile(doc, { onClick: opts.onClick });
      container.appendChild(tile);
    });
  }

  // expose
  global.renderTile = renderTile;
  global.renderTileList = renderTileList;

})(window);
