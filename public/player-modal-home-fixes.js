(() => {
  if (window.__lufberyPlayerModalHomeFixesLoaded) return;
  window.__lufberyPlayerModalHomeFixesLoaded = true;

  const STYLE_ID = "player-modal-home-fixes-style";

  let applyingHomeFix = false;

  function setImportant(element, property, value) {
    if (!element) return;
    element.style.setProperty(property, value, "important");
  }

  function clearInline(element, properties) {
    if (!element) return;
    properties.forEach((property) => element.style.removeProperty(property));
  }

  function injectHomeLayoutFix() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width: 901px) {
        .home-grid {
          align-items: start !important;
        }

        .left-stack,
        .middle-stack,
        .right-stack {
          align-self: start !important;
        }

        .right-stack {
          min-height: 0 !important;
          grid-template-rows: auto auto minmax(0, 1fr) !important;
        }

        .right-stack > .events-card,
        .events-card {
          align-self: stretch !important;
          min-height: 0 !important;
          max-height: none !important;
          display: flex !important;
          flex-direction: column !important;
        }

        .events-card .event-list {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          display: grid !important;
          grid-template-rows: repeat(var(--home-event-count), minmax(0, 1fr)) !important;
          align-items: center !important;
          gap: 14px !important;
        }

        .events-card .event-item {
          align-self: center !important;
          width: 100% !important;
          min-height: 0 !important;
          max-height: none !important;
        }
      }

      @media (max-width: 700px) {
        .player-course-stats-summary {
          font-size: 0.82rem !important;
          line-height: 1.25 !important;
        }

        .player-course-stats-hole {
          padding: 8px 8px !important;
        }

        .player-course-stats-hole-header {
          display: flex !important;
          align-items: baseline !important;
          flex-direction: row !important;
          justify-content: space-between !important;
          gap: 6px !important;
          margin-bottom: 6px !important;
        }

        .player-course-stats-hole-title {
          font-size: 0.9rem !important;
          white-space: nowrap !important;
          min-width: 0 !important;
        }

        .player-course-stats-hole-title span {
          margin-left: 4px !important;
          font-size: 0.76rem !important;
        }

        .player-course-stats-hole-meta {
          gap: 5px !important;
          font-size: 0.76rem !important;
          white-space: nowrap !important;
          flex: 0 0 auto !important;
        }

        .player-course-stats-hole-meta strong {
          font-size: 1em !important;
        }
      }

      @media (max-width: 380px) {
        .player-course-stats-hole-title { font-size: 0.84rem !important; }
        .player-course-stats-hole-title span,
        .player-course-stats-hole-meta { font-size: 0.7rem !important; }
        .player-course-stats-hole-meta { gap: 4px !important; }
      }

      .weekly-results-page .player-name-cell.is-best-raw .player-button::after {
        content: "🔥";
        display: inline-block;
        margin-left: 0.25em;
        font-size: 0.67em;
        line-height: 1;
        vertical-align: 0.12em;
        text-decoration: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function naturalHeight(element) {
    if (!element) return 0;
    const oldHeight = element.style.height;
    const oldMinHeight = element.style.minHeight;
    const oldMaxHeight = element.style.maxHeight;
    element.style.height = "auto";
    element.style.minHeight = "0";
    element.style.maxHeight = "none";
    const height = Math.ceil(element.getBoundingClientRect().height);
    element.style.height = oldHeight;
    element.style.minHeight = oldMinHeight;
    element.style.maxHeight = oldMaxHeight;
    return height;
  }

  function getGapPx(element) {
    if (!element) return 0;
    const styles = window.getComputedStyle(element);
    return Number.parseFloat(styles.rowGap || styles.gap || "0") || 0;
  }

  function applyHomeLayoutFix() {
    if (applyingHomeFix) return;
    applyingHomeFix = true;

    try {
      const homeGrid = document.querySelector(".home-grid");
      const leftStack = document.querySelector(".left-stack");
      const middleStack = document.querySelector(".middle-stack");
      const rightStack = document.querySelector(".right-stack");
      const eventsCard = document.getElementById("upcomingEventsCard") || document.querySelector(".events-card");
      const eventsList = document.getElementById("eventsList") || document.querySelector(".events-card .event-list");

      if (window.matchMedia("(max-width: 900px)").matches) {
        if (homeGrid) homeGrid.style.alignItems = "";
        [leftStack, middleStack, rightStack].forEach((stack) => {
          if (stack) stack.style.alignSelf = "";
        });
        if (rightStack) {
          clearInline(rightStack, ["height", "min-height", "grid-template-rows"]);
        }
        if (eventsCard) {
          clearInline(eventsCard, ["align-self", "height", "min-height", "max-height", "display", "flex-direction"]);
        }
        if (eventsList) {
          clearInline(eventsList, ["flex", "display", "grid-template-rows", "align-items", "gap", "min-height"]);
        }
        eventsList?.querySelectorAll(".event-item").forEach((item) => {
          clearInline(item, ["align-self", "width", "min-height", "max-height"]);
        });
        return;
      }

      if (!middleStack || !rightStack || !eventsCard) return;

      setImportant(homeGrid, "align-items", "start");
      [leftStack, middleStack, rightStack].forEach((stack) => setImportant(stack, "align-self", "start"));

      const middleHeight = naturalHeight(middleStack);
      const rightChildren = Array.from(rightStack.children);
      const cardsBeforeEvents = rightChildren.filter((child) => child !== eventsCard);
      const usedHeight = cardsBeforeEvents.reduce(
        (total, child) => total + Math.ceil(child.getBoundingClientRect().height),
        0
      );
      const gapTotal = getGapPx(rightStack) * Math.max(rightChildren.length - 1, 0);
      const targetEventsHeight = Math.max(0, middleHeight - usedHeight - gapTotal);

      setImportant(rightStack, "height", middleHeight ? `${Math.ceil(middleHeight)}px` : "auto");
      setImportant(rightStack, "min-height", "0");
      setImportant(rightStack, "grid-template-rows", "auto auto minmax(0, 1fr)");

      setImportant(eventsCard, "align-self", "stretch");
      setImportant(eventsCard, "height", targetEventsHeight ? `${Math.ceil(targetEventsHeight)}px` : "auto");
      setImportant(eventsCard, "min-height", "0");
      setImportant(eventsCard, "max-height", "none");
      setImportant(eventsCard, "display", "flex");
      setImportant(eventsCard, "flex-direction", "column");

      if (eventsList) {
        setImportant(eventsList, "flex", "1 1 auto");
        setImportant(eventsList, "display", "grid");
        setImportant(eventsList, "grid-template-rows", "repeat(var(--home-event-count), minmax(0, 1fr))");
        setImportant(eventsList, "align-items", "center");
        setImportant(eventsList, "gap", "14px");
        setImportant(eventsList, "min-height", "0");
        eventsList.querySelectorAll(".event-item").forEach((item) => {
          setImportant(item, "align-self", "center");
          setImportant(item, "width", "100%");
          setImportant(item, "min-height", "0");
          setImportant(item, "max-height", "none");
        });
      }
    } finally {
      applyingHomeFix = false;
    }
  }

  function runHomeLayoutFix() {
    applyHomeLayoutFix();
    requestAnimationFrame(applyHomeLayoutFix);
    setTimeout(applyHomeLayoutFix, 0);
    setTimeout(applyHomeLayoutFix, 150);
    setTimeout(applyHomeLayoutFix, 400);
  }

  function updateCourseStatsModalLabel(root = document) {
    if (!(root instanceof Document || root instanceof Element)) return;
    root.querySelectorAll(".player-details-accordion-button .player-details-section-label").forEach((label) => {
      if ((label.textContent || "").trim() === "COURSE STATS") {
        label.textContent = "COURSE STATS (SINCE 2021)";
      }
    });
  }

  function parseScoreNumber(value) {
    const text = String(value || "")
      .replace(/\u2212/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    if (!text || /^(-|—|n\/a|na)$/i.test(text)) return null;
    if (/^e$/i.test(text)) return 0;

    const matches = text.match(/[-+]?\$?\d[\d,]*(?:\.\d+)?/g);
    if (!matches) return null;

    for (const match of matches) {
      const number = Number(match.replace(/\$/g, "").replace(/,/g, ""));
      if (Number.isFinite(number)) return number;
    }

    return null;
  }

  function normalizeScoreHeader(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function getTableHeaders(table) {
    const headerRow = table?.tHead?.rows?.[0];
    if (!headerRow) return [];

    return Array.from(headerRow.cells).map((header) => {
      const label = header.querySelector(".sort-header-label")?.textContent || header.textContent || "";
      return normalizeScoreHeader(label);
    });
  }

  function findScoreHeaderIndex(headers, labels) {
    const normalizedLabels = labels.map(normalizeScoreHeader);

    for (const label of normalizedLabels) {
      const index = headers.findIndex((header) => header === label);
      if (index !== -1) return index;
    }

    for (const label of normalizedLabels) {
      const index = headers.findIndex((header) => header.includes(label));
      if (index !== -1) return index;
    }

    return -1;
  }

  function getScoreFromCell(cells, index) {
    if (index < 0 || index >= cells.length) return null;
    return parseScoreNumber(cells[index]?.textContent || "");
  }

  function getBestRawScoreForRow(row) {
    const table = row.closest("table");
    const headers = getTableHeaders(table);
    const cells = Array.from(row.cells || []);

    const rawIndex = findScoreHeaderIndex(headers, ["raw", "raw score"]);
    const totalIndex = findScoreHeaderIndex(headers, ["total", "total score"]);
    const scoreIndex = findScoreHeaderIndex(headers, ["score"]);

    for (const index of [rawIndex, totalIndex, scoreIndex]) {
      const score = getScoreFromCell(cells, index);
      if (score != null) return score;
    }

    const r1Index = findScoreHeaderIndex(headers, ["r1", "round 1"]);
    const r2Index = findScoreHeaderIndex(headers, ["r2", "round 2"]);
    const r1 = getScoreFromCell(cells, r1Index);
    const r2 = getScoreFromCell(cells, r2Index);

    if (r1 != null && r2 != null) return r1 + r2;

    return parseScoreNumber(row.getAttribute("data-raw-score") || "");
  }

  function applyBestRawScoreEmojis(root = document) {
    if (!(root instanceof Document || root instanceof Element)) return;

    root.querySelectorAll(".weekly-results-page .card").forEach((card) => {
      const rows = Array.from(card.querySelectorAll("tr[data-player-name]"));

      rows.forEach((row) => {
        row.querySelector(".player-name-cell")?.classList.remove("is-best-raw");
      });

      const scoredRows = rows
        .map((row) => ({ row, score: getBestRawScoreForRow(row) }))
        .filter(({ score }) => score != null);

      if (!scoredRows.length) return;

      const bestRawScore = Math.min(...scoredRows.map(({ score }) => score));

      scoredRows.forEach(({ row, score }) => {
        if (Math.abs(score - bestRawScore) > 0.000001) return;
        row.querySelector(".player-name-cell")?.classList.add("is-best-raw");
      });
    });
  }

  function runBestRawScoreEmojiFix() {
    applyBestRawScoreEmojis(document);
    requestAnimationFrame(() => applyBestRawScoreEmojis(document));
    setTimeout(() => applyBestRawScoreEmojis(document), 0);
    setTimeout(() => applyBestRawScoreEmojis(document), 150);
  }

  function start() {
    injectHomeLayoutFix();
    runHomeLayoutFix();
    updateCourseStatsModalLabel(document);
    runBestRawScoreEmojiFix();

    const latestResultCard = document.getElementById("latestResultCard");
    const eventsCard = document.getElementById("upcomingEventsCard") || document.querySelector(".events-card");
    const eventsList = document.getElementById("eventsList") || document.querySelector(".events-card .event-list");
    const rightStack = document.querySelector(".right-stack");
    const resultsEvents = document.getElementById("resultsEvents");

    if ("MutationObserver" in window) {
      const observerOptions = { attributes: true, attributeFilter: ["class", "style"] };
      if (latestResultCard) new MutationObserver(runHomeLayoutFix).observe(latestResultCard, observerOptions);
      if (eventsCard) new MutationObserver(runHomeLayoutFix).observe(eventsCard, observerOptions);
      if (rightStack) new MutationObserver(runHomeLayoutFix).observe(rightStack, observerOptions);
      if (eventsList) {
        new MutationObserver(runHomeLayoutFix).observe(eventsList, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "style"],
        });
      }
      if (resultsEvents) {
        new MutationObserver(runBestRawScoreEmojiFix).observe(resultsEvents, {
          childList: true,
          subtree: true,
        });
      }
    }

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(runHomeLayoutFix);
      [latestResultCard, document.querySelector(".middle-stack"), rightStack, eventsCard].forEach((element) => {
        if (element) resizeObserver.observe(element);
      });
    }

    window.addEventListener("load", runHomeLayoutFix);
    window.addEventListener("resize", runHomeLayoutFix);
    window.addEventListener("pageshow", runHomeLayoutFix);
    document.addEventListener("astro:page-load", runHomeLayoutFix);
    document.addEventListener("astro:page-load", runBestRawScoreEmojiFix);

    const modalBody = document.getElementById("playerDetailsModalBody") || document.body;
    new MutationObserver(() => updateCourseStatsModalLabel(document)).observe(modalBody, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();