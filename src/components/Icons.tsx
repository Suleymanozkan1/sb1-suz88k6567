/** Hafif, bağımlılıksız SVG ikon seti (orijinal sitedeki boxicons/remixicon karşılıkları) */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconGlobe = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 010 18a15 15 0 010-18" /></Base>
);
export const IconChart = (p: IconProps) => (
  <Base {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Base>
);
export const IconClock = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Base>
);
export const IconCursor = (p: IconProps) => (
  <Base {...p}><path d="M4 3l7 17 2.5-6.5L20 11z" /></Base>
);
export const IconCheck = (p: IconProps) => (<Base {...p}><path d="M20 6L9 17l-5-5" /></Base>);
export const IconChevronDown = (p: IconProps) => (<Base {...p}><path d="M6 9l6 6 6-6" /></Base>);
export const IconChevronLeft = (p: IconProps) => (<Base {...p}><path d="M15 18l-6-6 6-6" /></Base>);
export const IconChevronRight = (p: IconProps) => (<Base {...p}><path d="M9 18l6-6-6-6" /></Base>);
export const IconPlay = (p: IconProps) => (<Base {...p}><path d="M8 5l11 7-11 7z" /></Base>);
export const IconMenu = (p: IconProps) => (<Base {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Base>);
export const IconClose = (p: IconProps) => (<Base {...p}><path d="M18 6L6 18M6 6l12 12" /></Base>);
export const IconCalendar = (p: IconProps) => (
  <Base {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Base>
);
export const IconUsers = (p: IconProps) => (
  <Base {...p}><path d="M16 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 20v-2a4 4 0 00-3-3.87M16 3.13A4 4 0 0119 7a4 4 0 01-3 3.87" /></Base>
);
export const IconUser = (p: IconProps) => (
  <Base {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></Base>
);
export const IconWallet = (p: IconProps) => (
  <Base {...p}><path d="M3 7a2 2 0 012-2h12a2 2 0 012 2" /><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M16 13h2" /></Base>
);
export const IconReport = (p: IconProps) => (
  <Base {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 14h6M9 17h4" /></Base>
);
export const IconPalette = (p: IconProps) => (
  <Base {...p}><path d="M12 21a9 9 0 110-18c4.97 0 9 3.58 9 8 0 2.21-1.79 4-4 4h-1.5a1.5 1.5 0 00-1.06 2.56A1.5 1.5 0 0112 21z" /><circle cx="7.5" cy="11.5" r="1" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1" fill="currentColor" /><circle cx="15" cy="8.5" r="1" fill="currentColor" /></Base>
);
export const IconBuilding = (p: IconProps) => (
  <Base {...p}><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" /></Base>
);
export const IconSettings = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.2.61.76 1 1.4 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></Base>
);
export const IconGift = (p: IconProps) => (
  <Base {...p}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13M12 8S9.5 8 8.5 7A2 2 0 0112 5a2 2 0 013.5 2C14.5 8 12 8 12 8z" /></Base>
);
export const IconMessage = (p: IconProps) => (
  <Base {...p}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></Base>
);
export const IconMail = (p: IconProps) => (
  <Base {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 6 10-6" /></Base>
);
export const IconPhone = (p: IconProps) => (
  <Base {...p}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.1a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0122 16.9z" /></Base>
);
export const IconLock = (p: IconProps) => (
  <Base {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></Base>
);
export const IconLogout = (p: IconProps) => (
  <Base {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></Base>
);
export const IconPlus = (p: IconProps) => (<Base {...p}><path d="M12 5v14M5 12h14" /></Base>);
export const IconEdit = (p: IconProps) => (
  <Base {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" /></Base>
);
export const IconTrash = (p: IconProps) => (
  <Base {...p}><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6" /></Base>
);
export const IconSearch = (p: IconProps) => (
  <Base {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Base>
);
export const IconPrint = (p: IconProps) => (
  <Base {...p}><path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="7" /></Base>
);
export const IconDownload = (p: IconProps) => (
  <Base {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></Base>
);
export const IconShield = (p: IconProps) => (
  <Base {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></Base>
);
export const IconCopy = (p: IconProps) => (
  <Base {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></Base>
);
export const IconStar = (p: IconProps) => (
  <Base {...p}><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></Base>
);
export const IconLocation = (p: IconProps) => (
  <Base {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></Base>
);
export const IconTwitter = (p: IconProps) => (
  <Base {...p}><path d="M22 4.5a8.4 8.4 0 01-2.4.7 4.2 4.2 0 001.8-2.3 8.3 8.3 0 01-2.6 1A4.2 4.2 0 0011.6 8 11.9 11.9 0 013 3.5a4.2 4.2 0 001.3 5.6A4.1 4.1 0 012.4 8.6a4.2 4.2 0 003.4 4.1 4.2 4.2 0 01-1.9.1 4.2 4.2 0 003.9 2.9A8.4 8.4 0 012 17.5a11.9 11.9 0 006.4 1.9c7.7 0 12-6.5 12-12.1v-.6A8.5 8.5 0 0022 4.5z" /></Base>
);
export const IconFacebook = (p: IconProps) => (
  <Base {...p}><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" /></Base>
);
export const IconInstagram = (p: IconProps) => (
  <Base {...p}><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></Base>
);
export const IconYoutube = (p: IconProps) => (
  <Base {...p}><rect x="2" y="5" width="20" height="14" rx="4" /><path d="M10 9l5 3-5 3z" /></Base>
);
export const IconInfo = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8h.01" /></Base>
);
export const IconAlert = (p: IconProps) => (
  <Base {...p}><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4M12 17h.01" /></Base>
);
export const IconGrid = (p: IconProps) => (
  <Base {...p}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></Base>
);
export const IconList = (p: IconProps) => (
  <Base {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Base>
);

export const ICON_MAP = {
  globe: IconGlobe,
  chart: IconChart,
  clock: IconClock,
  cursor: IconCursor,
} as const;
