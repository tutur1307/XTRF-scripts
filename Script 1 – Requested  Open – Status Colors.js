// ==UserScript==
// @name         XTRF – Requested / Open status colors [OK]
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Colorize "Open" and "Offers sent / requested"
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/genericBrowseIFrame.seam*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================
     CONFIGURATION
     ========================================================= */

  const TARGET_VIEW_TITLE = "Requested / Open";

  // Required headers to uniquely identify the correct table for this widget
  const REQUIRED_HEADERS = ["Job Status", "Deadline"];

  // We colorize only the Job Status cells (not the whole row)
  const STATUS_HEADER_TEXT = "Job Status";

  const STATUS_COLORS = {
    "open": "#e97f7f",
    "offers sent / requested": "#8A8AFF"
  };

  const RESCAN_INTERVAL_MS = 1000;

  /* =========================================================
     HELPERS
     ========================================================= */

  function normalize(text) {
    return (text || "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function findTargetHeading() {
    const headings = document.querySelectorAll("h2.x-card__header__heading");
    return Array.from(headings).find(h2 => normalize(h2.textContent) === normalize(TARGET_VIEW_TITLE)) || null;
  }

  function findTablesByHeadingRange() {
    const h2 = findTargetHeading();
    if (!h2) return [];

    const headings = Array.from(document.querySelectorAll("h2.x-card__header__heading"));
    const index = headings.indexOf(h2);
    const nextHeading = headings[index + 1] || null;

    const range = document.createRange();
    try {
      range.setStartAfter(h2);
      if (nextHeading) range.setEndBefore(nextHeading);
      else range.setEndAfter(document.body.lastChild || document.body);
    } catch {
      return [];
    }

    const tables = Array.from(document.querySelectorAll("table"));
    const inRange = [];
    for (const table of tables) {
      try {
        if (range.intersectsNode(table)) inRange.push(table);
      } catch {}
    }
    return inRange;
  }

  function tableHasRequiredHeaders(table) {
    const headerRow = table?.querySelector("thead tr");
    const tbody = table?.querySelector("tbody");
    if (!headerRow || !tbody) return false;

    const headers = Array.from(headerRow.querySelectorAll("th, td"))
      .map(th => normalize(th.textContent));

    return REQUIRED_HEADERS.every(req =>
      headers.some(h => h.includes(normalize(req)))
    );
  }

  function getColumnIndex(table, headerText) {
    const headerRow = table.querySelector("thead tr");
    if (!headerRow) return -1;

    const headers = Array.from(headerRow.querySelectorAll("th, td"));
    for (let i = 0; i < headers.length; i++) {
      if (normalize(headers[i].textContent).includes(normalize(headerText))) return i;
    }
    return -1;
  }

  function styleCell(cell, color) {
    cell.style.backgroundColor = color;
    cell.style.color = "white";
    cell.style.fontWeight = "bold";
    cell.style.textAlign = "center";
  }

  /* =========================================================
     CORE LOGIC
     ========================================================= */

  let cachedTable = null;

  function run() {
    // 1) Use cached table if still valid
    if (cachedTable && document.contains(cachedTable) && tableHasRequiredHeaders(cachedTable)) {
      // ok
    } else {
      cachedTable = null;

      // 2) Prefer tables that are in the widget's DOM range
      const rangeTables = findTablesByHeadingRange();
      cachedTable = rangeTables.find(tableHasRequiredHeaders) || null;

      // 3) Fallback: scan all tables, but ONLY accept those that match REQUIRED_HEADERS
      if (!cachedTable) {
        const allTables = Array.from(document.querySelectorAll("table"));
        cachedTable = allTables.find(tableHasRequiredHeaders) || null;
      }
    }

    if (!cachedTable) return;

    const statusCol = getColumnIndex(cachedTable, STATUS_HEADER_TEXT);
    if (statusCol < 0) return;

    const rows = cachedTable.querySelectorAll("tbody tr");
    if (!rows.length) return;

    rows.forEach(row => {
      const tds = row.querySelectorAll("td");
      if (!tds.length) return;

      const cell = tds[statusCol];
      if (!cell) return;

      const text = normalize(cell.innerText || cell.textContent);

      // Reset (idempotent)
      cell.style.backgroundColor = "";
      cell.style.color = "";
      cell.style.fontWeight = "";
      cell.style.textAlign = "";

      const color = STATUS_COLORS[text];
      if (color) styleCell(cell, color);
    });
  }

  /* =========================================================
     EXECUTION & OBSERVERS
     ========================================================= */

  run();
  setInterval(run, RESCAN_INTERVAL_MS);

  const observer = new MutationObserver(() => run());
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
})();
