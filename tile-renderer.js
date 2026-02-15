/**
 * tile-renderer.js
 * Shared listing tile renderer for GuaranteedCommission.com
 * Used by: index.html (Strip 2), search.html
 * 
 * Build: 2026-02-15
 * 
 * CHANGES (2026-01-15):
 * - Added FSBO owner contact support (ownerName, ownerPhone)
 * - Contact line now shows: 
 *   - FSBO: "FOR SALE BY OWNER - [Owner Name] - [Owner Phone]"
 *   - Listed: "BROKERAGE - [Agent Name] - [Agent Phone]"
 * 
 * CHANGES (2026-01-17):
 * - Added SOLD ribbon on tiles when status === "Sold"
 * 
 * CHANGES (2026-02-14):
 * - SOLD badge centered horizontally (was top-left)
 * - Sold listings now display soldPrice instead of listing price
 * - Sold price styled in dark red (text-red-700)
 * - Commission math uses soldPrice for sold listings
 * 
 * CHANGES (2026-02-15):
 * - Status line now shows "Sold M/D/YYYY for $X,XXX,XXX" when soldDate+soldPrice available
 *   (was showing generic "Sold")
 * 
 * IMPORTANT: This file does NOT inject CSS.
 * CSS classes used: .gc-tile, .gc-photo, .gc-ribbon, .gc-heart, .gc-share, .gc-share-left, .gc-share-right
 * These must be defined in the consuming page's <style> block.
 */

// ============================================
// HELPER FUNCTIONS (exported for reuse)
// ============================================

/**
 * Format number as USD currency
 * @param {number|string} n - The number to format
 * @returns {string} Formatted currency string
 */
export function money(n) {
  const v = Number(n || 0);
  return v ? ('$' + v.toLocaleString()) : '$-';
}

/**
 * Calculate commission in dollars
 * @param {number} price - Listing price
 * @param {number} val - Commission value
 * @param {string} type - '%' or '$'
 * @returns {number|null} Commission in dollars or null
 */
export function commissionDollars(price, val, type) {
  const p = Number(price || 0);
  const c = Number(val || 0);
  if (!c) return null;
  if (type === '$') return Math.round(c);
  if (p) return Math.round(p * (c / 100));
  return null;
}

/**
 * Format commission label (e.g., "2.5%" or "$25,000")
 * @param {number} val - Commission value
 * @param {string} type - '%' or '$'
 * @returns {string} Formatted label
 */
export function commissionLabel(val, type) {
  if (!val && val !== 0) return '-';
  if (type === '$') return '$' + Number(val).toLocaleString();
  return Number(val) + '%';
}

/**
 * Share limit check (5/day/device for non-logged-in users)
 * @returns {boolean} Whether sharing is allowed
 */
export function shareLimitOk() {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const key = 'shareCount:' + day;
    const n = Number(localStorage.getItem(key) || 0);
    if (n >= 5) {
      alert('Please log in to continue sharing.');
      return false;
    }
    localStorage.setItem(key, String(n + 1));
    return true;
  } catch {
    return true;
  }
}

/**
 * Open email share
 * @param {string} address - Listing address
 * @param {string} url - Share URL
 */
export function openEmail(address, url) {
  const subject = encodeURIComponent(address ? `Listing: ${address}` : 'Listing');
  const body = encodeURIComponent(`${address ? (address + ' - ') : ''}commission posted with photos.\n\n${url}`);
  const a = document.createElement('a');
  a.href = `mailto:?subject=${subject}&body=${body}`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch (e) {}
  }, 0);
}

/**
 * Open SMS share
 * @param {string} address - Listing address
 * @param {string} url - Share URL
 */
export function openText(address, url) {
  const msg = encodeURIComponent(`${address ? (address + ' - ') : ''}commission posted with photos.\n\n${url}`);
  window.location.href = 'sms:&body=' + msg;
}

// ============================================
// FAVORITES HELPERS
// ============================================

const FAV_KEY = 'gcFavorites';

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
  } catch {
    return [];
  }
}

function setFavorites(arr) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(arr || []));
  } catch {}
}

function isFavorite(id) {
  return getFavorites().includes(id);
}

function toggleFavorite(id) {
  const arr = getFavorites();
  const idx = arr.indexOf(id);
  if (idx >= 0) {
    arr.splice(idx, 1);
  } else {
    arr.push(id);
  }
  setFavorites(arr);
  return arr.includes(id);
}

function heartSvg(filled) {
  return filled
    ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="#dc2626"><path d="M12 21s-6.716-4.584-9.428-7.296C.858 12.99.5 11.8.5 10.5.5 7.462 2.962 5 6 5c1.74 0 3.41.81 4.5 2.09C11.59 5.81 13.26 5 15 5c3.038 0 5.5 2.462 5.5 5.5 0 1.3-.358 2.49-2.072 3.204C18.716 16.416 12 21 12 21z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#dc2626" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>';
}

