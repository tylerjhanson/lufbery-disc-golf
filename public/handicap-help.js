(() => {
  const HELP_BUTTON_CLASS = "profile-handicap-help-link";
  const MODAL_ID = "handicapHelpModal";

  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function parseScore(value) {
    const match = String(value || "").trim().match(/^-?\d+/);
    if (!match) return null;

    const number = Number(match[0]);
    return Number.isFinite(number) ? number : null;
  }

  function formatScoreList(scores) {
    return scores.length ? scores.join(", ") : "—";
  }

  function getHandicapCard() {
    return Array.from(document.querySelectorAll(".profile-card")).find((card) => {
      const title = card.querySelector(".profile-section-title")?.textContent || "";
      return title.trim().toLowerCase() === "rounds counting towards handicap";
    });
  }

  function getCalculationData(card) {
    const rows = Array.from(card.querySelectorAll(".profile-table tbody tr"));
    const rounds = rows
      .map((row) => {
        const score = parseScore(row.cells?.[1]?.textContent || "");
        if (score == null) return null;

        return {
          score,
          dropped: row.classList.contains("profile-dropped-round"),
        };
      })
      .filter(Boolean);

    const scores = rounds.map((round) => round.score);
    const droppedScores = rounds.filter((round) => round.dropped).map((round) => round.score);
    const usedScores = rounds.filter((round) => !round.dropped).map((round) => round.score);
    const average = usedScores.length
      ? usedScores.reduce((sum, score) => sum + score, 0) / usedScores.length
      : null;
    const rawCalculation = average == null ? null : (average - 53) * 0.8;
    const rounded = rawCalculation == null ? null : Math.round(rawCalculation);

    return {
      scores,
      droppedScores,
      usedScores,
      average,
      rawCalculation,
      rounded,
      hasEnoughRounds: scores.length >= 3,
    };
  }

  function createModal() {
    const existing = document.getElementById(MODAL_ID);
    if (existing) return existing;

    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "profile-help-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="profile-help-backdrop" data-handicap-help-close></div>
      <section class="profile-help-panel" role="dialog" aria-modal="true" aria-labelledby="handicap-help-title">
        <button class="profile-help-close" type="button" aria-label="Close" data-handicap-help-close>×</button>
        <h2 id="handicap-help-title">How is my handicap calculated?</h2>
        <div class="profile-help-content" data-handicap-help-content></div>
      </section>
    `;

    document.body.append(modal);

    modal.querySelectorAll("[data-handicap-help-close]").forEach((button) => {
      button.addEventListener("click", () => closeModal(modal));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) closeModal(modal);
    });

    return modal;
  }

  function renderContent(modal, data) {
    const content = modal.querySelector("[data-handicap-help-content]");
    if (!content) return;

    const baseExplanation = `
      <p>Your handicap is based on your most recent handicap-eligible rounds.</p>
      <p>You need at least <strong>3 rounds</strong> to have a handicap. The site looks at your latest <strong>up to 5 scores</strong>. If you have 4 or 5 scores, your highest score is dropped.</p>
      <p>The remaining scores are averaged, then calculated as <strong>(average score - 53) × 0.8</strong>. The result is rounded to the nearest whole number.</p>
    `;

    if (!data.scores.length) {
      content.innerHTML = `${baseExplanation}<p class="profile-help-note">No handicap-eligible rounds were found for this player yet.</p>`;
      return;
    }

    if (!data.hasEnoughRounds) {
      content.innerHTML = `
        ${baseExplanation}
        <div class="profile-help-example">
          <p><strong>Recent scores:</strong> ${formatScoreList(data.scores)}</p>
          <p class="profile-help-note">This player does not have 3 handicap-eligible rounds yet, so no handicap is shown.</p>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      ${baseExplanation}
      <div class="profile-help-example">
        <p><strong>Recent scores:</strong> ${formatScoreList(data.scores)}</p>
        ${data.droppedScores.length ? `<p><strong>Dropped score:</strong> ${formatScoreList(data.droppedScores)}</p>` : ""}
        <p><strong>Scores used:</strong> ${formatScoreList(data.usedScores)}</p>
        <p><strong>Average:</strong> ${data.average.toFixed(1)}</p>
        <p><strong>Calculation:</strong> (${data.average.toFixed(1)} - 53) × 0.8 = ${data.rawCalculation.toFixed(1)}</p>
        <p><strong>Rounded handicap:</strong> ${data.rounded}</p>
      </div>
    `;
  }

  function openModal(modal) {
    modal.hidden = false;
    document.body.classList.add("profile-help-open");
    modal.querySelector(".profile-help-close")?.focus();
  }

  function closeModal(modal) {
    modal.hidden = true;
    document.body.classList.remove("profile-help-open");
  }

  function addStyles() {
    if (document.getElementById("handicap-help-styles")) return;

    const style = document.createElement("style");
    style.id = "handicap-help-styles";
    style.textContent = `
      .profile-handicap-help-link {
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        margin-top: 12px;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--accent, #2563eb);
        font: inherit;
        font-size: 0.86rem;
        font-weight: 800;
        line-height: 1.35;
        text-align: left;
        text-decoration: none;
        cursor: pointer;
      }

      .profile-handicap-help-link:hover,
      .profile-handicap-help-link:focus-visible {
        text-decoration: underline;
      }

      .profile-help-open {
        overflow: hidden;
      }

      .profile-help-modal[hidden] {
        display: none;
      }

      .profile-help-modal {
        position: fixed;
        inset: 0;
        z-index: 10000;
      }

      .profile-help-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(15, 23, 42, 0.52);
        backdrop-filter: blur(2px);
      }

      .profile-help-panel {
        position: relative;
        z-index: 1;
        width: min(92vw, 520px);
        margin: 7vh auto 0;
        padding: 22px 20px 20px;
        max-height: 86vh;
        overflow-y: auto;
        border: 1px solid var(--line-soft, #eef2f7);
        border-radius: 22px;
        background: var(--card, #ffffff);
        color: var(--text, #111827);
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.26);
      }

      .profile-help-panel h2 {
        margin: 0 44px 14px 0;
        font-size: 1.3rem;
        line-height: 1.15;
        letter-spacing: -0.02em;
      }

      .profile-help-panel p {
        margin: 0 0 12px;
        color: var(--text, #111827);
        font-size: 0.95rem;
        line-height: 1.45;
      }

      .profile-help-close {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 36px;
        height: 36px;
        border: 1px solid var(--line-soft, #eef2f7);
        border-radius: 999px;
        background: var(--card, #ffffff);
        color: var(--muted, #6b7280);
        font-size: 1.2rem;
        line-height: 1;
        cursor: pointer;
      }

      .profile-help-close:hover,
      .profile-help-close:focus-visible {
        color: var(--text, #111827);
        background: var(--header, #f8fafc);
      }

      .profile-help-example {
        margin-top: 16px;
        padding: 14px;
        border: 1px solid var(--line-soft, #eef2f7);
        border-radius: 16px;
        background: var(--header, #f8fafc);
      }

      .profile-help-example p:last-child {
        margin-bottom: 0;
      }

      .profile-help-note {
        color: var(--muted, #6b7280) !important;
        font-weight: 650;
      }

      @media (max-width: 700px) {
        .profile-help-panel {
          width: min(94vw, 520px);
          margin-top: 5vh;
          padding: 20px 16px 18px;
          border-radius: 20px;
        }

        .profile-help-panel h2 {
          font-size: 1.18rem;
        }

        .profile-help-panel p {
          font-size: 0.9rem;
        }
      }
    `;

    document.head.append(style);
  }

  function init() {
    const card = getHandicapCard();
    if (!card || card.querySelector(`.${HELP_BUTTON_CLASS}`)) return;

    const body = card.querySelector(".profile-card-body");
    const table = card.querySelector(".profile-table");
    if (!body || !table) return;

    addStyles();

    const button = document.createElement("button");
    button.type = "button";
    button.className = HELP_BUTTON_CLASS;
    button.textContent = "How is my handicap calculated?";

    button.addEventListener("click", () => {
      const modal = createModal();
      renderContent(modal, getCalculationData(card));
      openModal(modal);
    });

    table.insertAdjacentElement("afterend", button);
  }

  onReady(init);
})();
