// ==UserScript==
// @name         Script 6 - Smart Views counters
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Adds (N) to specific Smart View titles (hidden when N=0) + adds Total Agreed sum on the right for started today + Requested/Open shows Requested (x) / Open (y)
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/genericBrowseIFrame.seam*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  /* ===================== CONFIG ===================== */

  // Simple (N) widgets
  const COUNT_WIDGET_TITLES = new Set([
    "Projects due today",
    "Requests pending",
    "Projects still to be started",
    "Jobs due today and earlier",
    "Projects ready for finalization", // <- added
  ]);

  // Special widget: Requested / Open (split by Job Status)
  const REQUESTED_OPEN_TITLE = "Requested / Open";
  const JOB_STATUS_HEADER_TEXT = "Job Status";

  // Started today total sum on the right
  const STARTED_TODAY_TITLE_KEYWORDS = ["started today"]; // robust match (Projects/Projets)
  const SUM_HEADER_TEXT = "Total Agreed";

  // CSS classes used for injected elements (unique & stable)
  const COUNT_SPAN_CLASS = "xtrf-title-rowcount";
  const SUM_SPAN_CLASS = "xtrf-title-totalagreed-sum";
  const RO_REQ_CLASS = "xtrf-ro-requested-count";
  const RO_OPEN_CLASS = "xtrf-ro-open-count";

  /* ===================== HELPERS ===================== */

  function normalize(s) {
    return (s || "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeLower(s) {
    return normalize(s).toLowerCase();
  }

  function titleMatchesOneOf(headingText, titlesSet) {
    const txt = normalize(headingText);
    for (const t of titlesSet) {
      if (txt.includes(t)) return t;
    }
    return null;
  }

  function titleContains(headingText, needle) {
    return normalize(headingText).includes(needle);
  }

  function titleMatchesKeywords(headingText, keywords) {
    const txt = normalizeLower(headingText);
    return keywords.every(k => txt.includes(normalizeLower(k)));
  }

  function findWidgetHeadingFromIframe() {
    const iframeEl = window.frameElement;
    if (!iframeEl) return null;

    const container =
      iframeEl.closest?.(
        ".xdb-dashboard__widget, .x-card, .xlt-card, .card, .widget, .x-card__container, .panel"
      ) || iframeEl.parentElement;

    if (!container) return null;

    const headings = Array.from(
      container.querySelectorAll(
        "h1.x-card__header__heading, h2.x-card__header__heading, h3.x-card__header__heading, .x-card__header__heading, h1, h2, h3"
      )
    );

    return headings[0] || null;
  }

  function getPrimaryTable() {
    return document.querySelector("table");
  }

  function getDataRows(table) {
    if (!table) return [];
    return Array.from(table.querySelectorAll("tbody tr"))
      .filter(tr => tr.querySelectorAll("td").length > 0);
  }

  function getRowCount(table) {
    return getDataRows(table).length;
  }

  function ensureCountSpan(heading) {
    let span = heading.querySelector(`.${COUNT_SPAN_CLASS}`);
    if (!span) {
      span = heading.ownerDocument.createElement("span");
      span.className = COUNT_SPAN_CLASS;
      span.style.marginLeft = "8px";
      span.style.fontWeight = "700";
      span.style.opacity = "0.85";

      // Keep near title
      if (heading.firstChild) {
        heading.insertBefore(span, heading.firstChild.nextSibling);
      } else {
        heading.appendChild(span);
      }
    }
    return span;
  }

  function ensureSumSpanRight(heading) {
    // Flex so we can push sum to far right
    heading.style.display = "flex";
    heading.style.alignItems = "center";
    heading.style.gap = "10px";

    let span = heading.querySelector(`.${SUM_SPAN_CLASS}`);
    if (!span) {
      span = heading.ownerDocument.createElement("span");
      span.className = SUM_SPAN_CLASS;
      span.style.marginLeft = "auto";
      span.style.fontWeight = "700";
      span.style.fontSize = "0.95em";
      span.style.opacity = "0.9";
      heading.appendChild(span);
    }
    return span;
  }

  function getColumnIndexByHeader(table, headerText) {
    const headerRow = table?.querySelector("thead tr");
    if (!headerRow) return -1;

    const headers = Array.from(headerRow.querySelectorAll("th, td"));
    const wanted = normalizeLower(headerText);

    for (let i = 0; i < headers.length; i++) {
      if (normalizeLower(headers[i].textContent).includes(wanted)) return i;
    }
    return -1;
  }

  // XTRF quirk (your instance): "€ 40,220" should be interpreted as 40.220 (=> 40,22 € displayed)
  function parseXtrfMoney(text) {
    if (!text) return 0;

    let s = String(text)
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, "")
      .replace(/[€]/g, "")
      .trim();

    if (!s) return 0;

    const hasComma = s.includes(",");
    const hasDot = s.includes(".");

    if (hasComma && hasDot) {
      // 1.234,567 -> 1234.567
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else if (hasComma && !hasDot) {
      // 40,220 -> 40.220
      s = s.replace(/,/g, ".");
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function formatEUR_BE(value) {
    const amount = Number.isFinite(value) ? value : 0;
    const formatted = amount.toLocaleString("fr-BE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `€${formatted}`;
  }

  /* ===================== REQUESTED / OPEN INLINE SPLIT ===================== */

  function computeRequestedOpenSplit(table) {
    const rows = getDataRows(table);
    if (!rows.length) return { open: 0, requested: 0 };

    const statusCol = getColumnIndexByHeader(table, JOB_STATUS_HEADER_TEXT);
    if (statusCol < 0) return { open: 0, requested: 0 };

    let open = 0;
    let requested = 0;

    for (const tr of rows) {
      const cells = Array.from(tr.querySelectorAll("td,th"));
      const cell = cells[statusCol];
      if (!cell) continue;

      const status = normalizeLower(cell.textContent);

      // Open
      if (status === "open" || status.includes("open")) {
        open++;
        continue;
      }

      // Offers sent / requested (often truncated to "Offers ...")
      // We count these as "requested" per your wording.
      if (status.startsWith("offers") || status.includes("offers sent") || status.includes("requested")) {
        requested++;
        continue;
      }
    }

    return { open, requested };
  }

  function ensureInlineSplitInHeading(heading) {
    // Remove the old "(...)" counter for this widget if present (we don't want it anymore)
    const oldCount = heading.querySelector(`.${COUNT_SPAN_CLASS}`);
    if (oldCount) {
      oldCount.textContent = "";
      oldCount.style.display = "none";
    }

    // Find a text node containing "Requested / Open" so we can inject counts after each label
    const doc = heading.ownerDocument;

    // If we already injected before, just return the spans
    let reqSpan = heading.querySelector(`.${RO_REQ_CLASS}`);
    let openSpan = heading.querySelector(`.${RO_OPEN_CLASS}`);
    if (reqSpan && openSpan) return { reqSpan, openSpan };

    function makeSpan(cls) {
      const s = doc.createElement("span");
      s.className = cls;
      s.style.marginLeft = "6px";
      s.style.fontWeight = "700";
      s.style.opacity = "0.85";
      return s;
    }

    // Create spans
    reqSpan = makeSpan(RO_REQ_CLASS);
    openSpan = makeSpan(RO_OPEN_CLASS);

    // Try to split a *text node* that contains the title
    const walker = doc.createTreeWalker(heading, NodeFilter.SHOW_TEXT, null);
    let textNode = null;

    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (normalize(n.nodeValue).includes(REQUESTED_OPEN_TITLE)) {
        textNode = n;
        break;
      }
    }

    if (textNode) {
      // Replace "Requested / Open" with:
      // "Requested " + reqSpan + " / Open " + openSpan
      const before = "Requested ";
      const middle = " / Open ";
      const frag = doc.createDocumentFragment();
      frag.appendChild(doc.createTextNode(before));
      frag.appendChild(reqSpan);
      frag.appendChild(doc.createTextNode(middle));
      frag.appendChild(openSpan);

      textNode.parentNode.replaceChild(frag, textNode);
    } else {
      // Fallback: append at the start if we couldn't find the title text node
      heading.insertBefore(doc.createTextNode("Requested "), heading.firstChild || null);
      heading.insertBefore(reqSpan, heading.firstChild?.nextSibling || null);
      heading.insertBefore(doc.createTextNode(" / Open "), heading.firstChild?.nextSibling || null);
      heading.insertBefore(openSpan, heading.firstChild?.nextSibling || null);
    }

    return { reqSpan, openSpan };
  }

  function updateRequestedOpenInline(heading, table) {
    const { open, requested } = computeRequestedOpenSplit(table);
    const total = open + requested;

    const { reqSpan, openSpan } = ensureInlineSplitInHeading(heading);

    if (total <= 0) {
      reqSpan.textContent = "";
      openSpan.textContent = "";
      reqSpan.style.display = "none";
      openSpan.style.display = "none";
      return;
    }

    reqSpan.style.display = "";
    openSpan.style.display = "";

    reqSpan.textContent = `(${requested})`;
    openSpan.textContent = `(${open})`;
  }

  /* ===================== UPDATE ===================== */

  function updateWidgetTitle() {
    const heading = findWidgetHeadingFromIframe();
    if (!heading) return;

    const table = getPrimaryTable();

    // 1) Requested / Open inline split
    if (titleContains(heading.textContent, REQUESTED_OPEN_TITLE)) {
      updateRequestedOpenInline(heading, table);
    }

    // 2) Simple (N) counters
    const matchedCountTitle = titleMatchesOneOf(heading.textContent, COUNT_WIDGET_TITLES);
    if (matchedCountTitle) {
      const countSpan = ensureCountSpan(heading);
      const n = getRowCount(table);

      if (n <= 0) {
        countSpan.textContent = "";
        countSpan.style.display = "none";
      } else {
        countSpan.style.display = "";
        countSpan.textContent = `(${n})`;
      }
    }

    // 3) Started today sum on the right
    if (titleMatchesKeywords(heading.textContent, STARTED_TODAY_TITLE_KEYWORDS)) {
      const sumSpan = ensureSumSpanRight(heading);
      const n = getRowCount(table);

      if (!table || n <= 0) {
        sumSpan.textContent = "";
        sumSpan.style.display = "none";
        return;
      }

      const colIdx = getColumnIndexByHeader(table, SUM_HEADER_TEXT);
      if (colIdx < 0) {
        sumSpan.textContent = "";
        sumSpan.style.display = "none";
        return;
      }

      let sum = 0;
      for (const tr of getDataRows(table)) {
        const cells = Array.from(tr.querySelectorAll("td,th"));
        const cell = cells[colIdx];
        if (!cell) continue;
        sum += parseXtrfMoney(cell.textContent);
      }

      sumSpan.style.display = "";
      sumSpan.textContent = formatEUR_BE(sum);
      sumSpan.title = `Sum of "${SUM_HEADER_TEXT}" (visible rows)`;
    }
  }

  /* ===================== RUN ===================== */

  updateWidgetTitle();

  const observer = new MutationObserver(() => {
    try { updateWidgetTitle(); } catch (e) {}
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