// ============================================
// CONTACT LINE BUILDER
// ============================================

/**
 * Build the contact line based on listing type
 * @param {Object} params - Contact parameters
 * @param {boolean} params.isFSBO - Whether this is a FSBO listing
 * @param {string} params.brokerage - Brokerage name (for Listed)
 * @param {string} params.agentName - Agent name (for Listed)
 * @param {string} params.agentPhone - Agent phone (for Listed)
 * @param {string} params.ownerName - Owner name (for FSBO)
 * @param {string} params.ownerPhone - Owner phone (for FSBO)
 * @returns {string} Formatted contact line HTML
 */
function buildContactLine({ isFSBO, brokerage, agentName, agentPhone, ownerName, ownerPhone }) {
  if (isFSBO) {
    let line = 'FOR SALE BY OWNER';
    if (ownerName) {
      line += ' - ' + ownerName;
    }
    if (ownerPhone) {
      line += ' - ' + ownerPhone;
    }
    return line;
  } else {
    let line = (brokerage || '[listing brokerage]').toUpperCase();
    if (agentName) {
      line += ' - ' + agentName;
    }
    if (agentPhone) {
      line += ' - ' + agentPhone;
    }
    return line;
  }
}

// ============================================
// MAIN TILE RENDERER
// ============================================

/**
 * Render a listing tile
 * 
 * CSS classes used (must be defined in page):
 * - .gc-tile: Card container
 * - .gc-photo: Photo element  
 * - .gc-ribbon: Banner overlay
 * - .gc-heart: Heart/like button
 * - .gc-share: Share button base
 * - .gc-share-left: Left share button
 * - .gc-share-right: Right share button
 * 
 * @param {Object} data - Listing data
 * @param {Object} options - Render options
 * @param {Function} options.onLikeIncrement - Async callback to increment like in Firestore
 * @returns {HTMLElement} The tile element
 */
