// Набор линейных иконок 24×24 (stroke = currentColor).
const PATHS = {
  logo: '<path d="M12 3v15"/><path d="M12 4l7 11h-7"/><path d="M12 7l-6 8h6"/><path d="M4 19h16l-2.5 2.5h-11z"/>',
  cart: '<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  telegram: '<path d="M21.2 4.6 2.9 11.7c-.8.3-.8 1.4 0 1.7l4.5 1.5 1.7 5.3c.2.7 1.1.9 1.6.4l2.5-2.4 4.7 3.4c.6.4 1.4.1 1.6-.6l3.2-14.9c.2-1-.7-1.8-1.5-1.5z"/><path d="m7.4 14.9 9.8-6.6-6.8 8.1"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  infinity: '<path d="M12 12c-2-2.7-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1.3 6-4zm0 0c2 2.7 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.3-6 4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8S10.5 4 8 4a2 2 0 0 0 0 4h4zm0 0s1.5-4 4-4a2 2 0 0 1 0 4h-4z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3"/><path d="M20 20v-4h-4"/>',
  social: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  ads: '<path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M17 8.5a5 5 0 0 1 0 7"/>',
  parsing: '<ellipse cx="12" cy="5.5" rx="8" ry="2.8"/><path d="M4 5.5v13c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8v-13"/><path d="M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8"/>',
  marketplaces: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  seo: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  other: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/>',
  sbp: '<path d="M4 4l5 3v10l-5 3z"/><path d="M9 7l11-3-5 8 5 8-11-3"/>',
  crypto: '<circle cx="12" cy="12" r="9"/><path d="M9.5 7.5h4a2 2 0 0 1 0 4h-4zm0 4h4.5a2 2 0 0 1 0 4H9.5zM9.5 7.5v8M11 6v1.5M11 15.5V17"/>',
  more: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
};

export function icon(name) {
  const paths = PATHS[name];
  if (!paths) return '';
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.firstElementChild) el.innerHTML = icon(el.dataset.icon);
  });
}
