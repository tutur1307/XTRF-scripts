// ==UserScript==
// @name         Script 5 - XTRF Auto Refresh Dashboard
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Adds manual + auto refresh for Smart Views (only genericBrowseIFrame), styled exactly like the Palette button
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/dashboard.seam*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  /* -----------------------------
     CONFIG
  ----------------------------- */

  const STORAGE_KEY = 'xtrf_sv_refresh_cfg_v1';
  const DEFAULT_CFG = { enabled: false, value: 60, unit: 's' }; // 60 seconds
  const MIN_SECONDS = 5;
  const REFRESH_GAP_MS = 450; // sequential delay between iframe reloads
  const RESCAN_MS = 700;

  let cfg = loadCfg();
  let autoTimer = null;
  let panelEl = null;

  // track hovered card (so refresh can target a single widget)
  let lastHoveredCard = null;

  /* -----------------------------
     STORAGE
  ----------------------------- */

  function loadCfg() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_CFG, ...JSON.parse(raw) } : { ...DEFAULT_CFG };
    } catch (_) {
      return { ...DEFAULT_CFG };
    }
  }

  function saveCfg() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  function secondsFromCfg() {
    let s = Number(cfg.value || 0);
    if (!Number.isFinite(s)) s = DEFAULT_CFG.value;
    if (cfg.unit === 'm') s = s * 60;
    s = Math.max(MIN_SECONDS, Math.floor(s));
    return s;
  }

  /* -----------------------------
     SMART VIEW IFRAME TARGETING
  ----------------------------- */

  function isSmartViewIframe(iframe) {
    const src = (iframe.getAttribute('src') || '').toLowerCase();
    return src.includes('genericbrowseiframe.seam');
  }

  function getSmartViewIframes(scopeEl = document) {
    return Array.from(scopeEl.querySelectorAll('iframe')).filter(isSmartViewIframe);
  }

  async function reloadIframesSequential(iframes) {
    for (const iframe of iframes) {
      try {
        iframe.contentWindow.location.reload();
      } catch (_) {
        // ignore
      }
      await new Promise(r => setTimeout(r, REFRESH_GAP_MS));
    }
  }

  /* -----------------------------
     UI – find anchor & clone palette style
  ----------------------------- */

  function findEditDashboardButton() {
    return Array.from(document.querySelectorAll('button, a')).find(el =>
      (el.textContent || '').trim().toLowerCase() === 'edit dashboard'
    ) || null;
  }

  function findPaletteButtonNearEdit() {
    // Your layout: [Edit Dashboard] [Palette] [↻] [⏱️]
    // We try to find the button with a palette emoji OR title contains palette close to Edit Dashboard
    const edit = findEditDashboardButton();
    if (!edit) return null;

    const parent = edit.parentElement;
    if (!parent) return null;

    const buttons = Array.from(parent.querySelectorAll('button, a'));
    // best guess: first button after Edit Dashboard
    const editIndex = buttons.indexOf(edit);
    if (editIndex >= 0 && buttons[editIndex + 1]) return buttons[editIndex + 1];

    // fallback by text/title
    return buttons.find(b => {
      const t = (b.textContent || '').trim().toLowerCase();
      const title = (b.getAttribute('title') || '').trim().toLowerCase();
      return t.includes('🎨') || t === 'palette' || title.includes('palette');
    }) || null;
  }

  function clonePaletteButton(paletteBtn, id, title) {
    // Clone deeply to inherit internal structure/icons if any
    const btn = paletteBtn.cloneNode(true);

    // Safety: remove any existing listeners by replacing with a fresh clone
    // (cloneNode already does not carry listeners)

    btn.id = id;

    // Ensure it behaves like a button (sometimes anchor)
    if (btn.tagName.toLowerCase() === 'a') {
      // keep as <a> if XTRF uses it, but prevent navigation
      btn.setAttribute('href', '#');
    } else {
      btn.type = 'button';
    }

    btn.setAttribute('title', title);

    // wipe any palette-specific attributes that might interfere
    btn.removeAttribute('onclick');

    // Normalize inner content (we just show a symbol)
    // Try to keep the same internal padding/alignment by reusing existing child structure if possible
    // but simplest is set textContent; XTRF buttons usually still look correct.
    btn.textContent = '';

    // Create inner span so layout matches (many UI kits expect a child)
    const span = document.createElement('span');
    span.style.display = 'inline-flex';
    span.style.alignItems = 'center';
    span.style.justifyContent = 'center';
    span.style.width = '100%';
    span.style.height = '100%';
    span.textContent = '•';
    btn.appendChild(span);

    return { btn, span };
  }

  function setAutoIcon(span) {
    span.textContent = cfg.enabled ? '⏱️•' : '⏱️';
  }

  /* -----------------------------
     PANEL (auto refresh settings)
  ----------------------------- */

  function clampPanelToViewport(panel, anchorRect) {
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchorRect.left;
    let top = anchorRect.bottom + 8;

    panel.style.left = '0px';
    panel.style.top = '0px';
    panel.style.visibility = 'hidden';
    panel.style.display = 'block';

    const r = panel.getBoundingClientRect();
    const w = r.width;
    const h = r.height;

    if (left + w + pad > vw) left = Math.max(pad, anchorRect.right - w);
    if (top + h + pad > vh) top = Math.max(pad, anchorRect.top - h - 8);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.visibility = 'visible';
  }

  function buildPanel(autoBtn) {
    if (panelEl) panelEl.remove();

    panelEl = document.createElement('div');
    panelEl.style.position = 'fixed';
    panelEl.style.zIndex = '999999';
    panelEl.style.background = '#fff';
    panelEl.style.border = '1px solid rgba(0,0,0,0.15)';
    panelEl.style.borderRadius = '10px';
    panelEl.style.boxShadow = '0 10px 24px rgba(0,0,0,0.18)';
    panelEl.style.padding = '10px 10px 8px';
    panelEl.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';
    panelEl.style.fontSize = '12px';
    panelEl.style.minWidth = '230px';
    panelEl.style.display = 'none';

    panelEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <div style="font-weight:600;">Auto-refresh</div>
        <button id="xtrf_sv_close" style="border:none;background:transparent;cursor:pointer;font-size:14px;line-height:1;">✕</button>
      </div>

      <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <input id="xtrf_sv_enable" type="checkbox" />
        <span>Enable</span>
      </label>

      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <input id="xtrf_sv_value" type="number" min="${MIN_SECONDS}" step="1"
               style="width:88px;padding:6px 8px;border:1px solid rgba(0,0,0,0.2);border-radius:8px;" />
        <select id="xtrf_sv_unit"
                style="padding:6px 8px;border:1px solid rgba(0,0,0,0.2);border-radius:8px;">
          <option value="s">seconds</option>
          <option value="m">minutes</option>
        </select>
      </div>

      <div style="color:rgba(0,0,0,0.65);line-height:1.25;">
        Choose the interval of time for the automatic page refresh here.<br/>
      </div>
    `;

    document.body.appendChild(panelEl);

    const closeBtn = panelEl.querySelector('#xtrf_sv_close');
    const enableCb = panelEl.querySelector('#xtrf_sv_enable');
    const valueIn = panelEl.querySelector('#xtrf_sv_value');
    const unitSel = panelEl.querySelector('#xtrf_sv_unit');

    enableCb.checked = !!cfg.enabled;
    valueIn.value = cfg.value;
    unitSel.value = cfg.unit;

    closeBtn.addEventListener('click', () => (panelEl.style.display = 'none'));

    function applyCfg() {
      cfg.value = Math.max(MIN_SECONDS, Number(valueIn.value || MIN_SECONDS));
      cfg.unit = unitSel.value === 'm' ? 'm' : 's';
      const want = enableCb.checked;

      saveCfg();

      if (want) startAuto();
      else stopAuto();
    }

    enableCb.addEventListener('change', applyCfg);
    valueIn.addEventListener('change', applyCfg);
    unitSel.addEventListener('change', applyCfg);

    // outside click close
    setTimeout(() => {
      document.addEventListener('mousedown', (e) => {
        if (!panelEl) return;
        if (panelEl.style.display === 'none') return;
        if (panelEl.contains(e.target)) return;
        if (autoBtn.contains(e.target)) return;
        panelEl.style.display = 'none';
      });
    }, 0);
  }

  /* -----------------------------
     AUTO REFRESH LOGIC
  ----------------------------- */

  function stopAuto() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
    cfg.enabled = false;
    saveCfg();
  }

  function startAuto() {
    stopAuto();
    cfg.enabled = true;
    saveCfg();

    const tick = async () => {
      const targets = lastHoveredCard ? getSmartViewIframes(lastHoveredCard) : getSmartViewIframes(document);
      if (!targets.length) return;

      await reloadIframesSequential(targets);

      // If an iframe shows "View has expired", stop auto to avoid loops
      try {
        for (const iframe of targets) {
          const bodyText = (iframe.contentDocument?.body?.innerText || '').toLowerCase();
          if (bodyText.includes('view has expired')) {
            stopAuto();
            break;
          }
        }
      } catch (_) {}
    };

    autoTimer = setInterval(tick, secondsFromCfg() * 1000);
  }

  /* -----------------------------
     INSERT BUTTONS
  ----------------------------- */

  function insertButtons() {
    const editBtn = findEditDashboardButton();
    const paletteBtn = findPaletteButtonNearEdit();

    if (!editBtn || !paletteBtn) return false;
    if (document.getElementById('xtrf_sv_manual_refresh')) return true;

    // Create two buttons by cloning palette
    const { btn: manualBtn, span: manualSpan } = clonePaletteButton(
      paletteBtn,
      'xtrf_sv_manual_refresh',
      'Refresh Smart Views (hover a widget to refresh only it)'
    );
    manualSpan.textContent = '↻';

    const { btn: autoBtn, span: autoSpan } = clonePaletteButton(
      paletteBtn,
      'xtrf_sv_auto_refresh',
      'Auto-refresh'
    );
    setAutoIcon(autoSpan);

    // Insert right after palette button
    paletteBtn.parentElement.insertBefore(manualBtn, paletteBtn.nextSibling);
    paletteBtn.parentElement.insertBefore(autoBtn, manualBtn.nextSibling);

    // Actions
    manualBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (manualBtn.disabled) return;

      manualBtn.disabled = true;
      try {
        const targets = lastHoveredCard ? getSmartViewIframes(lastHoveredCard) : getSmartViewIframes(document);
        await reloadIframesSequential(targets);
      } finally {
        setTimeout(() => (manualBtn.disabled = false), 350);
      }
    });

    autoBtn.addEventListener('click', (e) => {
      e.preventDefault();

      if (!panelEl) buildPanel(autoBtn);

      panelEl.style.display = panelEl.style.display === 'none' ? 'block' : 'none';
      if (panelEl.style.display === 'block') {
        const rect = autoBtn.getBoundingClientRect();
        clampPanelToViewport(panelEl, rect);
      }

      // sync icon every open
      setAutoIcon(autoSpan);
      autoBtn.title = cfg.enabled ? `Auto-refresh ON (${secondsFromCfg()}s)` : 'Auto-refresh';
    });

    // Keep auto icon in sync if auto state changes elsewhere
    const sync = () => {
      setAutoIcon(autoSpan);
      autoBtn.title = cfg.enabled ? `Auto-refresh ON (${secondsFromCfg()}s)` : 'Auto-refresh';
    };

    // Patch start/stop to sync icon
    const _startAuto = startAuto;
    const _stopAuto = stopAuto;
    startAuto = function () { _startAuto(); sync(); };
    stopAuto  = function () { _stopAuto();  sync(); };

    // Restore auto if enabled
    if (cfg.enabled) startAuto();

    return true;
  }

  /* -----------------------------
     HOVER TRACKING
  ----------------------------- */

  function trackHoveredWidget() {
    document.addEventListener('mousemove', (e) => {
      const card = e.target?.closest?.('.x-card');
      lastHoveredCard = card || null;
    }, { passive: true });
  }

  /* -----------------------------
     BOOT
  ----------------------------- */

  function boot() {
    trackHoveredWidget();

    const t = setInterval(() => {
      const ok = insertButtons();
      if (ok) clearInterval(t);
    }, RESCAN_MS);
  }

  boot();
})();
