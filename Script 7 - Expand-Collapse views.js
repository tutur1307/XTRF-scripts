// ==UserScript==
// @name         Script 7 - Expand-Collapse views
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Collapse/expand Smart Views by clicking title (NO blank space) + top buttons near Edit Dashboard (independent)
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  /* =========================================================================
     Configuration
     ========================================================================= */

  // Selector for each Smart View widget title (header text)
  const TITLE_SELECTOR = "h2.x-card__header__heading";

  // Selector for the Smart View "card" container
  const CARD_SELECTOR  = ".x-card";

  // LocalStorage key used to persist collapsed/expanded state per Smart View
  const STORAGE_KEY = "xtrf_smartview_collapsed_v6";

  // DOM IDs for the global action buttons
  const BTN_COLLAPSE_ID = "xtrf_sv_collapse_all";
  const BTN_EXPAND_ID   = "xtrf_sv_expand_all";

  // Class injected for the per-widget chevron indicator
  const CHEVRON_CLASS   = "xtrf-collapse-chevron";

  // Class toggled on collapsed cards (used by CSS to hide content and remove blank space)
  const COLLAPSED_CLASS = "xtrf-collapsed";

  // Periodic rescan interval (dashboard is dynamic; titles/widgets can be re-rendered)
  const RESCAN_MS = 700;

  /* ----------------- utils ----------------- */

  /**
   * Normalizes text by:
   * - converting NBSP to space
   * - collapsing multiple spaces
   * - trimming edges
   */
  function normalize(s) {
    return (s || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  }

  /**
   * Builds a stable key for a Smart View title.
   * This is important because other scripts may inject counters (e.g. "(2)") or chevrons.
   *
   * Examples handled:
   * - "(2)Projects due today"      -> "Projects due today"
   * - "Projects due today (2)"     -> "Projects due today"
   * - "Requested (4) / Open (2)"   -> "Requested / Open"
   */
  function cleanTitle(raw) {
    let t = normalize(raw);
    t = t.replace(/^[▸▾]\s*/g, "").trim();
    t = t.replace(/^\(\d+\)\s*/g, "").trim();               // (2)Title
    t = t.replace(/\s*\(\d+\)\s*$/g, "").trim();            // Title (2)
    t = t.replace(/\s*\(\d+\)\s*(?=\/|$)/g, "").trim();     // Requested (4) / Open (2)
    return t;
  }

  /**
   * Loads persisted collapsed/expanded state from localStorage.
   * Returns an object: { [titleKey]: boolean }
   */
  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }

  /**
   * Persists collapsed/expanded state to localStorage.
   */
  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  /**
   * Adds a small chevron indicator at the beginning of the title.
   * This is purely visual; it helps users understand the current state.
   */
  function ensureChevron(titleEl) {
    if (titleEl.querySelector("." + CHEVRON_CLASS)) return;
    const chevron = document.createElement("span");
    chevron.className = CHEVRON_CLASS;
    chevron.textContent = "▾";
    chevron.style.display = "inline-block";
    chevron.style.marginRight = "8px";
    chevron.style.transform = "translateY(-1px)";
    chevron.style.userSelect = "none";
    titleEl.prepend(chevron);
  }

  /**
   * Applies collapsed/expanded state to a given Smart View card.
   * - Updates the chevron symbol
   * - Toggles a class on the card to let CSS fully hide content and remove spacing
   */
  function setCollapsed(cardEl, titleEl, collapsed) {
    const chevron = titleEl.querySelector("." + CHEVRON_CLASS);
    if (chevron) chevron.textContent = collapsed ? "▸" : "▾";
    cardEl.classList.toggle(COLLAPSED_CLASS, !!collapsed);
  }

  /**
   * Binds click-to-toggle behavior to a widget title.
   * Uses a data attribute to ensure the listener is only attached once.
   */
  function bindTitle(titleEl) {
    if (titleEl.dataset.xtrfCollapseBound === "1") return;
    titleEl.dataset.xtrfCollapseBound = "1";

    const card = titleEl.closest(CARD_SELECTOR);
    if (!card) return;

    // Improve UX: indicate the title is clickable
    titleEl.style.cursor = "pointer";
    titleEl.style.userSelect = "none";

    ensureChevron(titleEl);

    // Build a stable key for persistence
    const key = cleanTitle(titleEl.textContent);
    if (!key) return;

    // Apply initial state (from persistence)
    const state = loadState();
    setCollapsed(card, titleEl, state[key] === true);

    // Toggle state on click
    titleEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const cur = loadState();
      const next = !(cur[key] === true);
      cur[key] = next;
      saveState(cur);

      setCollapsed(card, titleEl, next);
    }, true);
  }

  /**
   * Scans the page and binds all titles.
   * This is called repeatedly because the dashboard can update dynamically.
   */
  function scanAndBind() {
    document.querySelectorAll(TITLE_SELECTOR).forEach(bindTitle);
  }

  /* ----------------- collapse/expand all ----------------- */

  /**
   * Collapses all Smart Views currently on the page and persists state.
   */
  function collapseAll() {
    const state = loadState();
    document.querySelectorAll(TITLE_SELECTOR).forEach(h => {
      const card = h.closest(CARD_SELECTOR);
      if (!card) return;

      ensureChevron(h);

      const key = cleanTitle(h.textContent);
      if (!key) return;

      state[key] = true;
      setCollapsed(card, h, true);
    });
    saveState(state);
  }

  /**
   * Expands all Smart Views currently on the page and persists state.
   */
  function expandAll() {
    const state = loadState();
    document.querySelectorAll(TITLE_SELECTOR).forEach(h => {
      const card = h.closest(CARD_SELECTOR);
      if (!card) return;

      ensureChevron(h);

      const key = cleanTitle(h.textContent);
      if (!key) return;

      state[key] = false;
      setCollapsed(card, h, false);
    });
    saveState(state);
  }

  /* ----------------- TOP BUTTONS (independent) ----------------- */

  /**
   * Finds the "Edit Dashboard" button in the top toolbar.
   * This acts as an anchor to locate the container holding the toolbar buttons.
   */
  function findEditDashboardButton() {
    return Array.from(document.querySelectorAll("button, a")).find(el =>
      normalize(el.textContent).toLowerCase() === "edit dashboard"
    ) || null;
  }

  /**
   * Returns the container that holds the "Edit Dashboard" button plus the other
   * small toolbar buttons (palette/refresh/clock/etc.).
   */
  function findTopButtonsContainer() {
    // We use the parent element of "Edit Dashboard" as the best approximation
    // of the toolbar group container.
    const editBtn = findEditDashboardButton();
    if (!editBtn) return null;

    return editBtn.parentElement || null;
  }

  /**
   * Chooses a template button to clone for consistent styling.
   * Prefers a "small" button (icon-only) if available, otherwise falls back
   * to cloning another button in the same container (including Edit Dashboard).
   */
  function pickTemplateButton(container) {
    const buttons = Array.from(container.querySelectorAll("button, a"));
    const editBtn = findEditDashboardButton();

    // Heuristic for "small" buttons: very short text (emoji/icon/empty)
    const small = buttons.find(b => {
      const txt = normalize(b.textContent);
      return b !== editBtn && txt.length <= 3;
    });

    return small || buttons.find(b => b !== editBtn) || editBtn || null;
  }

  /**
   * Creates a new toolbar button by cloning an existing one, then replaces its
   * contents with custom icon text and binds a click handler.
   */
  function makeClonedIconButton(templateBtn, id, title, iconText, onClick) {
    const btn = templateBtn.cloneNode(true);

    btn.id = id;
    btn.setAttribute("title", title);

    // Remove potential inline handlers/links to avoid unexpected navigation/actions
    btn.removeAttribute("onclick");
    btn.removeAttribute("ng-click");
    btn.removeAttribute("href");
    btn.type = "button";

    // Replace visible content with our custom label/icon
    btn.textContent = "";
    const span = document.createElement("span");
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.justifyContent = "center";
    span.style.width = "100%";
    span.style.height = "100%";
    span.textContent = iconText;
    btn.appendChild(span);

    // Bind the action
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });

    return btn;
  }

  /**
   * Inserts the "Collapse all" and "Expand all" buttons in the top toolbar.
   * This function is idempotent: if buttons already exist, it does nothing.
   */
  function insertTopButtons() {
    if (document.getElementById(BTN_COLLAPSE_ID) || document.getElementById(BTN_EXPAND_ID)) return true;

    const container = findTopButtonsContainer();
    if (!container) return false;

    const templateBtn = pickTemplateButton(container);
    if (!templateBtn) return false;

    const collapseBtn = makeClonedIconButton(
      templateBtn,
      BTN_COLLAPSE_ID,
      "Collapse all Smart Views",
      "Collapse all views",
      collapseAll
    );

    const expandBtn = makeClonedIconButton(
      templateBtn,
      BTN_EXPAND_ID,
      "Expand all Smart Views",
      "Expand all views",
      expandAll
    );

    // Place after the last existing toolbar button in this container
    const buttons = Array.from(container.querySelectorAll("button, a"));
    const last = buttons[buttons.length - 1] || null;

    if (last && last.parentElement === container) {
      container.insertBefore(collapseBtn, last.nextSibling);
      container.insertBefore(expandBtn, collapseBtn.nextSibling);
    } else {
      container.appendChild(collapseBtn);
      container.appendChild(expandBtn);
    }

    return true;
  }

  /* ----------------- CSS: hard remove blank space ----------------- */

  /**
   * CSS rules applied when a card is collapsed:
   * - Remove bottom spacing/min-height on the card
   * - Hide all content containers and iframes inside the card
   * This ensures there is no empty white area under the title.
   */
  const style = document.createElement("style");
  style.textContent = `
    .${COLLAPSED_CLASS}{
      padding-bottom: 0 !important;
      min-height: 0 !important;
    }
    .${COLLAPSED_CLASS} .x-card__header{
      margin-bottom: 0 !important;
      padding-bottom: 0 !important;
    }
    .${COLLAPSED_CLASS} .x-card__content,
    .${COLLAPSED_CLASS} .x-card__body,
    .${COLLAPSED_CLASS} .x-card__main,
    .${COLLAPSED_CLASS} .x-card__container,
    .${COLLAPSED_CLASS} .xdb-dashboard__widget__content,
    .${COLLAPSED_CLASS} iframe,
    .${COLLAPSED_CLASS} .ng-scope,
    .${COLLAPSED_CLASS} .ng-isolate-scope{
      display: none !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      overflow: hidden !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
    }
  `;
  document.head.appendChild(style);

  /* ----------------- boot ----------------- */

  /**
   * Main execution:
   * - Bind per-widget click behavior
   * - Insert global toolbar buttons
   */
  function run() {
    scanAndBind();
    insertTopButtons();
  }

  // Initial run
  run();

  // Observe DOM changes (dashboard is reactive / dynamically updated)
  const mo = new MutationObserver(run);
  mo.observe(document.documentElement, { subtree: true, childList: true });

  // Periodic rescan as an additional safety net
  setInterval(run, RESCAN_MS);

})();
