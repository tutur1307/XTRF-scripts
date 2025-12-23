// ==UserScript==
// @name         Script 4 – Dashboard Theme + Dark Mode
// @namespace    http://tampermonkey.net/
// @version      1.5.3
// @description  Dark mode dashboard + smart views inside iframes. Keeps other scripts' colors (overdue/status). Palette included. Cleans up in light mode. + Font size + Hover intensity (FULL table content) + Font override toggle
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE_KEY = "xtrf_dashboard_theme_v2";
  const FIX_ATTR = "data-xtrf-darkfix";

  const DEFAULT_THEME = {
    bgColor: "#e9eef3",
    bgAlpha: 1.0,
    radius: 22,
    shadowEnabled: true,
    darkMode: false,

    // NEW
    fontSize: 13.0,          // 8 → 16 (step 0.25)
    hoverIntensity: 0.35,    // 0 → 1 (clair → foncé)

    // NEW (toggle)
    fontOverride: true       // true = impose our font size, false = let XTRF handle it
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

  function loadTheme() {
    const saved = safeParse(localStorage.getItem(STORAGE_KEY));
    const t = { ...DEFAULT_THEME };
    if (saved && typeof saved === "object") {
      if (typeof saved.bgColor === "string") t.bgColor = saved.bgColor;
      if (typeof saved.bgAlpha === "number") t.bgAlpha = clamp(saved.bgAlpha, 0.15, 1);
      if (typeof saved.radius === "number") t.radius = clamp(saved.radius, 0, 40);
      if (typeof saved.shadowEnabled === "boolean") t.shadowEnabled = saved.shadowEnabled;
      if (typeof saved.darkMode === "boolean") t.darkMode = saved.darkMode;

      if (typeof saved.fontSize === "number") t.fontSize = clamp(saved.fontSize, 8, 16);
      if (typeof saved.hoverIntensity === "number") t.hoverIntensity = clamp(saved.hoverIntensity, 0, 1);

      // NEW
      if (typeof saved.fontOverride === "boolean") t.fontOverride = saved.fontOverride;
    }
    return t;
  }

  function saveTheme(t) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); } catch {} }

  function hexToRgb(hex) {
    const h = (hex || "#000").replace("#", "").trim();
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbaFromHex(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    const a = clamp(typeof alpha === "number" ? alpha : 1, 0, 1);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function injectCSS(id, css) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function hoverAlphaFromIntensity(intensity) {
    const minA = 0.01;
    const maxA = 0.22;
    return minA + (maxA - minA) * clamp(intensity, 0, 1);
  }

  function setVars(theme) {
    const lightCard = "rgba(255,255,255,0.92)";
    const lightInner = "rgba(255,255,255,0.92)";
    const lightHeader = "rgba(0,0,0,0.03)";
    const lightBorder = "rgba(0,0,0,0.10)";
    const lightGrid = "rgba(0,0,0,0.10)";

    const darkBg = "rgba(31,42,42,1)";
    const darkCard = "rgba(34,34,34,0.92)";
    const darkInner = "rgba(26,26,26,0.92)";
    const darkInner2 = "rgba(20,20,20,0.92)";
    const darkHeader = "rgba(85,85,85,0.96)";
    const darkBorder = "rgba(255,255,255,0.14)";
    const darkGrid = "rgba(255,255,255,0.10)";
    const darkText = "rgba(255,255,255,0.92)";

    const canvasBg = theme.darkMode ? darkBg : rgbaFromHex(theme.bgColor, theme.bgAlpha);

    const hoverA = hoverAlphaFromIntensity(theme.hoverIntensity);
    const hoverColor = theme.darkMode
      ? `rgba(255,255,255,${hoverA})`
      : `rgba(0,0,0,${hoverA})`;

    document.documentElement.style.setProperty("--xtrf-bg", canvasBg);
    document.documentElement.style.setProperty("--xtrf-radius", `${theme.radius}px`);
    document.documentElement.style.setProperty("--xtrf-shadow", theme.shadowEnabled ? "0 14px 36px rgba(0,0,0,0.22)" : "none");

    // We still set the var, but we only APPLY it when fontOverride=true
    document.documentElement.style.setProperty("--xtrf-font-size", `${clamp(theme.fontSize, 8, 16)}px`);
    document.documentElement.style.setProperty("--xtrf-hover", hoverColor);

    if (theme.darkMode) {
      document.documentElement.style.setProperty("--xtrf-card-bg", darkCard);
      document.documentElement.style.setProperty("--xtrf-card-inner", darkInner);
      document.documentElement.style.setProperty("--xtrf-card-inner2", darkInner2);
      document.documentElement.style.setProperty("--xtrf-card-header-bg", darkHeader);
      document.documentElement.style.setProperty("--xtrf-border", darkBorder);
      document.documentElement.style.setProperty("--xtrf-grid", darkGrid);
      document.documentElement.style.setProperty("--xtrf-text", darkText);
    } else {
      document.documentElement.style.setProperty("--xtrf-card-bg", lightCard);
      document.documentElement.style.setProperty("--xtrf-card-inner", lightInner);
      document.documentElement.style.setProperty("--xtrf-card-inner2", lightHeader);
      document.documentElement.style.setProperty("--xtrf-card-header-bg", lightHeader);
      document.documentElement.style.setProperty("--xtrf-border", lightBorder);
      document.documentElement.style.setProperty("--xtrf-grid", lightGrid);
      document.documentElement.style.setProperty("--xtrf-text", "inherit");
    }
  }

  function applyTheme(theme, context) {
    setVars(theme);
    document.documentElement.classList.toggle("xtrf-darkmode", !!theme.darkMode);

    // ✅ IMPORTANT: enforce font-size on table containers AND their inner content (ONLY if fontOverride=true)
    const fontTargets = theme.fontOverride ? `
      html, body { font-size: var(--xtrf-font-size) !important; line-height: 1.25 !important; }

      table, thead, tbody, tfoot, tr, th, td,
      .x-table, .x-table__head, .x-table__body,
      .x-table th, .x-table td,
      .ui-grid, .ui-grid-render-container, .ui-grid-viewport,
      .ui-grid-row, .ui-grid-cell,
      .ui-grid-cell-contents,
      .ui-grid-header, .ui-grid-header-cell,
      .ui-grid-header-cell-label,
      .ui-grid-header-cell-wrapper,
      .ui-grid-pager-panel,
      .ui-grid-pager-panel * {
        font-size: var(--xtrf-font-size) !important;
        line-height: 1.25 !important;
      }

      /* Force inner spans/links/divs inside cells to follow the cell font-size */
      td *, th *,
      .x-table td *, .x-table th *,
      .x-table__body *, .x-table__head *,
      .ui-grid-cell *, .ui-grid-cell-contents *,
      .ui-grid-header-cell *, .ui-grid-header-cell-label * {
        font-size: inherit !important;
        line-height: inherit !important;
      }

      /* Inputs/buttons (usually desired) */
      .x-btn, button, input, select, textarea {
        font-size: var(--xtrf-font-size) !important;
      }
    ` : ``;

    const parentCSS = `
      ${fontTargets}

      html, body { background: var(--xtrf-bg) !important; }
      .x-grid { background: var(--xtrf-bg) !important; }
      .x-grid > * { background-color: transparent !important; }

      .x-card, .xlt-card, .xdb-dashboard__widget, .card, .panel {
        border-radius: var(--xtrf-radius) !important;
        box-shadow: var(--xtrf-shadow) !important;
        overflow: hidden !important;
        border: 1px solid var(--xtrf-border) !important;
        background: var(--xtrf-card-bg) !important;
      }
      .x-card__header, .xlt-card__header, .card-header {
        background: var(--xtrf-card-header-bg) !important;
        border-bottom: 1px solid var(--xtrf-border) !important;
        font-weight: 800 !important;
      }

      /* Existing dark top bars */
      .xtrf-darkmode .x-tabs,
      .xtrf-darkmode .x-tabs__bar,
      .xtrf-darkmode .x-tab-bar,
      .xtrf-darkmode .x-tabs__header,
      .xtrf-darkmode .x-tabs__container,
      .xtrf-darkmode .x-tabs__wrapper,
      .xtrf-darkmode .nav,
      .xtrf-darkmode .nav-tabs,
      .xtrf-darkmode header,
      .xtrf-darkmode .x-header,
      .xtrf-darkmode .x-top-bar,
      .xtrf-darkmode .x-navbar,
      .xtrf-darkmode .navbar {
        background: rgba(56,56,56,0.98) !important;
        border-bottom: 1px solid var(--xtrf-border) !important;
      }
      .xtrf-darkmode .x-tabs *,
      .xtrf-darkmode .nav *,
      .xtrf-darkmode .nav-tabs *,
      .xtrf-darkmode header *,
      .xtrf-darkmode .navbar * { color: var(--xtrf-text) !important; }

      /* Force the very top tabs bar (Dashboard / Classic dashboard) */
      .xtrf-darkmode ul.nav-tabs,
      .xtrf-darkmode .nav-tabs,
      .xtrf-darkmode .nav-tabs > li,
      .xtrf-darkmode .nav-tabs > li > a,
      .xtrf-darkmode #tabs,
      .xtrf-darkmode .tabs {
        background: rgba(56,56,56,0.98) !important;
        border-bottom: 1px solid var(--xtrf-border) !important;
      }
      .xtrf-darkmode ul.nav-tabs > li > a,
      .xtrf-darkmode .nav-tabs > li > a {
        color: var(--xtrf-text) !important;
      }

      .xtrf-darkmode .x-title-bar {
        background: rgba(70,70,70,0.98) !important;
        border-bottom: 1px solid var(--xtrf-border) !important;
      }
      .xtrf-darkmode .x-title-bar * { color: var(--xtrf-text) !important; }

      .xtrf-darkmode .x-title-bar .x-btn.--large {
        background: rgba(0,0,0,0.25) !important;
        color: var(--xtrf-text) !important;
        border: 1px solid var(--xtrf-border) !important;
        box-shadow: none !important;
      }

      #xtrf-palette-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 44px !important;
      }
    `;

    const iframeCSS = `
      ${fontTargets}

      /* Dark-only base */
      .xtrf-darkmode html, .xtrf-darkmode body {
        background: var(--xtrf-card-inner) !important;
        color: var(--xtrf-text) !important;
        height: 100% !important;
        min-height: 100% !important;
      }

      /* Headers: no gradients */
      .xtrf-darkmode thead,
      .xtrf-darkmode th,
      .xtrf-darkmode .ui-grid-header,
      .xtrf-darkmode .ui-grid-header-cell,
      .xtrf-darkmode .ui-grid-header-cell-wrapper {
        background: var(--xtrf-card-inner2) !important;
        color: var(--xtrf-text) !important;
        border-color: var(--xtrf-grid) !important;
        background-image: none !important;
        box-shadow: none !important;
      }
      .xtrf-darkmode th *,
      .xtrf-darkmode .ui-grid-header-cell *,
      .xtrf-darkmode .x-table__head * {
        background-image: none !important;
        box-shadow: none !important;
      }

      /* Header hover: keep one single state (no darkening on hover) */
      .xtrf-darkmode thead th:hover,
      .xtrf-darkmode .ui-grid-header-cell:hover,
      .xtrf-darkmode .x-table__head th:hover {
        background: var(--xtrf-card-inner2) !important;
        background-image: none !important;
      }

      /* Header separators: make them grey (less white) */
      .xtrf-darkmode thead th,
      .xtrf-darkmode .ui-grid-header-cell,
      .xtrf-darkmode .x-table__head th {
        border-right: 1px solid rgba(255,255,255,0.10) !important;
        border-left: 1px solid rgba(255,255,255,0.10) !important;
      }

      /* Keep text readable but DON'T overwrite backgrounds (overdue/status scripts) */
      .xtrf-darkmode td,
      .xtrf-darkmode .ui-grid-cell {
        color: var(--xtrf-text) !important;
        border-color: var(--xtrf-grid) !important;
      }

      /* IMPORTANT: if a TD/TR is colored by other scripts (inline background), remove inner black boxes */
      .xtrf-darkmode td[style*="background"] *,
      .xtrf-darkmode td[style*="background-color"] *,
      .xtrf-darkmode tr[style*="background"] *,
      .xtrf-darkmode tr[style*="background-color"] * {
        background: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }

      /* Hover on rows (intensity-controlled) */
      .xtrf-darkmode tr:hover,
      .xtrf-darkmode .ui-grid-row:hover,
      tr:hover, .ui-grid-row:hover {
        background: var(--xtrf-hover) !important;
      }

      /* Resizers/separators */
      .xtrf-darkmode .x-table__col-resize,
      .xtrf-darkmode .x-table__resize-handle,
      .xtrf-darkmode .x-table__col-separator,
      .xtrf-darkmode th::before,
      .xtrf-darkmode th::after,
      .xtrf-darkmode .ui-grid-header-cell::before,
      .xtrf-darkmode .ui-grid-header-cell::after {
        background: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }

      /* Pagination buttons (1,2,Next) */
      .xtrf-darkmode .x-pagination,
      .xtrf-darkmode .x-pagination *,
      .xtrf-darkmode .pagination,
      .xtrf-darkmode .pagination *,
      .xtrf-darkmode .ui-grid-pager-panel,
      .xtrf-darkmode .ui-grid-pager-panel * {
        color: var(--xtrf-text) !important;
        border-color: var(--xtrf-border) !important;
      }

      .xtrf-darkmode .x-pagination a,
      .xtrf-darkmode .x-pagination button,
      .xtrf-darkmode .pagination a,
      .xtrf-darkmode .pagination button,
      .xtrf-darkmode .ui-grid-pager-panel button,
      .xtrf-darkmode .ui-grid-pager-panel a {
        background: rgba(0,0,0,0.22) !important;
        border: 1px solid var(--xtrf-border) !important;
        border-radius: 6px !important;
      }

      .xtrf-darkmode .x-pagination a:hover,
      .xtrf-darkmode .x-pagination button:hover,
      .xtrf-darkmode .pagination a:hover,
      .xtrf-darkmode .pagination button:hover,
      .xtrf-darkmode .ui-grid-pager-panel button:hover {
        background: rgba(0,0,0,0.32) !important;
      }
    `;

    injectCSS("xtrf-dashboard-theme-css", (context === "iframe") ? iframeCSS : parentCSS);
  }

  // ---------- WHITE KILLER (IFRAME ONLY) ----------
  function isWhiteish(rgbStr) {
    if (!rgbStr) return false;
    const s = rgbStr.replace(/\s+/g, "");
    if (s === "transparent" || s === "rgba(0,0,0,0)") return true;
    const m = s.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([0-9.]+))?\)$/);
    if (!m) return false;
    const r = +m[1], g = +m[2], b = +m[3];
    const a = (m[4] === undefined) ? 1 : +m[4];
    if (a === 0) return true;
    return a > 0.95 && r >= 245 && g >= 245 && b >= 245;
  }

  function cleanupFixed() {
    const fixed = document.querySelectorAll(`[${FIX_ATTR}="1"]`);
    fixed.forEach(el => {
      el.removeAttribute(FIX_ATTR);
      el.style.removeProperty("background-color");
      el.style.removeProperty("background-image");
    });
  }

  function fixWhitesDarkOnly() {
    const theme = loadTheme();
    const isDark = !!theme.darkMode;

    if (!location.href.includes("genericBrowseIFrame.seam")) return;

    if (!isDark) {
      cleanupFixed();
      return;
    }

    const candidates = document.querySelectorAll("body *");

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 18) continue;

      // If inside a colored row (overdue/urgency), never patch inside it
      const tr = el.closest("tr");
      if (tr) {
        const trBg = getComputedStyle(tr).backgroundColor;
        if (!isWhiteish(trBg)) continue;
      }

      // Also skip if this element is a colored td/th itself
      if (el.matches && el.matches("td,th")) {
        const selfBg = getComputedStyle(el).backgroundColor;
        if (!isWhiteish(selfBg)) continue;
      }

      const cs = getComputedStyle(el);
      if (!isWhiteish(cs.backgroundColor)) continue;

      el.setAttribute(FIX_ATTR, "1");
      el.style.setProperty("background-color", "var(--xtrf-card-inner)", "important");
      el.style.setProperty("background-image", "none", "important");
    }
  }

  // -------- Palette UI (parent only)
  let popover = null;

  function closePopover() {
    if (!popover) return;
    popover.remove();
    popover = null;
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
  }
  function onOutsidePointerDown(ev) {
    const btn = document.getElementById("xtrf-palette-btn");
    if (!popover) return;
    if (popover.contains(ev.target)) return;
    if (btn && (btn === ev.target || btn.contains(ev.target))) return;
    closePopover();
  }
  function onKeyDown(ev) { if (ev.key === "Escape") closePopover(); }

  function openPopover(anchorBtn) {
    const theme = loadTheme();
    const r = anchorBtn.getBoundingClientRect();
    const top = Math.round(r.bottom + 10);
    const right = Math.round(Math.max(12, window.innerWidth - r.right));

    popover = document.createElement("div");
    Object.assign(popover.style, {
      position: "fixed",
      top: `${top}px`,
      right: `${right}px`,
      width: "340px",
      padding: "14px",
      borderRadius: "18px",
      background: "rgba(255,255,255,0.96)",
      boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
      zIndex: 999999,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      fontSize: "13px",
      color: "#1f2328",
      border: "1px solid rgba(0,0,0,0.10)"
    });

    popover.innerHTML = `
      <div style="font-weight:750;margin-bottom:10px;">Dashboard theme</div>

      <section style="padding:10px;border-radius:14px;border:1px solid rgba(0,0,0,0.08); margin-bottom:12px;">
        <div style="font-weight:650;margin-bottom:8px;">Background</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <label style="opacity:.85;">Color</label>
          <input type="color" id="bgColor" value="${theme.bgColor}" style="width:56px;height:34px;border:none;background:transparent;cursor:pointer;">
        </div>
        <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <label style="opacity:.85;">Opacity</label>
          <input type="range" id="bgAlpha" min="0.15" max="1" step="0.01" value="${theme.bgAlpha}" style="width:220px;cursor:pointer;">
        </div>
      </section>

      <section style="padding:10px;border-radius:14px;border:1px solid rgba(0,0,0,0.08); margin-bottom:12px;">
        <div style="font-weight:650;margin-bottom:8px;">Smart Views</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <label style="opacity:.85;">Card radius</label>
          <input type="range" id="radius" min="0" max="40" step="1" value="${theme.radius}" style="width:220px;cursor:pointer;">
        </div>
        <label style="margin-top:10px;display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="shadow" ${theme.shadowEnabled ? "checked" : ""}>
          <span>Enable shadow</span>
        </label>
      </section>

      <section style="padding:10px;border-radius:14px;border:1px solid rgba(0,0,0,0.08); margin-bottom:12px;">
        <div style="font-weight:650;margin-bottom:8px;">Typography</div>

        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;">
          <input type="checkbox" id="fontOverride" ${theme.fontOverride ? "checked" : ""}>
          <span>Use custom font size</span>
        </label>

        <div id="fontSizeRow" style="display:flex;align-items:center;justify-content:space-between;gap:10px;${theme.fontOverride ? "" : "opacity:.40;"}">
          <label style="opacity:.85;">Font size</label>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="range" id="fontSize" min="8" max="16" step="0.25" value="${theme.fontSize}"
              style="width:180px;cursor:pointer;" ${theme.fontOverride ? "" : "disabled"}>
            <span id="fontSizeVal" style="min-width:44px;text-align:right;opacity:.85;">${Number(theme.fontSize).toFixed(2)}</span>
          </div>
        </div>
      </section>

      <section style="padding:10px;border-radius:14px;border:1px solid rgba(0,0,0,0.08); margin-bottom:12px;">
        <div style="font-weight:650;margin-bottom:8px;">Hover</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <label style="opacity:.85;">Intensity</label>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="range" id="hoverIntensity" min="0" max="1" step="0.01" value="${theme.hoverIntensity}" style="width:180px;cursor:pointer;">
            <span id="hoverVal" style="min-width:44px;text-align:right;opacity:.85;">${Math.round(theme.hoverIntensity * 100)}%</span>
          </div>
        </div>
      </section>

      <section style="padding:10px;border-radius:14px;border:1px solid rgba(0,0,0,0.08); margin-bottom:12px;">
        <div style="font-weight:650;margin-bottom:8px;">Mode</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="dark" ${theme.darkMode ? "checked" : ""}>
          <span>Dark mode</span>
        </label>
      </section>

      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button id="resetBtn" style="padding:7px 11px;border-radius:10px;border:1px solid rgba(0,0,0,0.12);background:rgba(0,0,0,0.05);cursor:pointer;">Reset</button>
        <button id="saveBtn" style="padding:7px 11px;border-radius:10px;border:1px solid rgba(0,0,0,0.12);background:#0b6cff;color:#fff;cursor:pointer;box-shadow:0 10px 22px rgba(11,108,255,0.22);">Save</button>
      </div>
    `;

    popover.addEventListener("pointerdown", (e) => e.stopPropagation());
    document.body.appendChild(popover);

    const $ = (sel) => popover.querySelector(sel);
    const bgColor = $("#bgColor");
    const bgAlpha = $("#bgAlpha");
    const radius  = $("#radius");
    const shadow  = $("#shadow");
    const dark    = $("#dark");

    const fontOverride = $("#fontOverride");
    const fontSize = $("#fontSize");
    const fontSizeVal = $("#fontSizeVal");
    const fontSizeRow = $("#fontSizeRow");

    const hoverIntensity = $("#hoverIntensity");
    const hoverVal = $("#hoverVal");

    function themeFromUI() {
      return {
        bgColor: bgColor.value,
        bgAlpha: parseFloat(bgAlpha.value),
        radius: parseInt(radius.value, 10),
        shadowEnabled: !!shadow.checked,
        darkMode: !!dark.checked,

        fontOverride: !!fontOverride.checked,
        fontSize: parseFloat(fontSize.value),
        hoverIntensity: parseFloat(hoverIntensity.value)
      };
    }

    function syncFontControls() {
      const enabled = !!fontOverride.checked;
      fontSize.disabled = !enabled;
      fontSizeRow.style.opacity = enabled ? "1" : "0.40";
    }

    function preview() {
      syncFontControls();

      fontSizeVal.textContent = Number(fontSize.value).toFixed(2);
      hoverVal.textContent = `${Math.round(parseFloat(hoverIntensity.value) * 100)}%`;

      const t = themeFromUI();
      saveTheme(t);
      applyTheme(t, "parent");
    }

    [bgColor, bgAlpha, radius, shadow, dark, fontSize, hoverIntensity, fontOverride].forEach(el => {
      el.addEventListener("input", preview);
      el.addEventListener("change", preview);
    });

    $("#saveBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = themeFromUI();
      saveTheme(t);
      applyTheme(t, "parent");
      closePopover();
    });

    $("#resetBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      saveTheme({ ...DEFAULT_THEME });
      applyTheme({ ...DEFAULT_THEME }, "parent");
      closePopover();
    });

    // initial
    syncFontControls();
    preview();

    document.addEventListener("pointerdown", onOutsidePointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  function findEditDashboardButton() {
    const buttons = Array.from(document.querySelectorAll("button.x-btn.--large"));
    for (const b of buttons) if (norm(b.textContent) === "edit dashboard") return b;
    for (const b of Array.from(document.querySelectorAll("button"))) if (norm(b.textContent) === "edit dashboard") return b;
    return null;
  }

  function ensurePaletteButton() {
    if (document.getElementById("xtrf-palette-btn")) return;
    const editBtn = findEditDashboardButton();
    if (!editBtn) return;

    const paletteBtn = editBtn.cloneNode(true);
    paletteBtn.id = "xtrf-palette-btn";
    paletteBtn.title = "Dashboard theme";
    paletteBtn.textContent = "🎨";

    paletteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      popover ? closePopover() : openPopover(paletteBtn);
    });

    editBtn.insertAdjacentElement("afterend", paletteBtn);
  }

  const isIframeView = location.href.includes("genericBrowseIFrame.seam");
  const context = isIframeView ? "iframe" : "parent";

  function init() {
    if (!localStorage.getItem(STORAGE_KEY)) saveTheme({ ...DEFAULT_THEME });
    const t = loadTheme();
    applyTheme(t, context);
    if (!isIframeView) ensurePaletteButton();
  }

  init();

  try {
    new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });
  } catch {}

  if (isIframeView) {
    setInterval(() => {
      init();
      fixWhitesDarkOnly();
    }, 700);
  }
})();
