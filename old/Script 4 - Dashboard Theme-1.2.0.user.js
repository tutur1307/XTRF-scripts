// ==UserScript==
// @name         Script 4 - Dashboard Theme
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Change dashboard background + round Smart Views with a palette button (company-deployable).
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/dashboard.seam*
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/dashboard.seam*#!/detail/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  /* =========================================================
     CONFIG
     ========================================================= */

  const STORAGE_KEY = "xtrf_dashboard_theme_v1";

  const DEFAULT_THEME = {
    color: "#eef2f7",
    alpha: 1.0
  };

  const CARD_RADIUS_PX = 22;
  const CARD_SHADOW = "0 14px 36px rgba(0,0,0,0.10)";

  const PALETTE_BUTTON_POS = { top: 74, right: 20 };

  /* =========================================================
     UTILS
     ========================================================= */

  function loadTheme() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return { ...DEFAULT_THEME, ...(saved && typeof saved === "object" ? saved : {}) };
    } catch {
      return { ...DEFAULT_THEME };
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    } catch {}
  }

  function hexToRGBA(hex, alpha) {
    const h = (hex || "#000000").replace("#", "").trim();
    const full = h.length === 3
      ? h.split("").map(c => c + c).join("")
      : h.padEnd(6, "0").slice(0, 6);

    const bigint = parseInt(full, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;

    const a = Math.max(0, Math.min(1, typeof alpha === "number" ? alpha : 1));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function injectCSS(id, css) {
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* =========================================================
     APPLY THEME
     ========================================================= */

  function applyTheme(theme) {
    const bg = hexToRGBA(theme.color, theme.alpha);

    document.documentElement.style.setProperty("--xtrf-bg", bg);
    document.documentElement.style.setProperty("--xtrf-radius", `${CARD_RADIUS_PX}px`);
    document.documentElement.style.setProperty("--xtrf-shadow", CARD_SHADOW);

    injectCSS("xtrf-dashboard-theme-css", `
      /* Real dashboard canvas (your inspected element) */
      .x-grid {
        background: var(--xtrf-bg) !important;
      }

      /* Safety: prevent white bleed from children wrappers */
      .x-grid > * {
        background-color: transparent;
      }

      /* Rounded Smart Views / widgets */
      .x-card, .xlt-card, .xdb-dashboard__widget, .card, .panel {
        border-radius: var(--xtrf-radius) !important;
        box-shadow: var(--xtrf-shadow) !important;
        overflow: hidden !important;
      }

      .x-card__header, .xlt-card__header, .card-header {
        border-top-left-radius: var(--xtrf-radius) !important;
        border-top-right-radius: var(--xtrf-radius) !important;
      }

      /* Widget content remains readable */
      .x-card__content, .xlt-card__content, .card-body {
        background: rgba(255,255,255,0.90) !important;
      }
    `);
  }

  /* =========================================================
     PALETTE UI
     ========================================================= */

  let popover = null;

  function closePopover() {
    if (!popover) return;
    popover.remove();
    popover = null;
    document.removeEventListener("pointerdown", onGlobalPointerDown, true);
    document.removeEventListener("keydown", onGlobalKeyDown, true);
  }

  function onGlobalPointerDown(ev) {
    const btn = document.getElementById("xtrf-palette-btn");
    if (!popover) return;

    // Click inside popover or on the palette button => keep open
    if (popover.contains(ev.target)) return;
    if (btn && (btn === ev.target || btn.contains(ev.target))) return;

    closePopover();
  }

  function onGlobalKeyDown(ev) {
    if (ev.key === "Escape") closePopover();
  }

  function createPaletteButton() {
    if (document.getElementById("xtrf-palette-btn")) return;

    const btn = document.createElement("button");
    btn.id = "xtrf-palette-btn";
    btn.type = "button";
    btn.textContent = "🎨";
    btn.title = "Dashboard theme";

    Object.assign(btn.style, {
      position: "fixed",
      top: `${PALETTE_BUTTON_POS.top}px`,
      right: `${PALETTE_BUTTON_POS.right}px`,
      width: "44px",
      height: "44px",
      borderRadius: "14px",
      border: "1px solid rgba(0,0,0,0.12)",
      background: "rgba(255,255,255,0.9)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      boxShadow: "0 10px 24px rgba(0,0,0,0.14)",
      cursor: "pointer",
      fontSize: "18px",
      lineHeight: "44px",
      textAlign: "center",
      zIndex: 999999
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      popover ? closePopover() : openPopover(btn);
    });

    document.body.appendChild(btn);
  }

  function openPopover(anchor) {
    const theme = loadTheme();

    popover = document.createElement("div");
    popover.id = "xtrf-palette-popover";

    Object.assign(popover.style, {
      position: "fixed",
      top: `${PALETTE_BUTTON_POS.top + 54}px`,
      right: `${PALETTE_BUTTON_POS.right}px`,
      width: "260px",
      padding: "14px",
      borderRadius: "18px",
      background: "rgba(255,255,255,0.95)",
      boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
      zIndex: 999999,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      fontSize: "13px",
      color: "#1f2328",
      border: "1px solid rgba(0,0,0,0.10)"
    });

    popover.innerHTML = `
      <div style="font-weight:750;margin-bottom:10px;">Dashboard theme</div>

      <div style="opacity:.85;margin-bottom:4px;">Background color</div>
      <input type="color" id="xtrf-color" value="${theme.color}"
        style="width:100%;height:36px;border:none;margin:6px 0 12px;cursor:pointer;background:transparent;">

      <div style="opacity:.85;margin-bottom:6px;">Opacity</div>
      <input type="range" id="xtrf-alpha" min="0.2" max="1" step="0.05"
        value="${theme.alpha}" style="width:100%;cursor:pointer;">

      <div style="margin-top:14px;text-align:right;display:flex;justify-content:flex-end;gap:8px;">
        <button id="xtrf-reset"
          style="padding:6px 10px;border-radius:10px;border:1px solid rgba(0,0,0,0.12);background:rgba(0,0,0,0.05);cursor:pointer;">
          Reset
        </button>
        <button id="xtrf-save"
          style="padding:6px 10px;border-radius:10px;border:1px solid rgba(0,0,0,0.12);background:#0b6cff;color:#fff;cursor:pointer;box-shadow:0 10px 22px rgba(11,108,255,0.22);">
          Save
        </button>
      </div>
    `;

    // Prevent clicks inside popover from being treated as "outside"
    popover.addEventListener("pointerdown", (e) => e.stopPropagation());

    document.body.appendChild(popover);

    const colorEl = popover.querySelector("#xtrf-color");
    const alphaEl = popover.querySelector("#xtrf-alpha");

    // Live preview while user tweaks
    const preview = () => {
      applyTheme({
        color: colorEl.value,
        alpha: parseFloat(alphaEl.value)
      });
    };
    colorEl.addEventListener("input", preview);
    alphaEl.addEventListener("input", preview);

    popover.querySelector("#xtrf-save").addEventListener("click", (e) => {
      e.stopPropagation();
      const newTheme = {
        color: colorEl.value,
        alpha: parseFloat(alphaEl.value)
      };
      saveTheme(newTheme);
      applyTheme(newTheme);
      closePopover();
    });

    popover.querySelector("#xtrf-reset").addEventListener("click", (e) => {
      e.stopPropagation();
      saveTheme(DEFAULT_THEME);
      applyTheme(DEFAULT_THEME);
      closePopover();
    });

    // Close only when clicking outside, or pressing ESC
    document.addEventListener("pointerdown", onGlobalPointerDown, true);
    document.addEventListener("keydown", onGlobalKeyDown, true);
  }

  /* =========================================================
     INIT + RESILIENCE
     ========================================================= */

  function init() {
    // Scope safeguard: only run on dashboard pages
    if (!location.href.includes("/xtrf/faces/dashboard2/dashboard.seam")) return;

    applyTheme(loadTheme());
    createPaletteButton();
  }

  init();

  // XTRF can rerender parts of the DOM: keep the UI alive
  try {
    new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });
  } catch {}

})();
