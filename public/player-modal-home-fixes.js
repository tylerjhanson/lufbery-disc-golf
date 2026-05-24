(() => {
  if (window.__lufberyPlayerModalHomeFixesLoaded) return;
  window.__lufberyPlayerModalHomeFixesLoaded = true;

  const STYLE_ID = "player-modal-home-fixes-style";

  function injectHomeLayoutFix() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width: 901px) {
        .home-grid { align-items: start !important; }
        .left-stack, .middle-stack, .right-stack { align-self: start !important; }

        .right-stack {
          min-height: 0 !important;
          grid-template-rows: auto auto minmax(0, 1fr) !important;
        }

        .right-stack > .events-card,
        .events-card {
          align-self: stretch !important;
          min-height: 0 !important;
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
    `;
    document.head.appendChild(style);
  }

  function naturalHeight(element) {
    if (!element) return 0;
    const oldHeight = element.style.height;
    element.style.height = "auto";
    const height = Math.ceil(element.getBoundingClientRect().height);
    element.style.height = oldHeight;
    return height;
  }

  function applyHomeLayoutFix() {
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
        rightStack.style.height = "";
        rightStack.style.minHeight = "";
        rightStack.style.gridTemplateRows = "";
      }
      if (eventsCard) {
        eventsCard.style.alignSelf = "";
        eventsCard.style.height = "";
        eventsCard.style.minHeight = "";
        eventsCard.style.display = "";
        eventsCard.style.flexDirection = "";
      }
      if (eventsList) {
        eventsList.style.flex = "";
        eventsList.style.display = "";
        eventsList.style.gridTemplateRows = "";
        eventsList.style.alignItems = "";
        eventsList.style.gap = "";
        eventsList.style.minHeight = "";
      }
      eventsList?.querySelectorAll(".event-item").forEach((item) => {
        item.style.alignSelf = "";
        item.style.width = "";
        item.style.minHeight = "";
      });
      return;
    }

    if (homeGrid) homeGrid.style.alignItems = "start";
    [leftStack, middleStack, rightStack].forEach((stack) => {
      if (stack) stack.style.alignSelf = "start";
    });

    const middleHeight = naturalHeight(middleStack);
    const targetHeight = middleHeight > 0 ? middleHeight : naturalHeight(rightStack);

    if (rightStack) {
      rightStack.style.height = targetHeight ? targetHeight + "px" : "auto";
      rightStack.style.minHeight = "0";
      rightStack.style.gridTemplateRows = "auto auto minmax(0, 1fr)";
    }

    if (eventsCard) {
      eventsCard.style.alignSelf = "stretch";
      eventsCard.style.height = "auto";
      eventsCard.style.minHeight = "0";
      eventsCard.style.display = "flex";
      eventsCard.style.flexDirection = "column";
    }

    if (eventsList) {
      eventsList.style.flex = "1 1 auto";
      eventsList.style.display = "grid";
      eventsList.style.gridTemplateRows = "repeat(var(--home-event-count), minmax(0, 1fr))";
      eventsList.style.alignItems = "center";
      eventsList.style.gap = "14px";
      eventsList.style.minHeight = "0";
      eventsList.querySelectorAll(".event-item").forEach((item) => {
        item.style.alignSelf = "center";
        item.style.width = "100%";
        item.style.minHeight = "0";
      });
    }
  }

  function runHomeLayoutFix() {
    applyHomeLayoutFix();
    requestAnimationFrame(applyHomeLayoutFix);
    setTimeout(applyHomeLayoutFix, 150);
  }

  function updateCourseStatsModalLabel(root = document) {
    if (!(root instanceof Document || root instanceof Element)) return;
    root.querySelectorAll(".player-details-accordion-button .player-details-section-label").forEach((label) => {
      if ((label.textContent || "").trim() === "COURSE STATS") {
        label.textContent = "COURSE STATS (SINCE 2024)";
      }
    });
  }

  function start() {
    injectHomeLayoutFix();
    runHomeLayoutFix();
    updateCourseStatsModalLabel(document);

    const latestResultCard = document.getElementById("latestResultCard");
    if (latestResultCard && "MutationObserver" in window) {
      new MutationObserver(runHomeLayoutFix).observe(latestResultCard, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }

    const eventsList = document.getElementById("eventsList");
    if (eventsList && "MutationObserver" in window) {
      new MutationObserver(runHomeLayoutFix).observe(eventsList, {
        childList: true,
        subtree: true,
      });
    }

    window.addEventListener("resize", runHomeLayoutFix);

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
