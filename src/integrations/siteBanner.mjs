import { siteBanner } from "../data/siteBanner.js";

export default function siteBannerIntegration() {
  return {
    name: "site-banner",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        if (!siteBanner.enabled) return;

        injectScript(
          "page",
          `
const siteBanner = ${JSON.stringify(siteBanner)};

function initSiteBanner() {
  const bannerId = siteBanner.id || "default";
  const storageKey = \`lufbery-site-banner-dismissed-\${bannerId}\`;

  if (siteBanner.dismissible && localStorage.getItem(storageKey) === "true") return;
  if (document.getElementById("siteBanner")) return;

  const style = document.createElement("style");
  style.textContent = \`
    .site-banner {
      width: 100%;
      background: #b91c1c;
      color: #ffffff;
      border-bottom: 1px solid rgba(255, 255, 255, 0.18);
      position: relative;
      z-index: 70;
    }

    .site-banner-inner {
      width: min(100%, 1440px);
      margin: 0 auto;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }

    .site-banner-copy {
      min-width: 0;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.95rem;
      line-height: 1.35;
    }

    .site-banner-copy strong {
      flex: 0 0 auto;
      font-weight: 800;
    }

    .site-banner-copy span {
      min-width: 0;
    }

    .site-banner-close {
      width: 32px;
      height: 32px;
      flex: 0 0 32px;
      border: 0;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.16);
      color: #ffffff;
      font-size: 1.35rem;
      line-height: 1;
      cursor: pointer;
    }

    .site-banner-close:hover,
    .site-banner-close:focus-visible {
      background: rgba(255, 255, 255, 0.28);
    }

    @media (max-width: 700px) {
      .site-banner-inner {
        padding: 9px 10px;
        align-items: flex-start;
        gap: 10px;
      }

      .site-banner-copy {
        display: block;
        font-size: 0.86rem;
      }

      .site-banner-copy strong {
        display: block;
        margin-bottom: 2px;
      }

      .site-banner-close {
        width: 30px;
        height: 30px;
        flex-basis: 30px;
      }
    }
  \`;

  const banner = document.createElement("div");
  banner.id = "siteBanner";
  banner.className = "site-banner";

  const inner = document.createElement("div");
  inner.className = "site-banner-inner";

  const copy = document.createElement("p");
  copy.className = "site-banner-copy";

  if (siteBanner.label) {
    const label = document.createElement("strong");
    label.textContent = siteBanner.label;
    copy.append(label);
  }

  const message = document.createElement("span");
  message.textContent = siteBanner.message || "";
  copy.append(message);

  inner.append(copy);

  if (siteBanner.dismissible) {
    const closeButton = document.createElement("button");
    closeButton.className = "site-banner-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Dismiss banner");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => {
      localStorage.setItem(storageKey, "true");
      banner.remove();
    });
    inner.append(closeButton);
  }

  banner.append(inner);
  document.body.prepend(style);
  document.body.prepend(banner);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSiteBanner, { once: true });
} else {
  initSiteBanner();
}
          `
        );
      },
    },
  };
}
