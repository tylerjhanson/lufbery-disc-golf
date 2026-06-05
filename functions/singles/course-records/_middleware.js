const COURSE_RECORDS_FIX_STYLE = `
  table[data-leader-table] {
    width: 100% !important;
    border-collapse: separate !important;
    border-spacing: 0 !important;
    table-layout: fixed !important;
  }

  table[data-leader-table] col.name-col {
    width: 46% !important;
  }

  table[data-leader-table] col.score-col {
    width: 20% !important;
  }

  table[data-leader-table] col.date-col {
    width: 34% !important;
  }

  table[data-leader-table] thead th {
    background: var(--header, #f8fafc) !important;
    color: var(--muted, #6b7280) !important;
    font-size: 0.86rem !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.04em !important;
    padding: 14px 16px !important;
    border-bottom: 1px solid var(--line, #e5e7eb) !important;
    text-align: center !important;
  }

  table[data-leader-table] thead th:first-child {
    text-align: left !important;
  }

  table[data-leader-table] tbody td {
    padding: 15px 16px !important;
    border-bottom: 1px solid var(--line-soft, #eef2f7) !important;
    font-size: 1rem !important;
    text-align: center !important;
    vertical-align: middle !important;
  }

  table[data-leader-table] tbody tr:nth-child(even) td {
    background: #fcfdff !important;
  }

  table[data-leader-table] tbody tr:hover td {
    background: var(--hover, #f9fbff) !important;
  }

  table[data-leader-table] tbody td:first-child {
    text-align: left !important;
    font-weight: 600 !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }

  table[data-leader-table] a.player-button,
  table[data-leader-table] a.date-link {
    color: var(--accent, #2563eb) !important;
    text-decoration: none !important;
    font-weight: 600 !important;
  }

  table[data-leader-table] a.player-button:hover,
  table[data-leader-table] a.date-link:hover {
    text-decoration: underline !important;
  }

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

  @media (max-width: 700px) {
    table[data-leader-table] col.name-col { width: 42% !important; }
    table[data-leader-table] col.score-col { width: 22% !important; }
    table[data-leader-table] col.date-col { width: 36% !important; }
    table[data-leader-table] thead th {
      font-size: 0.72rem !important;
      letter-spacing: 0.02em !important;
      padding: 10px 6px !important;
    }
    table[data-leader-table] tbody td {
      font-size: 0.9rem !important;
      padding: 10px 6px !important;
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
