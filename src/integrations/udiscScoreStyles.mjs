export default function udiscScoreStylesIntegration() {
  return {
    name: "udisc-score-styles",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        injectScript(
          "page",
          `
(() => {
  const styleId = "udisc-score-styles";
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = ` + "`" + `
    /* UDisc uses rounded squares for bogey-or-worse score chips. */
    .profile-round-score--bogey,
    .profile-round-score--double,
    .profile-round-score--triple,
    .round-score--bogey,
    .round-score--double,
    .round-score--triple,
    .score--bogey,
    .score--double,
    .score--triple,
    .score-cell--bogey,
    .score-cell--double,
    .score-cell--triple,
    [class*="score"][class*="bogey"],
    [class*="score"][class*="double"],
    [class*="score"][class*="triple"] {
      border-radius: 8px !important;
    }
  ` + "`" + `;

  document.head.append(style);
})();
          `
        );
      },
    },
  };
}
