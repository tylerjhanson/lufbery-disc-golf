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
        .home-grid {
          align-items: start !important;
        }

        .left-stack,
        .middle-stack,
        .right-stack {
          align-self: start !important;
        }

        .right-stack {
          height: auto !important;
          min-height: 0 !important;
          grid-template-rows: auto auto auto !important;
        }

        .right-stack > .events-card,
        .events-card {
          align-self: start !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          display: block !important;
        }

        .events-card .event-list {
          flex: 0 0 auto !important;
          grid-template-rows: none !important;
          min-height: 0 !important;
        }

        .events-card .event-item {
          min-height: 0 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function applyHomeLayoutFix() {
    const homeGrid = document.querySelector(".home-grid");
    const leftStack = document.querySelector(".left-stack");
    const middleStack = document.querySelector(".middle-stack");
    const rightStack = document.querySelector(".right-stack");
    const eventsCard = document.getElementById("upcomingEventsCard") || document.querySelector(".events-card");
    const eventsList = document.getElementById("eventsList") || document.querySelector(".events-card .event-list");

    if (window.matchMedia("(max-width: 900px)").matches) return;

    if (homeGrid) homeGrid.style.alignItems = "start";

    [leftStack, middleStack, rightStack].forEach((stack) => {
      if (!stack) return;
      stack.style.alignSelf = "start";
    });

    if (rightStack) {
      rightStack.style.height = "auto";
      rightStack.style.minHeight = "0";
      rightStack.style.gridTemplateRows = "auto auto auto";
    }

    if (eventsCard) {
      eventsCard.style.alignSelf = "start";
      eventsCard.style.height = "auto";
      eventsCard.style.minHeight = "0";
      eventsCard.style.maxHeight = "none";
      eventsCard.style.display = "block";
    }

    if (eventsList) {
      eventsList.style.flex = "0 0 auto";
      eventsList.style.gridTemplateRows = "none";
      eventsList.style.minHeight = "0";
    }
  }

  function scheduleHomeLayoutFix() {
    applyHomeLayoutFix();
    window.requestAnimationFrame(applyHomeLayoutFix);
    window.setTimeout(applyHomeLayoutFix, 0);
    window.setTimeout(applyHomeLayoutFix, 150);
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
    scheduleHomeLayoutFix();
    updateCourseStatsModalLabel(document);

    const latestResultCard = document.getElementById("latestResultCard");
    if (latestResultCard && "MutationObserver" in window) {
      new MutationObserver(scheduleHomeLayoutFix).observe(latestResultCard, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }

    window.addEventListener("resize", scheduleHomeLayoutFix);

    const modalBody = document.getElementById("playerDetailsModalBody") || document.body;
    if (!modalBody) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            updateCourseStatsModalLabel(node);
          }
        });
      });
      updateCourseStatsModalLabel(document);
    });

    observer.observe(modalBody, {
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
