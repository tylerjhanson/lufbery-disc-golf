(() => {
  if (window.__lufberyPlayerCourseStatsModalLoaded) return;
  window.__lufberyPlayerCourseStatsModalLoaded = true;

  const DATA_URL = "/data/course-stats.generated.json";
  const STYLE_ID = "player-course-stats-modal-style";
  const SEGMENT_LABELS = {
    aceEagle: "Ace/Eagle",
    birdie: "Birdie",
    par: "Par",
    bogey: "Bogey",
    doubleBogey: "Double Bogey",
    triplePlus: "Triple Bogey+",
  };

  let courseStatsPromise = null;
  let processing = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeKey(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function formatRounds(rounds) {
    const count = Number(rounds || 0);
    return `${new Intl.NumberFormat("en-US").format(count)} round${count === 1 ? "" : "s"}`;
  }

  function formatAverage(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toFixed(2) : "—";
  }

  function formatPlusMinus(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return "—";
    if (number === 0) return "E";
    return number > 0 ? `+${number.toFixed(2)}` : number.toFixed(2);
  }

  function barStyle(segments) {
    const visible = Array.isArray(segments)
      ? segments.filter((segment) => Number(segment?.count || 0) > 0)
      : [];

    if (!visible.length) return "grid-template-columns:1fr;";
    return `grid-template-columns:${visible
      .map((segment) => `${Math.max(1, Number(segment.count || 0))}fr`)
      .join(" ")};`;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .player-details-accordion-button {
        appearance: none;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--text, #111827);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .player-details-accordion-button .player-details-section-label {
        margin: 0;
      }

      .player-details-accordion-icon {
        color: var(--muted, #6b7280);
        font-size: 1rem;
        font-weight: 800;
        line-height: 1;
        transition: transform 0.15s ease;
      }

      .player-details-section.is-collapsed .player-details-accordion-icon {
        transform: rotate(-90deg);
      }

      .player-details-accordion-content {
        margin-top: 10px;
      }

      .player-details-section.is-collapsed .player-details-accordion-content {
        display: none;
      }

      .player-course-stats-summary {
        margin: 0 0 10px;
        color: var(--muted, #6b7280);
        font-size: 0.88rem;
        font-weight: 800;
      }

      .player-course-stats-grid {
        display: grid;
        gap: 7px;
      }

      .player-course-stats-hole {
        padding: 8px 9px;
        border: 1px solid var(--line-soft, #e6edf5);
        border-radius: 12px;
        background: var(--card, #ffffff);
      }

      .player-course-stats-hole-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 9px;
        margin-bottom: 6px;
      }

      .player-course-stats-hole-title {
        margin: 0;
        color: var(--text, #111827);
        font-size: 0.96rem;
        font-weight: 800;
        line-height: 1.2;
        min-width: 0;
      }

      .player-course-stats-hole-title span {
        margin-left: 6px;
        color: var(--muted, #6b7280);
        font-size: 0.84rem;
        font-weight: 500;
      }

      .player-course-stats-hole-meta {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--muted, #6b7280);
        font-size: 0.82rem;
        line-height: 1.2;
        white-space: nowrap;
        flex: 0 0 auto;
      }

      .player-course-stats-hole-meta strong {
        color: var(--text, #111827);
        font-size: 1.08em;
        font-weight: 800;
      }

      .player-course-stats-bar {
        display: grid;
        min-height: 20px;
        overflow: hidden;
        border: 2px solid #cfe0ef;
        border-radius: 9px;
        background: var(--card, #ffffff);
      }

      html[data-theme="dark"] .player-course-stats-bar {
        border-color: #334155;
      }

      @media (prefers-color-scheme: dark) {
        html[data-theme="system"] .player-course-stats-bar {
          border-color: #334155;
        }
      }

      .player-course-stats-segment {
        position: relative;
        min-width: 0;
      }

      .player-course-stats-segment + .player-course-stats-segment {
        box-shadow: inset 1px 0 0 rgba(15, 23, 42, 0.1);
      }

      html[data-theme="dark"] .player-course-stats-segment + .player-course-stats-segment {
        box-shadow: inset 1px 0 0 rgba(248, 250, 252, 0.16);
      }

      .player-course-stats-segment span {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        font-size: 0.72rem;
        font-weight: 800;
        line-height: 1;
      }

      .player-course-stats-segment--ace { background: #2f6fb6; color: #fff; }
      .player-course-stats-segment--birdie { background: #6c9bd1; color: #fff; }
      .player-course-stats-segment--par { background: var(--card, #ffffff); color: var(--text, #111827); }
      .player-course-stats-segment--bogey { background: #f2d8c8; color: #2e3440; }
      .player-course-stats-segment--double { background: #efb286; color: #2e3440; }
      .player-course-stats-segment--triple { background: #eb7b3c; color: #fff; }

      @media (max-width: 700px) {
        .player-course-stats-summary {
          font-size: 0.82rem;
          line-height: 1.25;
        }

        .player-course-stats-hole {
          padding: 8px 8px;
        }

        .player-course-stats-hole-header {
          align-items: baseline;
          flex-direction: row;
          gap: 6px;
          margin-bottom: 6px;
        }

        .player-course-stats-hole-title {
          font-size: 0.9rem;
          white-space: nowrap;
        }

        .player-course-stats-hole-title span {
          margin-left: 4px;
          font-size: 0.76rem;
        }

        .player-course-stats-hole-meta {
          gap: 5px;
          font-size: 0.76rem;
        }

        .player-course-stats-hole-meta strong {
          font-size: 1em;
        }
      }

      @media (max-width: 380px) {
        .player-course-stats-hole-title {
          font-size: 0.84rem;
        }

        .player-course-stats-hole-title span,
        .player-course-stats-hole-meta {
          font-size: 0.7rem;
        }

        .player-course-stats-hole-meta {
          gap: 4px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function loadCourseStats() {
    if (!courseStatsPromise) {
      courseStatsPromise = fetch(DATA_URL, { cache: "force-cache" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }

    return courseStatsPromise;
  }

  function resolvePlayerStats(stats, name) {
    const players = stats?.players || {};
    const aliases = stats?.source?.aliases || {};
    const key = normalizeKey(name);
    const aliasKey = aliases[key] || key;
    return players[aliasKey] || players[key] || null;
  }

  function renderCourseStats(playerStats) {
    if (!playerStats || !Array.isArray(playerStats.holes) || !playerStats.holes.length) return "";

    const holesHtml = playerStats.holes
      .slice()
      .sort((a, b) => Number(a.hole || 0) - Number(b.hole || 0))
      .map((hole) => {
        const segments = Array.isArray(hole.segments) ? hole.segments : [];
        const segmentsHtml = segments
          .filter((segment) => Number(segment?.count || 0) > 0)
          .map((segment) => {
            const count = Number(segment.count || 0);
            const pct = Number(segment.pct || 0);
            const label = segment.label || SEGMENT_LABELS[segment.key] || segment.key || "Score";
            const title = `${label}: ${count} (${pct.toFixed(1)}%)`;
            return `
              <div class="player-course-stats-segment player-course-stats-segment--${escapeHtml(segment.kind || "par")}" title="${escapeHtml(title)}">
                ${pct >= 11 ? `<span>${escapeHtml(count)}</span>` : ""}
              </div>
            `;
          })
          .join("");

        return `
          <article class="player-course-stats-hole">
            <div class="player-course-stats-hole-header">
              <h4 class="player-course-stats-hole-title">Hole ${escapeHtml(hole.hole)} <span>Par ${escapeHtml(hole.par)}</span></h4>
              <div class="player-course-stats-hole-meta">
                <span>Diff. <strong>${escapeHtml(hole.difficultyRank || "—")}</strong></span>
                <span>Avg <strong>${escapeHtml(formatAverage(hole.average))}</strong></span>
              </div>
            </div>
            <div class="player-course-stats-bar" style="${escapeHtml(barStyle(segments))}">
              ${segmentsHtml}
            </div>
          </article>
        `;
      })
      .join("");

    return `
      <div class="player-course-stats-summary">
        ${escapeHtml(formatRounds(playerStats.rounds))} • Difficulty 1 = hardest, 18 = easiest
      </div>
      <div class="player-course-stats-grid">${holesHtml}</div>
    `;
  }

  function makeSection(label, content, collapsed = true) {
    const section = document.createElement("div");
    section.className = `player-details-section${collapsed ? " is-collapsed" : ""}`;
    section.dataset.playerCourseSection = "true";
    section.innerHTML = `
      <button class="player-details-accordion-button" type="button" aria-expanded="${collapsed ? "false" : "true"}">
        <span class="player-details-section-label">${escapeHtml(label)}</span>
        <span class="player-details-accordion-icon" aria-hidden="true">⌄</span>
      </button>
      <div class="player-details-accordion-content">${content}</div>
    `;
    return section;
  }

  function makeSectionsCollapsible(body) {
    body.querySelectorAll(".player-details-section").forEach((section, index) => {
      if (section.dataset.playerAccordionReady === "true") return;
      if (section.dataset.playerCourseSection === "true") return;

      const label = section.querySelector(":scope > .player-details-section-label");
      if (!label) return;

      const labelText = label.textContent || "Details";
      const collapsed = index > 0;
      const content = document.createElement("div");
      content.className = "player-details-accordion-content";

      Array.from(section.childNodes).forEach((node) => {
        if (node === label) return;
        content.appendChild(node);
      });

      const button = document.createElement("button");
      button.type = "button";
      button.className = "player-details-accordion-button";
      button.setAttribute("aria-expanded", collapsed ? "false" : "true");
      button.innerHTML = `
        <span class="player-details-section-label">${escapeHtml(labelText)}</span>
        <span class="player-details-accordion-icon" aria-hidden="true">⌄</span>
      `;

      section.textContent = "";
      section.appendChild(button);
      section.appendChild(content);
      section.classList.toggle("is-collapsed", collapsed);
      section.dataset.playerAccordionReady = "true";
    });
  }

  function wireAccordions(body) {
    body.querySelectorAll(".player-details-accordion-button").forEach((button) => {
      if (button.dataset.playerAccordionWired === "true") return;
      button.dataset.playerAccordionWired = "true";
      button.addEventListener("click", () => {
        const section = button.closest(".player-details-section");
        if (!section) return;
        const collapsed = !section.classList.toggle("is-collapsed");
        button.setAttribute("aria-expanded", collapsed ? "true" : "false");
      });
    });
  }

  async function enhanceModal() {
    if (processing) return;

    const body = document.getElementById("playerDetailsModalBody");
    const title = document.getElementById("playerDetailsModalTitle");
    if (!body || !title || !body.children.length) return;
    if (body.dataset.playerCourseStatsReady === title.textContent) return;

    processing = true;
    try {
      injectStyles();
      const stats = await loadCourseStats();
      const playerStats = resolvePlayerStats(stats, title.textContent || "");

      const existing = body.querySelector("[data-player-course-section='course-stats']");
      if (existing) existing.remove();

      if (playerStats) {
        const courseSection = makeSection("COURSE STATS", renderCourseStats(playerStats), true);
        courseSection.dataset.playerCourseSection = "course-stats";
        body.appendChild(courseSection);
      }

      makeSectionsCollapsible(body);
      wireAccordions(body);
      body.dataset.playerCourseStatsReady = title.textContent || "ready";
    } finally {
      processing = false;
    }
  }

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(enhanceModal);
  });

  function start() {
    const body = document.getElementById("playerDetailsModalBody");
    if (body) {
      observer.observe(body, { childList: true, subtree: false });
      enhanceModal();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();