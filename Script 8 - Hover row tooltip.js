// ==UserScript==
// @name         Script 8 – Hover Row Tooltip
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Hover a row -> after 1500ms shows popup with ALL non-empty row columns (no key section). Dedupes identical values. Works across views/iframes.
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/dashboard.seam*
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/genericBrowseIFrame.seam*
// @match        https://translations.myelan.net/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  /* ===================== CONFIG ===================== */

  const HOVER_DELAY_MS = 750;
  const MAX_WIDTH_PX = 520;
  const OFFSET_PX = 14;

  // Safety for huge tables
  const MAX_ITEMS_SHOWN = 120;

  // Behavior toggles
  const HIDE_EMPTY_VALUES = true;      // keep popup readable
  const DEDUPE_IDENTICAL_VALUES = true; // if two cols have same value, show once

  /* ===================== UTILS ===================== */

  const norm = (s) => (s ?? "").toString().replace(/\s+/g, " ").trim().toLowerCase();

  function escapeHtml(str) {
    return (str ?? "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isElementVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function getTableFromRow(row) {
    return row?.closest("table");
  }

  function getHeaderCells(table) {
    if (!table) return [];
    const theadRows = table.querySelectorAll("thead tr");
    if (theadRows.length) {
      const last = theadRows[theadRows.length - 1];
      const ths = last.querySelectorAll("th");
      if (ths.length) return Array.from(ths);
    }
    const anyTh = table.querySelector("tr th");
    if (anyTh) return Array.from(anyTh.closest("tr").querySelectorAll("th"));
    return [];
  }

  function buildHeaderList(table) {
    const ths = getHeaderCells(table);
    return ths.map((th, idx) => ({
      idx,
      raw: (th.textContent ?? "").replace(/\s+/g, " ").trim(),
      key: norm(th.textContent),
    }));
  }

  function getCellTexts(row) {
    const tds = Array.from(row.querySelectorAll("td"));
    return tds.map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim());
  }

  function extractAllColumns(row) {
    const table = getTableFromRow(row);
    if (!table) return [];

    const headers = buildHeaderList(table);
    const cells = getCellTexts(row);

    const max = Math.max(headers.length, cells.length);
    const out = [];

    const seenValues = new Set();

    for (let i = 0; i < max; i++) {
      const label = headers[i]?.raw || `Column ${i + 1}`;
      const value = cells[i] ?? "";

      if (HIDE_EMPTY_VALUES && !value) continue;

      if (DEDUPE_IDENTICAL_VALUES) {
        const vKey = norm(value);
        if (vKey && seenValues.has(vKey)) continue;
        if (vKey) seenValues.add(vKey);
      }

      out.push({ label, value });
      if (out.length >= MAX_ITEMS_SHOWN) break;
    }

    return out;
  }

  /* ===================== POPUP UI ===================== */

  const STYLE_ID = "xtrf-hover-row-tooltip-style";
  const POPUP_ID = "xtrf-hover-row-tooltip";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const css = `
#${POPUP_ID}{
  position:fixed; z-index:2147483647;
  max-width:${MAX_WIDTH_PX}px;
  padding:10px 12px;
  border-radius:12px;
  box-shadow:0 10px 30px rgba(0,0,0,.18);
  border:1px solid rgba(0,0,0,.08);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
  font-size:12.5px; line-height:1.25;
  display:none;
  user-select:text;
}
#${POPUP_ID}.xtrf-light{ background:rgba(255,255,255,.92); color:rgba(0,0,0,.90); }
#${POPUP_ID}.xtrf-dark{ background:rgba(20,22,26,.92); color:rgba(255,255,255,.92); border:1px solid rgba(255,255,255,.10); }

#${POPUP_ID} .xtrf-title{ font-weight:700; margin-bottom:6px; font-size:13px; }
#${POPUP_ID} .xtrf-row{
  display:grid;
  grid-template-columns: 160px 1fr;
  gap:10px;
  padding:3px 0;
}
#${POPUP_ID} .xtrf-label{
  opacity:.70;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
#${POPUP_ID} .xtrf-value{ overflow-wrap:anywhere; }
#${POPUP_ID} .xtrf-hint{ margin-top:8px; opacity:.55; font-size:11.5px; }
`;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensurePopup() {
    ensureStyles();
    let el = document.getElementById(POPUP_ID);
    if (el) return el;
    el = document.createElement("div");
    el.id = POPUP_ID;
    el.className = "xtrf-light";
    document.body.appendChild(el);
    return el;
  }

  function detectDarkMode() {
    const html = document.documentElement;
    const body = document.body;
    return (
      html.classList.contains("dark") ||
      body.classList.contains("dark") ||
      html.getAttribute("data-theme") === "dark" ||
      body.getAttribute("data-theme") === "dark"
    );
  }

  function clampToViewport(x, y, popupEl) {
    const pad = 8;
    const r = popupEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let nx = x, ny = y;

    if (nx + r.width + pad > vw) nx = vw - r.width - pad;
    if (ny + r.height + pad > vh) ny = vh - r.height - pad;
    if (nx < pad) nx = pad;
    if (ny < pad) ny = pad;

    return { x: nx, y: ny };
  }

  function renderPopup(items, { truncated }) {
    const popup = ensurePopup();
    const isDark = detectDarkMode();
    popup.classList.toggle("xtrf-dark", isDark);
    popup.classList.toggle("xtrf-light", !isDark);

    const rowsHtml = items
      .map(
        (it) => `
        <div class="xtrf-row">
          <div class="xtrf-label">${escapeHtml(it.label)}</div>
          <div class="xtrf-value">${escapeHtml(it.value)}</div>
        </div>`
      )
      .join("");

    popup.innerHTML = `
      <div class="xtrf-title">Overview</div>
      ${rowsHtml || `<div class="xtrf-row"><div class="xtrf-label">Info</div><div class="xtrf-value">No non-empty cells found.</div></div>`}
      <div class="xtrf-hint">
        ${truncated ? ` (Truncated to ${MAX_ITEMS_SHOWN} items)` : ""}
      </div>
    `;
  }

  function showPopupAt(x, y) {
    const popup = ensurePopup();
    popup.style.display = "block";
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    const clamped = clampToViewport(x, y, popup);
    popup.style.left = `${clamped.x}px`;
    popup.style.top = `${clamped.y}px`;
  }

  function hidePopup() {
    const popup = document.getElementById(POPUP_ID);
    if (popup) popup.style.display = "none";
  }

  /* ===================== HOVER LOGIC ===================== */

  let hoverTimer = null;
  let currentRow = null;
  let lastMouse = { x: 0, y: 0 };

  function clearHoverTimer() {
    if (hoverTimer) {
      window.clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  function isDataRow(tr) {
    if (!tr) return false;
    if (!tr.querySelector("td")) return false;
    if (!isElementVisible(tr)) return false;
    return true;
  }

  function startHover(row) {
    if (!isDataRow(row)) return;

    clearHoverTimer();
    currentRow = row;

    hoverTimer = window.setTimeout(() => {
      if (!currentRow || currentRow !== row) return;

      const items = extractAllColumns(row);
      const truncated = items.length >= MAX_ITEMS_SHOWN;

      renderPopup(items, { truncated });
      showPopupAt(lastMouse.x + OFFSET_PX, lastMouse.y + OFFSET_PX);
    }, HOVER_DELAY_MS);
  }

  function stopHover(row) {
    if (row && currentRow !== row) return;
    clearHoverTimer();
    currentRow = null;
    hidePopup();
  }

  function onPointerOver(e) {
    const tr = e.target?.closest?.("tr");
    if (!tr) return;
    const related = e.relatedTarget;
    if (related && tr.contains(related)) return;
    startHover(tr);
  }

  function onPointerOut(e) {
    const tr = e.target?.closest?.("tr");
    if (!tr) return;
    const related = e.relatedTarget;
    if (related && tr.contains(related)) return;
    stopHover(tr);
  }

  function onMouseMove(e) {
    lastMouse = { x: e.clientX, y: e.clientY };
    const popup = document.getElementById(POPUP_ID);
    if (popup && popup.style.display === "block") {
      const clamped = clampToViewport(lastMouse.x + OFFSET_PX, lastMouse.y + OFFSET_PX, popup);
      popup.style.left = `${clamped.x}px`;
      popup.style.top = `${clamped.y}px`;
    }
  }

  function onAnyScrollOrKey() {
    stopHover();
  }

  function init() {
    ensurePopup();

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("mousemove", onMouseMove, { passive: true });

    window.addEventListener("scroll", onAnyScrollOrKey, true);
    window.addEventListener("keydown", onAnyScrollOrKey, true);
    window.addEventListener("blur", onAnyScrollOrKey, true);

    const mo = new MutationObserver(() => ensurePopup());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  init();
})();
