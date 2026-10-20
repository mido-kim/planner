const FLAG = '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5z" fill="currentColor"/>';

const svg = (paths, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  home: svg('<path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>'),
  prev: svg('<path d="M15 18l-6-6 6-6"/>'),
  next: svg('<path d="M9 18l6-6-6-6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  tasks: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9.5l1.5 1.5L11 8.5M14 10h3M7 15h10"/>'),
  settings: svg('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>'),
  repeat: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>', 12),
  up: svg('<path d="M12 19V5M5 12l7-7 7 7"/>', 11),
  down: svg('<path d="M12 5v14M19 12l-7 7-7-7"/>', 11),
  cloud: svg('<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.34 9.5 4.75 4.75 0 0 0 7 19z"/>', 16),
  device: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>', 16),
  flag: svg(FLAG, 11),
  flagBtn: svg(FLAG, 16),
  event: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M12 10.5v7M8.5 14h7"/>', 16),
  task: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>', 16),
  pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', 16),
  dockRight: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M14 4v16"/>', 18),
  dockBottom: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 13h18"/>', 18),
  tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>', 16),
  palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.1-.4-1.2.4-2.4 1.7-2.4H18a3 3 0 0 0 3-3c0-5-4-10.5-9-10.5z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>', 16),
};
