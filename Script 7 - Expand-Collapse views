// ==UserScript==
// @name         XTRF – Smart Views collapse/expand + Collapse all / Expand all (independent)
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Collapse/expand Smart Views by clicking title (NO blank space) + top buttons near Edit Dashboard (independent)
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/dashboard.seam*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const TITLE_SELECTOR = "h2.x-card__header__heading";
  const CARD_SELECTOR  = ".x-card";

  const STORAGE_KEY = "xtrf_smartview_collapsed_v6";

  const BTN_COLLAPSE_ID = "xtrf_sv_collapse_all";
  const BTN_EXPAND_ID   = "xtrf_sv_expand_all";

  const CHEVRON_CLASS   = "xtrf-collapse-chevron";
  const COLLAPSED_CLASS = "xtrf-collapsed";

  const RESCAN_MS = 700;

  /* ----------------- utils ----------------- */

  function normalize(s) {
    return (s || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  }

  // clé stable même avec compteurs / chevrons
  function cleanTitle(raw) {
    let t = normalize(raw);
    t = t.replace(/^[▸▾]\s*/g, "").trim();
    t = t.replace(/^\(\d+\)\s*/g, "").trim();               // (2)Title
    t = t.replace(/\s*\(\d+\)\s*$/g, "").trim();            // Title (2)
    t = t.replace(/\s*\(\d+\)\s*(?=\/|$)/g, "").trim();     // Requested (4) / Open (2)
    return t;
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

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

  function setCollapsed(cardEl, titleEl, collapsed) {
    const chevron = titleEl.querySelector("." + CHEVRON_CLASS);
    if (chevron) chevron.textContent = collapsed ? "▸" : "▾";
    cardEl.classList.toggle(COLLAPSED_CLASS, !!collapsed);
  }

  function bindTitle(titleEl) {
    if (titleEl.dataset.xtrfCollapseBound === "1") return;
    titleEl.dataset.xtrfCollapseBound = "1";

    const card = titleEl.closest(CARD_SELECTOR);
    if (!card) return;

    titleEl.style.cursor = "pointer";
    titleEl.style.userSelect = "none";
    ensureChevron(titleEl);

    const key = cleanTitle(titleEl.textContent);
    if (!key) return;

    const state = loadState();
    setCollapsed(card, titleEl, state[key] === true);

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

  function scanAndBind() {
    document.querySelectorAll(TITLE_SELECTOR).forEach(bindTitle);
  }

  /* ----------------- collapse/expand all ----------------- */

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

  function findEditDashboardButton() {
    return Array.from(document.querySelectorAll("button, a")).find(el =>
      normalize(el.textContent).toLowerCase() === "edit dashboard"
    ) || null;
  }

  function findTopButtonsContainer() {
    // On prend le conteneur qui contient "Edit Dashboard" + les petits boutons à droite
    const editBtn = findEditDashboardButton();
    if (!editBtn) return null;

    // En général, le parent direct contient toute la rangée de boutons
    // (et c’est exactement là qu’on veut se greffer)
    return editBtn.parentElement || null;
  }

  function pickTemplateButton(container) {
    // On clone le style d’un petit bouton si possible (palette/refresh/chrono),
    // sinon on clone "Edit Dashboard".
    const buttons = Array.from(container.querySelectorAll("button, a"));
    const editBtn = findEditDashboardButton();

    // petit bouton = souvent un bouton sans long texte
    const small = buttons.find(b => {
      const txt = normalize(b.textContent);
      return b !== editBtn && txt.length <= 3; // emoji / icône / vide
    });

    return small || buttons.find(b => b !== editBtn) || editBtn || null;
  }

  function makeClonedIconButton(templateBtn, id, title, iconText, onClick) {
    const btn = templateBtn.cloneNode(true);

    btn.id = id;
    btn.setAttribute("title", title);

    // Nettoyage comportements éventuels
    btn.removeAttribute("onclick");
    btn.removeAttribute("ng-click");
    btn.removeAttribute("href");
    btn.type = "button";

    // Contenu
    btn.textContent = "";
    const span = document.createElement("span");
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.justifyContent = "center";
    span.style.width = "100%";
    span.style.height = "100%";
    span.textContent = iconText;
    btn.appendChild(span);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });

    return btn;
  }

  function insertTopButtons() {
    if (document.getElementById(BTN_COLLAPSE_ID) || document.getElementById(BTN_EXPAND_ID)) return true;

    const container = findTopButtonsContainer();
    if (!container) return false;

    const templateBtn = pickTemplateButton(container);
    if (!templateBtn) return false;

    const collapseBtn = makeClonedIconButton(templateBtn, BTN_COLLAPSE_ID, "Collapse all Smart Views", "Collapse", collapseAll);
    const expandBtn   = makeClonedIconButton(templateBtn, BTN_EXPAND_ID,   "Expand all Smart Views",   "Expand", expandAll);

    // Placement: juste après le dernier bouton existant du groupe
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

  function run() {
    scanAndBind();
    insertTopButtons();
  }

  run();

  const mo = new MutationObserver(run);
  mo.observe(document.documentElement, { subtree: true, childList: true });

  setInterval(run, RESCAN_MS);

})();
