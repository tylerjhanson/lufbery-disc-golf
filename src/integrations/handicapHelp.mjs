export default function handicapHelpIntegration() {
  return {
    name: "handicap-help-loader",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        injectScript(
          "page",
          `
if (!document.querySelector('script[src="/handicap-help.js"]')) {
  const script = document.createElement("script");
  script.src = "/handicap-help.js";
  script.defer = true;
  document.body.append(script);
}
          `
        );
      },
    },
  };
}
