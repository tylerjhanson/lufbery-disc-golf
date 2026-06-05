const COURSE_RECORDS_FIX_STYLE = `
  .date-link-inline {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    flex-wrap: nowrap !important;
  }

  .udisc-icon {
    height: 0.82em !important;
    width: auto !important;
    max-width: 1em !important;
    display: inline-block !important;
    vertical-align: middle !important;
    flex: 0 0 auto !important;
    opacity: 0.98 !important;
    transform: translateY(-0.11em) !important;
  }

  .udisc-icon--dark {
    display: none !important;
  }

  html.dark .udisc-icon--light,
  html[data-theme="dark"] .udisc-icon--light,
  body.dark .udisc-icon--light,
  body[data-theme="dark"] .udisc-icon--light {
    display: none !important;
  }

  html.dark .udisc-icon--dark,
  html[data-theme="dark"] .udisc-icon--dark,
  body.dark .udisc-icon--dark,
  body[data-theme="dark"] .udisc-icon--dark {
    display: inline-block !important;
  }

  @media (prefers-color-scheme: dark) {
    html[data-theme="system"] .udisc-icon--light {
      display: none !important;
    }
    html[data-theme="system"] .udisc-icon--dark {
      display: inline-block !important;
    }
  }
`;

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append(`<style>${COURSE_RECORDS_FIX_STYLE}</style>`, { html: true });
      },
    })
    .transform(response);
}
