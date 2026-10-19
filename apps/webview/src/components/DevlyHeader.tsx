import type { ReactNode } from "react";
import { JobMenu } from "./JobDock";

interface Props {
  title?: string;
  onSettings?: () => void;
  onProgress?: () => void;
  right?: ReactNode;
}

export function DevlyHeader({ title = "Devly", onSettings, onProgress, right }: Props) {
  const home = title === "Devly";
  return (
    <header className="devly-header">
      <div className="devly-brand">
        <svg className="devly-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <rect width="24" height="24" rx="4" fill="#0b1317" stroke="#164249" />
          <path d="M6 12c0-2.4 1.5-4 4-4h4c2.5 0 4 1.6 4 4v3H6v-3Z" fill="#070b0d" />
          <path d="M7.2 10.2 5.5 7.6M16.8 10.2 18.5 7.6" stroke="#56dddd" strokeWidth="1.2" />
          <rect x="8.2" y="11.2" width="2.2" height="1.6" fill="#56dddd" />
          <rect x="13.6" y="11.2" width="2.2" height="1.6" fill="#56dddd" />
        </svg>
        <div>
          <div className="devly-title">{home ? "Devly" : title}</div>
          {home && <div className="meta">A home for curious developers</div>}
        </div>
      </div>
      <div className="devly-header-actions">
        <JobMenu />
        {right}
        {onProgress && (
          <button type="button" className="btn-icon" onClick={onProgress} aria-label="Progress" title="Progress">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M3 12V8M8 12V4M13 12V6" />
            </svg>
          </button>
        )}
        {onSettings && (
          <button type="button" className="btn-icon" onClick={onSettings} aria-label="Settings" title="Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
