<script>
/**
 * renderTile(opts)
 * renderTileList(list, container, { clear=true, onClick(item){...} } )
 *
 * See inline docs below.
 */
(function(global){
  function money(n){ const x = Number(n||0); return isFinite(x) ? '$' + x.toLocaleString() : '$-'; }
  function primaryPhoto(agentData){
    const arr = Array.isArray(agentData?.photos) ? agentData.photos : [];
    const idx = (typeof agentData?.primaryIndex === 'number') ? agentData.primaryIndex : 0;
    return arr[idx] || 'https://via.placeholder.com/800x450?text=Primary+Photo';
  }
  function commissionAmount(price, commission, type){
    const p = Number(price||0), c = Number(commission||0);
    return (type === '%') ? Math.round(p*(c/100)) : Math.round(c);
  }
  function statusMeta(s){
    switch((s||'').toLowerCase()){
      case 'active':      return {label:'Active',      bg:'bg-emerald-100', text:'text-emerald-700'};
      case 'in_contract': return {label:'In Contract', bg:'bg-amber-100',   text:'text-amber-700'};
      case 'sold':        return {label:'Sold',        bg:'bg-rose-100',    text:'text-rose-700'};
      default:            return {label:'Draft',       bg:'bg-gray-200',    text:'text-gray-700'};
    }
  }

  /**
   * Render a single tile.
   * @param {{
   *   container: HTMLElement,
   *   formData: object,
   *   agentData: object,
   *   plan: string,
   *   onClick?: function
   * }} opts
   * @returns {HTMLElement} the tile element
   */
  function renderTile(opts){
    const { container, formData={}, agentData={}, plan='Listed Property Basic', onClick } = opts || {};
    if (!container) throw new Error('renderTile: container is required');

    const isPlus = plan === 'Listed Property Plus' || plan === 'FSBO Plus';
    const isFSBO = plan === 'FSBO Plus';

    const price = agentData.price;
    const cType = agentData.commissionType ?? formData.commissionType ?? '%';
    const cVal  = (agentData.commission ?? formData.commission) ?? '';
    const commTotal = commissionAmount(price, cVal, cType);

    const sm = statusMeta(agentData.status);
    const address = formData.address || '[Address]';

    const tile = document.createElement('article');
    tile.className = "bg-white rounded-2xl shadow hover:shadow-md transition overflow-hidden cursor-pointer w-full";
    tile.innerHTML = `
      <div class="relative">
        <img class="w-full h-40 object-cover bg-gray-100" alt="Tile photo">
        <div class="absolute top-2 left-2 ${sm.bg} ${sm.text} text-[11px] font-bold rounded-full px-2 py-1">${sm.label}</div>
        <div class="absolute top-2 right-2 ${agentData.bannerText ? '' : 'hidden'} bg-black/90 text-white text-[11px] font-bold rounded-full px-2 py-1" data-el="ribbon"></div>
      </div>
      <div class="p-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-lg font-extrabold leading-tight" data-el="price">${price ? money(price) : 'Price coming soon'}</div>
            <div class="text-xs text-gray-600" data-el="address">${address}</div>
          </div>
          <div class="text-right">
            <div class="text-[11px] text-gray-500">Commission</div>
            <div class="text-sm font-semibold" data-el="commPct">${
              cVal === '' ? '—' : (cType === '$' ? ('$'+Number(cVal||0)) : (Number(cVal||0)+'%'))
            }</div>
            <div class="text-sm font-extrabold" data-el="commAmt">${money(commTotal)}</div>
          </div>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-700">
          <span class="px-2 py-1 bg-gray-100 rounded" data-el="beds">${agentData.beds ?? '—'} bd</span>
          <span class="px-2 py-1 bg-gray-100 rounded" data-el="baths">${agentData.baths ?? '—'} ba</span>
          <span class="px-2 py-1 bg-gray-100 rounded" data-el="sqft">${agentData.sqft ? agentData.sqft.toLocaleString() : '—'} sqft</span>
          <span class="px-2 py-1 bg-indigo-50 text-indigo-700 rounded font-semibold">${plan}</span>
        </div>
      </div>
    `;

    tile.querySelector('img').src = primaryPhoto(agentData);
    if (agentData.bannerText) tile.querySelector('[data-el="ribbon"]').textContent = agentData.bannerText;

    tile.addEventListener('click', () => {
      if (typeof onClick === 'function') return onClick({ formData, agentData, plan, el: tile });
      if (formData.address) {
        const slug = encodeURIComponent(formData.address);
        window.location.href = `/listing.html?addr=${slug}`;
      }
    });

    container.appendChild(tile);
    return tile;
  }

  /**
   * Bulk render helper.
   * @param {Array<{formData:object, agentData:object, plan:string}>} list
   * @param {HTMLElement} container
   * @param {{clear?:boolean, onClick?:function}} options
   */
  function renderTileList(list, container, options){
    const opts = Object.assign({ clear: true, onClick: null }, options || {});
    if (!Array.isArray(list)) return;
    if (!container) return;

    if (opts.clear) container.innerHTML = '';
    list.forEach(item => {
      renderTile({
        container,
        formData: item.formData || {},
        agentData: item.agentData || {},
        plan: item.plan || 'Listed Property Basic',
        onClick: opts.onClick
      });
    });
  }

  // expose
  global.renderTile = renderTile;
  global.renderTileList = renderTileList;
})(window);
</script>
