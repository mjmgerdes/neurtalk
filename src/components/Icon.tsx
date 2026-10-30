// Small stroke icon set. Decorative by default (aria-hidden); pair with text.
const PATHS = {
  check: "M4 10.5l4 4 8-9",
  speaker: "M4 8v4h3l4 3V5L7 8H4zM14 7.5a3.5 3.5 0 010 5M16 5a7 7 0 010 10",
  lock: "M6 9V7a4 4 0 018 0v2M5 9h10v8H5z",
  phone: "M7 2.5h6a1 1 0 011 1v13a1 1 0 01-1 1H7a1 1 0 01-1-1v-13a1 1 0 011-1zM9.5 15h1",
  pencil: "M13 4l3 3-8.5 8.5H4.5v-3L13 4z",
  close: "M5 5l10 10M15 5L5 15",
  play: "M7 5l8 5-8 5V5z",
  alert: "M10 3l8 14H2L10 3zM10 8v4M10 14.5v.5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <path d="M7 7.5L16.5 15.5M7 16L12 12" stroke="var(--mark-line)" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="7" cy="7.5" r="2" fill="var(--mark-dot)" />
      <circle cx="16.5" cy="15.5" r="2" fill="var(--mark-dot)" />
      <circle cx="7" cy="16" r="2" fill="var(--mark-dot)" />
    </svg>
  );
}

/** Operational status: filled dot = good, hollow ring = not. Never color alone — always with text. */
export function StatusDot({ ok }: { ok: boolean | null }) {
  return <span className={`status-dot ${ok ? "is-ok" : ok === false ? "is-off" : "is-pending"}`} aria-hidden="true" />;
}
