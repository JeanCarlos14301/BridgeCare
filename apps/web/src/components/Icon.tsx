import type { ReactNode } from "react";

// Small stroke icon set drawn for BridgeCare; inline SVG keeps the CSP (`default-src 'self'`) intact.
const PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  minus: <path d="M6 12h12" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.4v.4M12 16.8v.2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5L2.5 20h19L12 3.5z" />
      <path d="M12 10v4.5M12 17.3v.2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.2" />
    </>
  ),
  shield: <path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" />,
  shieldCheck: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  shieldAlert: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" />
      <path d="M12 8.5v4M12 15.3v.2" />
    </>
  ),
  file: (
    <>
      <path d="M6.5 3h7.5l4.5 4.5V21h-12z" />
      <path d="M14 3v4.5h4.5M9.5 12.5h5M9.5 16h5" />
    </>
  ),
  notEqual: <path d="M5 9h14M5 15h14M15.5 4.5l-7 15" />,
  dashedCircle: <circle cx="12" cy="12" r="8.5" strokeDasharray="3.2 3.2" />,
  cloudOff: (
    <>
      <path d="M7 18.5h9.5a3.8 3.8 0 0 0 1.2-7.4A6 6 0 0 0 6.4 9.6 4.5 4.5 0 0 0 7 18.5z" />
      <path d="M4 4l16 16" />
    </>
  ),
  pill: (
    <g transform="rotate(-45 12 12)">
      <rect x="3" y="8.5" width="18" height="7" rx="3.5" />
      <path d="M12 8.5v7" />
    </g>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15.5" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  pulse: <path d="M3 12h4l2.5-6 4.5 12 2.5-6H21" />,
  utensils: <path d="M7 3v5.5a2.5 2.5 0 0 0 5 0V3M9.5 3v18M17 3c-2 1.8-2.3 6.5 0 8.5V21" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 7.6-1.7" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z" />,
  zap: <path d="M13 2.5L4.5 14H11l-1 7.5L18.5 10H12l1-7.5z" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  userCheck: (
    <>
      <circle cx="9" cy="8" r="3.8" />
      <path d="M2.5 20.5a6.5 6.5 0 0 1 13 0M16 11.5l2 2 4-4" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8.5V3.5h10v5" />
      <rect x="3" y="8.5" width="18" height="8" rx="2" />
      <path d="M7 14h10v6.5H7z" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M10 10h4v4h-4zM9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" />
    </>
  ),
  logout: <path d="M14.5 4H19v16h-4.5M10 8l-4 4 4 4M6 12h10" />,
  quote: <path d="M5 16.5V12c0-3 1.5-5 4.5-5.5M5 12h4v4.5H5zM14 16.5V12c0-3 1.5-5 4.5-5.5M14 12h4v4.5h-4z" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
