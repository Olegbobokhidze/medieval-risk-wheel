import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
  ...p,
});

export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const IconMinus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
/** Herald's horn (sound on). */
export const IconHorn = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 10v4h3l9 5V5L6 10z" />
    <path d="M18 9c1.3 1.6 1.3 4.4 0 6" />
  </svg>
);
export const IconHornMute = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 10v4h3l9 5V5L6 10z" />
    <path d="m21 9-4 6M17 9l4 6" />
  </svg>
);
/** Rolled scroll (rules). */
export const IconScroll = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1z" />
    <path d="M10 9h4M10 12h4" />
  </svg>
);
/** Astrolabe (inspector). */
export const IconAstrolabe = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="13" r="7" />
    <circle cx="12" cy="13" r="3" />
    <path d="M12 3v3M5 13h14M7.5 8.5l9 9" />
  </svg>
);