export function renderTile(data, options = {}) {
  // Extract data with defaults
  const id = data.id || '';
  const address = data.address || '[full address]';
  const price = data.price;
  const commission = data.commission;
  const commissionType = data.commissionType || '%';
  const bannerText = data.bannerText || '';
  const photos = Array.isArray(data.photos) ? data.photos : [];
  const primaryIndex = data.primaryIndex || 0;
  const status = data.status || 'Active';
  const brokerage = data.brokerage || '';
  const agentName = data.agentName || '';
  const agentPhone = data.agentPhone || '';
  const ownerName = data.ownerName || '';
  const ownerPhone = data.ownerPhone || '';
  const plan = data.plan || 'Listed Property Basic';
  const bedrooms = data.bedrooms;
  const bathrooms = data.bathrooms;
  const sqft = data.sqft;
  const propertyType = data.propertyType || '';
  let views = Number(data.views || 0);
  let likes = Number(data.likes || 0);

  // SOLD flag
  const isSold = String(status || '').trim().toLowerCase() === 'sold';

  // For sold listings, use soldPrice for display and commission math
  const finalPrice = (isSold && data.soldPrice) ? Number(data.soldPrice) : price;

  // Computed values using finalPrice
  const commDollars = commissionDollars(finalPrice, commission, commissionType);
  const priceDisplay = money(finalPrice);
  const commLabel = commissionLabel(commission, commissionType);
  const commDollarsDisplay = commDollars != null ? ('$' + commDollars.toLocaleString()) : '-';

  // Photo
  const validPhotos = photos.filter(p => typeof p === 'string' && p);
  const safeIndex = (primaryIndex >= 0 && primaryIndex < validPhotos.length) ? primaryIndex : 0;
  const photoUrl = validPhotos[safeIndex] || '';

  // Determine if FSBO
  const isFSBO = (plan || '').indexOf('FSBO') >= 0;

  // Build contact line using helper
  const contactLine = buildContactLine({
    isFSBO,
    brokerage,
    agentName,
    agentPhone,
    ownerName,
    ownerPhone
  });

  // Property type segment
  const typeSeg = propertyType ? ' | ' + propertyType : '';

  // Price class: dark red for sold listings
  const priceClass = isSold ? 'text-red-700' : '';

  // Build status display text (e.g. "Sold 2/14/2026 for $8,100,000")
  let statusDisplay = status;
  if (isSold) {
    const soldDateRaw = data.soldDate;
    const soldPriceRaw = data.soldPrice;

    if (soldDateRaw && soldPriceRaw) {
      let formattedDate = null;
      try {
        const dateStr = String(soldDateRaw);
        if (dateStr.includes('-')) {
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            const month = parseInt(parts[1], 10);
            const day = parseInt(parts[2], 10);
            if (parts[0] && month && day) {
              formattedDate = `${month}/${day}/${parts[0]}`;
            }
          }
        }
      } catch (e) {}

      let formattedPrice = null;
      try {
        const priceNum = Number(soldPriceRaw);
        if (priceNum > 0) formattedPrice = '$' + priceNum.toLocaleString();
      } catch (e) {}

      if (formattedDate && formattedPrice) {
        statusDisplay = `Sold ${formattedDate} for ${formattedPrice}`;
      } else if (formattedDate) {
        statusDisplay = `Sold ${formattedDate}`;
      } else if (formattedPrice) {
        statusDisplay = `Sold for ${formattedPrice}`;
      }
    }
  }

  // Create card element
  const card = document.createElement('article');
  card.className = 'gc-tile cursor-pointer';
  card.onclick = function() {
    if (id) {
      window.location.href = '/listing.html?id=' + encodeURIComponent(id);
    } else {
      window.location.href = '/listing.html?addr=' + encodeURIComponent(address);
    }
  };

  // Build HTML — SOLD badge centered, price uses finalPrice with conditional color
  card.innerHTML = `
    <div class="relative">
      <img class="gc-photo" src="${photoUrl}" alt="Listing photo">
      ${bannerText ? `<div class="gc-ribbon">${bannerText}</div>` : ''}

      ${isSold ? `<div class="absolute top-2 left-1/2 -translate-x-1/2 bg-red-600 text-white font-bold text-[11px] px-2 py-1 rounded shadow">SOLD</div>` : ''}

      <button type="button" class="gc-heart" aria-label="Like">
        ${heartSvg(false)}
      </button>
      <button type="button" class="gc-share gc-share-left" data-share="email">Share Email</button>
      <button type="button" class="gc-share gc-share-right" data-share="text">Share Text</button>
    </div>
    <div class="p-3 space-y-2">
      <div class="flex items-center justify-between text-[15px] sm:text-[16px] font-semibold">
        <div class="truncate ${priceClass}">${priceDisplay}</div>
        <div class="truncate text-red-600">Commission ${commLabel} | ${commDollarsDisplay}</div>
      </div>
      <div class="text-[12px] text-gray-700">
        ${bedrooms != null ? bedrooms : '-'} bds | ${bathrooms != null ? bathrooms : '-'} ba | ${sqft ? Number(sqft).toLocaleString() : '-'} sqft${typeSeg} | ${isSold ? `<span class="text-red-700 font-bold">${statusDisplay}</span>` : statusDisplay}
      </div>
      <div class="text-sm font-medium">${address}</div>
      <div class="text-[12px] text-gray-600">
        ${contactLine}
      </div>
      <div class="text-[12px] text-gray-500 text-center" data-stats>
        Viewed ${views.toLocaleString()} time${views === 1 ? '' : 's'} | Liked ${likes.toLocaleString()} time${likes === 1 ? '' : 's'}
      </div>
    </div>
  `;

  // Wire up heart button
  const heart = card.querySelector('.gc-heart');
  const statsEl = card.querySelector('[data-stats]');
  const favId = 'fav:' + (id || address);

  if (heart) {
    heart.innerHTML = heartSvg(isFavorite(favId));

    heart.addEventListener('click', async function(e) {
      e.preventDefault();
      e.stopPropagation();

      const nowLiked = toggleFavorite(favId);
      heart.innerHTML = heartSvg(nowLiked);

      // First-time like increment
      if (id && nowLiked) {
        const onceKey = 'likedOnce:' + id;
        if (!localStorage.getItem(onceKey)) {
          try {
            if (typeof options.onLikeIncrement === 'function') {
              await options.onLikeIncrement(id);
              localStorage.setItem(onceKey, '1');

              // Update stats display
              likes++;
              if (statsEl) {
                statsEl.textContent = `Viewed ${views.toLocaleString()} time${views === 1 ? '' : 's'} | Liked ${likes.toLocaleString()} time${likes === 1 ? '' : 's'}`;
              }
            }
          } catch (err) {
            console.warn('[tile] like increment failed', err);
          }
        }
      }
    });
  }

  // Wire up share buttons
  const shareUrl = id
    ? (window.location.origin + '/listing.html?id=' + encodeURIComponent(id))
    : (window.location.origin + '/listing.html?addr=' + encodeURIComponent(address));

  const emailBtn = card.querySelector('[data-share="email"]');
  const textBtn = card.querySelector('[data-share="text"]');

  if (emailBtn) {
    emailBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (!shareLimitOk()) return;
      openEmail(address, shareUrl);
    });
  }

  if (textBtn) {
    textBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (!shareLimitOk()) return;
      openText(address, shareUrl);
    });
  }

  return card;
}

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  renderTile,
  money,
  commissionDollars,
  commissionLabel,
  shareLimitOk,
  openEmail,
  openText
};
