export type NavId =
  | "picks"
  | "trending"
  | "explore"
  | "labs"
  | "progress"
  | "ask"
  | "customize"
  | "settings";

const ITEMS: Array<{ id: NavId; label: string; icon: "today" | "explore" | "labs" | "shade" }> = [
  { id: "picks", label: "Today", icon: "today" },
  { id: "explore", label: "Explore", icon: "explore" },
  { id: "labs", label: "Labs", icon: "labs" },
  { id: "customize", label: "Shade", icon: "shade" },
];

function NavIcon({ name }: { name: (typeof ITEMS)[number]["icon"] }) {
  if (name === "today") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <path d="M3 7.5 8 3l5 4.5V13H3Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.5 13V9.5h3V13" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  if (name === "explore") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10.2 10.2 13.5 13.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  if (name === "labs") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <path d="M6 2h4M7 2v4L3.5 13h9L9 6V2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M4 8c0-2.5 1.6-4 4-4s4 1.5 4 4-1.6 4.5-4 4.5S4 10.5 4 8Z" fill="currentColor" />
      <path d="M5.2 5.2 3.2 3.4M10.8 5.2 12.8 3.4" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5.6" y="7.2" width="1.6" height="1.4" fill="#05090b" />
      <rect x="8.8" y="7.2" width="1.6" height="1.4" fill="#05090b" />
    </svg>
  );
}

interface Props {
  active: NavId | string;
  onChange: (id: NavId) => void;
}

export function Navigation({ active, onChange }: Props) {
  return (
    <nav className="devly-nav" aria-label="Devly">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`devly-nav-item ${active === item.id ? "active" : ""}`}
          onClick={() => onChange(item.id)}
          aria-current={active === item.id ? "page" : undefined}
        >
          <span className="devly-nav-icon">
            <NavIcon name={item.icon} />
          </span>
          <span className="devly-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
