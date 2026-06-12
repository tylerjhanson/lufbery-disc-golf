const COURSE_RECORDS_FIX_STYLE = `
  .date-link-inline {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    flex-wrap: nowrap !important;
  }

  .date-link,
  .date-link span,
  .date-link-inline,
  .date-link-inline span {
    color: var(--accent, #2563eb) !important;
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

const COURSE_RECORDS_FIX_SCRIPT = `
(() => {
  const TEXT_PROPS = [
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'line-height',
    'letter-spacing',
    'color',
    'text-align',
    'text-decoration-line',
    'text-decoration-style',
    'text-decoration-thickness',
    'text-decoration-color',
    'text-underline-offset'
  ];
  const CELL_PROPS = [
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'border-bottom-color',
    'border-bottom-style',
    'border-bottom-width',
    'vertical-align'
  ];

  function copyProps(from, to, props) {
    if (!from || !to) return;
    const styles = window.getComputedStyle(from);
    props.forEach((prop) => {
      to.style.setProperty(prop, styles.getPropertyValue(prop), 'important');
    });
  }

  function syncCourseRecordLeaderStyles() {
    const referenceRow = document.querySelector('#break50-table tbody tr');
    if (!referenceRow) return;
    const referenceCells = Array.from(referenceRow.children).slice(0, 3);
    if (referenceCells.length < 3) return;
    const referencePlayerLink = referenceCells[0].querySelector('.player-button') || referenceCells[0].querySelector('a');
    const referenceDateLink = referenceCells[2].querySelector('.date-link') || referenceCells[2].querySelector('a');

    document.querySelectorAll('table[data-leader-table] tbody tr').forEach((row) => {
      Array.from(row.children).slice(0, 3).forEach((cell, index) => {
        copyProps(referenceCells[index], cell, CELL_PROPS);
        copyProps(referenceCells[index], cell, TEXT_PROPS);
      });

      const playerLink = row.children[0]?.querySelector('.player-button') || row.children[0]?.querySelector('a');
      copyProps(referencePlayerLink || referenceCells[0], playerLink, TEXT_PROPS);

      const dateLink = row.children[2]?.querySelector('.date-link') || row.children[2]?.querySelector('a');
      if (dateLink) copyProps(referenceDateLink || referenceCells[2], dateLink, TEXT_PROPS);
    });
  }

  let syncQueued = false;
  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      syncCourseRecordLeaderStyles();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', queueSync, { once: true });
  } else {
    queueSync();
  }

  const observer = new MutationObserver(queueSync);
  document.querySelectorAll('table[data-leader-table] tbody').forEach((tbody) => {
    observer.observe(tbody, { childList: true, subtree: true });
  });

  document.getElementById('yearFilter')?.addEventListener('change', queueSync);
})();
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
    .on("body", {
      element(element) {
        element.append(`<script>${COURSE_RECORDS_FIX_SCRIPT}</script>`, { html: true });
      },
    })
    .transform(response);
}
