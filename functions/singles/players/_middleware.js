const ROUND_HISTORY_FIX_STYLE = `
  .profile-round-table thead tr:first-child th,
  .profile-round-table thead tr:first-child .profile-round-sort {
    color: var(--text, #111827) !important;
  }

  html[data-theme="dark"] .profile-round-score--bogey,
  html[data-theme="dark"] .profile-round-score--double,
  html[data-theme="dark"] .profile-round-score--triple,
  html[data-theme="dark"] .profile-round-score--bogey *,
  html[data-theme="dark"] .profile-round-score--double *,
  html[data-theme="dark"] .profile-round-score--triple * {
    color: #111827 !important;
  }

  @media (prefers-color-scheme: dark) {
    html[data-theme="system"] .profile-round-score--bogey,
    html[data-theme="system"] .profile-round-score--double,
    html[data-theme="system"] .profile-round-score--triple,
    html[data-theme="system"] .profile-round-score--bogey *,
    html[data-theme="system"] .profile-round-score--double *,
    html[data-theme="system"] .profile-round-score--triple * {
      color: #111827 !important;
    }
  }

  @media (max-width: 900px) and (orientation: landscape) {
    .profile-round-table {
      min-width: 0 !important;
      table-layout: fixed !important;
    }
    .profile-round-col-date { width: 38px !important; }
    .profile-round-col-total { width: 27px !important; }
    .profile-round-col-hole { width: 23px !important; }
    .profile-round-col-round { width: 32px !important; }
    .profile-round-table th,
    .profile-round-table td {
      padding: 5px 0 !important;
      font-size: 0.60rem !important;
      letter-spacing: -0.04em !important;
    }
    .profile-round-table th:first-child,
    .profile-round-table td:first-child {
      width: 38px !important;
      font-size: 0.50rem !important;
      letter-spacing: -0.06em !important;
    }
    .profile-round-table td:first-child .profile-link {
      font-size: inherit !important;
      letter-spacing: inherit !important;
    }
    .profile-round-table th:nth-child(2),
    .profile-round-table td:nth-child(2) {
      width: 27px !important;
      font-size: 0.56rem !important;
      letter-spacing: -0.04em !important;
      font-weight: 750 !important;
      text-align: center !important;
    }
    .profile-round-table th:last-child,
    .profile-round-table td:last-child {
      width: 32px !important;
      font-size: 0.56rem !important;
      letter-spacing: -0.04em !important;
      font-weight: 750 !important;
      text-align: center !important;
    }
    .profile-round-table thead tr:first-child th,
    .profile-round-table thead tr:first-child .profile-round-sort {
      font-size: 0.60rem !important;
      color: var(--text, #111827) !important;
    }
    .profile-round-table thead tr:first-child th:first-child,
    .profile-round-table thead tr:first-child th:nth-child(2),
    .profile-round-table thead tr:first-child th:first-child .profile-round-sort,
    .profile-round-table thead tr:first-child th:nth-child(2) .profile-round-sort {
      font-size: 0.56rem !important;
      transform: translateY(10px);
    }
    .profile-round-table thead tr:first-child th:last-child,
    .profile-round-table thead tr:first-child th:last-child .profile-round-sort {
      font-size: 0.56rem !important;
      text-align: center !important;
    }
    .profile-round-table thead tr:nth-child(2) th {
      font-size: 0.56rem !important;
      border-bottom: 1px solid var(--line-soft, #eef2f7) !important;
    }
    .profile-round-table thead tr:nth-child(2) th:first-child,
    .profile-round-table thead tr:nth-child(2) th:nth-child(2) {
      color: transparent !important;
    }
    .profile-round-score {
      min-width: 18px !important;
      height: 18px !important;
      padding: 0 2px !important;
      font-size: 0.60rem !important;
    }
  }
`;

const ROUND_HISTORY_FIX_SCRIPT = `
(() => {
  const root = document.querySelector('[data-round-history-card]');
  if (!root || root.dataset.roundHistoryRefined === 'true') return;
  root.dataset.roundHistoryRefined = 'true';

  root.querySelectorAll('[data-round-sort="toPar"]').forEach((button) => {
    button.textContent = 'Tot.';
  });

  root.querySelectorAll('.profile-round-table').forEach((table) => {
    const rows = table.tHead?.rows;
    if (!rows || rows.length < 2 || table.dataset.headerRefined === 'true') return;
    table.dataset.headerRefined = 'true';

    if (!table.querySelector('colgroup')) {
      const colgroup = document.createElement('colgroup');
      const classes = ['profile-round-col-date', 'profile-round-col-total'];
      for (let i = 0; i < 18; i += 1) classes.push('profile-round-col-hole');
      classes.push('profile-round-col-round');
      classes.forEach((className) => {
        const col = document.createElement('col');
        col.className = className;
        colgroup.appendChild(col);
      });
      table.insertBefore(colgroup, table.firstChild);
    }

    const secondRow = rows[1];
    if (secondRow.cells[0]) secondRow.cells[0].textContent = '';
    if (secondRow.cells[1]) secondRow.cells[1].textContent = '';
  });

  const state = { key: 'date', direction: 'desc' };
  function value(item, key) {
    if (key === 'date') return item.dataset.sortDate || '';
    const attr = key === 'toPar' ? 'sortToPar' : key === 'total' ? 'sortTotal' : 'sort' + key.charAt(0).toUpperCase() + key.slice(1);
    const number = Number(item.dataset[attr]);
    return Number.isFinite(number) ? number : 9999;
  }

  function sortRoundList(key) {
    state.direction = state.key === key && state.direction === 'asc' ? 'desc' : 'asc';
    state.key = key;
    root.querySelectorAll('[data-round-list]').forEach((list) => {
      const items = Array.from(list.querySelectorAll('[data-round-item]'));
      items.sort((a, b) => {
        const av = value(a, key);
        const bv = value(b, key);
        const primary = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
        if (primary) return state.direction === 'asc' ? primary : -primary;
        return String(b.dataset.sortDate || '').localeCompare(String(a.dataset.sortDate || ''));
      });
      items.forEach((item) => list.appendChild(item));
    });
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-round-sort]');
    if (!button || !root.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sortRoundList(button.dataset.roundSort || 'date');
  }, true);
})();
`;

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  return new HTMLRewriter()
    .on('head', {
      element(element) {
        element.append(`<style>${ROUND_HISTORY_FIX_STYLE}</style>`, { html: true });
      },
    })
    .on('body', {
      element(element) {
        element.append(`<script>${ROUND_HISTORY_FIX_SCRIPT}</script>`, { html: true });
      },
    })
    .transform(response);
}
