export default function handicapHelpIntegration() {
  const assetVersion = String(Date.now());

  return {
    name: "handicap-help-loader",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        injectScript(
          "page",
          `
const handicapHelpAssetVersion = "${assetVersion}";
const handicapHelpStylesheetHref = "/handicap-help-dark-mode.css?v=" + handicapHelpAssetVersion;
const handicapHelpScriptSrc = "/handicap-help.js?v=" + handicapHelpAssetVersion;

if (!document.querySelector('link[data-handicap-help-stylesheet]')) {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = handicapHelpStylesheetHref;
  stylesheet.dataset.handicapHelpStylesheet = "true";
  document.head.append(stylesheet);
}

if (!document.querySelector('script[data-handicap-help-script]')) {
  const script = document.createElement("script");
  script.src = handicapHelpScriptSrc;
  script.defer = true;
  script.dataset.handicapHelpScript = "true";
  document.body.append(script);
}
          `
        );
      },
    },
  };
}
