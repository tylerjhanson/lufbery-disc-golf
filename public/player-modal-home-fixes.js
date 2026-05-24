(() => {
  if (window.__lufberyPlayerModalHomeFixesLoaded) return;
  window.__lufberyPlayerModalHomeFixesLoaded = true;

  const STYLE_ID = "player-modal-home-fixes-style";

  function injectHomeLayoutFix() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .home-grid {
        align-items: start !important;
      }

      .right-stack {
        height: auto !important;
        grid-template-rows: auto auto auto !important;
      }

      .events-card {
        align-self: start !important;
      }

      .events-card .event-list {
        flex: none !important;
        grid-template-rows: none !important;
      }
    `;
    document.head.appendChild(style);
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
    updateCourseStatsModalLabel(document);

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
