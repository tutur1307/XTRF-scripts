// ==UserScript==
// @name         XTRF – Jobs overdue highlighter [OK]
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Highlights overdue jobs in the "Jobs due today and earlier" Smart View (no viewId dependency)
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/genericBrowseIFrame.seam*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================
     CONFIGURATION
     ========================================================= */

  // Smart View (widget) title (must match the widget header text)
  const TARGET_VIEW_TITLE = "Jobs due today and earlier";

  // Column headers to locate
  const DEADLINE_HEADER_TEXT = "Deadline";
  const STATUS_HEADER_TEXT = "Job Status";

  // Statuses we want to monitor for overdue deadlines
  const WATCHED_STATUSES = [
    "Started",
    "Open",
    "Accepted",
    "Offers Sent / Requested"
  ];

  // Overdue styling
  const OVERDUE_BG_COLOR = "#ffcccc";
  const OVERDUE_TEXT_COLOR = "#990000";

  // Rescan interval (XTRF can re-render/virtualize content)
  const RESCAN_INTERVAL_MS = 5000;

  /* =========================================================
     HELPERS
     ========================================================= */

  function normalize(text) {
    return (text || "")
      .replace(/\u00A0/g, " ") // non-breaking spaces
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  // Parse a deadline like "11/12/2025 09:15 CET"
  // NOTE: This intentionally ignores the timezone suffix and interprets the date as local time.
  function parseDeadline(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return null;

    const m = trimmed.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (!m) return null;

    const [, dd, MM, yyyy, hh, mm] = m;
    const date = new Date(
      Number(yyyy),
      Number(MM) - 1,
      Number(dd),
      Number(hh),
      Number(mm)
    );

    return isNaN(date.getTime()) ? null : date;
  }

  function isWatchedStatus(statusText) {
    const s = normalize(statusText);
    return WATCHED_STATUSES.some(w => s.includes(normalize(w)));
  }

  function findTargetHeading() {
    const headings = document.querySelectorAll("h2.x-card__header__heading");
    return Array.from(headings).find(h2 => normalize(h2.textContent) === normalize(TARGET_VIEW_TITLE)) || null;
  }

  // Find the first <table> located between the target <h2> and the next widget <h2> in DOM order.
  function findTableByHeadingRange() {
    const h2 = findTargetHeading();
    if (!h2) return null;

    const headings = Array.from(document.querySelectorAll("h2.x-card__header__heading"));
    const index = headings.indexOf(h2);
    const nextHeading = headings[index + 1] || null;

    const range = document.createRange();
    try {
      range.setStartAfter(h2);
      if (nextHeading) range.setEndBefore(nextHeading);
      else range.setEndAfter(document.body.lastChild || document.body);
    } catch {
      return null;
    }

    const tables = Array.from(document.querySelectorAll("table"));
    for (const table of tables) {
      try {
        if (range.intersectsNode(table)) return table;
      } catch {}
    }

    return null;
  }

  // Check if a table looks like the jobs table we want (has Deadline + Job Status headers + tbody)
  function isJobsTable(table) {
    if (!table) return false;

    const headerRow = table.querySelector("thead tr");
    const tbody = table.querySelector("tbody");
    if (!headerRow || !tbody) return false;

    const headers = Array.from(headerRow.querySelectorAll("th, td")).map(th => normalize(th.textContent));
    const hasDeadline = headers.some(t => t.includes(normalize(DEADLINE_HEADER_TEXT)));
    const hasStatus = headers.some(t => t.includes(normalize(STATUS_HEADER_TEXT)));

    return hasDeadline && hasStatus;
  }

  // Locate column indices for Deadline and Job Status
  function getColumnIndices(table) {
    const headerRow = table.querySelector("thead tr");
    if (!headerRow) return { deadlineIndex: -1, statusIndex: -1 };

    const ths = Array.from(headerRow.querySelectorAll("th, td"));
    let deadlineIndex = -1;
    let statusIndex = -1;

    ths.forEach((th, idx) => {
      const txt = normalize(th.textContent);
      if (txt.includes(normalize(DEADLINE_HEADER_TEXT))) deadlineIndex = idx;
      if (txt.includes(normalize(STATUS_HEADER_TEXT))) statusIndex = idx;
    });

    return { deadlineIndex, statusIndex };
  }

  function resetRowStyle(row) {
    row.style.backgroundColor = "";
    row.style.color = "";
    row.style.fontWeight = "";
  }

  function applyOverdueStyle(row) {
    row.style.backgroundColor = OVERDUE_BG_COLOR;
    row.style.color = OVERDUE_TEXT_COLOR;
    row.style.fontWeight = "bold";
  }

  /* =========================================================
     CORE LOGIC
     ========================================================= */

  // Cache the detected jobs table once it successfully matches
  let cachedJobsTable = null;

  function highlightOverdueJobsInTable(table) {
    if (!isJobsTable(table)) return false;

    const { deadlineIndex, statusIndex } = getColumnIndices(table);
    if (deadlineIndex === -1 || statusIndex === -1) return false;

    const now = new Date();
    const rows = table.querySelectorAll("tbody tr");
    if (!rows.length) return false;

    let matchedAny = false;

    rows.forEach(row => {
      const cells = row.querySelectorAll("td");
      if (!cells.length) return;

      const deadlineCell = cells[deadlineIndex];
      const statusCell = cells[statusIndex];
      if (!deadlineCell || !statusCell) return;

      resetRowStyle(row);

      const statusText = statusCell.innerText || statusCell.textContent || "";
      if (!isWatchedStatus(statusText)) return;

      const deadlineText = deadlineCell.innerText || deadlineCell.textContent || "";
      const deadlineDate = parseDeadline(deadlineText);
      if (!deadlineDate) return;

      matchedAny = true;

      if (deadlineDate < now) {
        applyOverdueStyle(row);
      }
    });

    return matchedAny;
  }

  function run() {
    // 0) Use cached table if still valid
    if (cachedJobsTable && document.contains(cachedJobsTable)) {
      if (highlightOverdueJobsInTable(cachedJobsTable)) return;
    } else {
      cachedJobsTable = null;
    }

    // 1) Try the table logically associated with the widget title
    const rangeTable = findTableByHeadingRange();
    if (rangeTable && highlightOverdueJobsInTable(rangeTable)) {
      cachedJobsTable = rangeTable;
      return;
    }

    // 2) Fallback: scan all tables (XTRF can re-render/virtualize DOM)
    const tables = Array.from(document.querySelectorAll("table"));
    for (const t of tables) {
      if (t === rangeTable) continue;
      if (highlightOverdueJobsInTable(t)) {
        cachedJobsTable = t;
        return;
      }
    }
  }

  /* =========================================================
     EXECUTION & OBSERVERS
     ========================================================= */

  // Initial run
  run();

  // Periodic rescan
  setInterval(run, RESCAN_INTERVAL_MS);

  // Also react to DOM changes (Angular/XTRF re-renders)
  const observer = new MutationObserver(() => run());
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

})();
