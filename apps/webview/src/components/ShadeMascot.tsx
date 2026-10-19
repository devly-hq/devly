import type { CSSProperties } from "react";

export type ShadeMood =
  | "idle"
  | "happy"
  | "thinking"
  | "coding"
  | "excited"
  | "confused"
  | "error"
  | "success"
  | "explaining"
  | "pointing"
  | "celebrating"
  | "sleeping"
  | "loading";

/** Map extension shadeState strings → mood */
export function mapShadeState(state?: string): ShadeMood {
  switch ((state || "IDLE").toUpperCase()) {
    case "HAPPY":
      return "happy";
    case "THINKING":
      return "thinking";
    case "TYPING":
      return "coding";
    case "EXCITED":
      return "excited";
    case "CONFUSED":
      return "confused";
    case "ERROR":
      return "error";
    case "SUCCESS":
      return "success";
    case "EXPLAINING":
      return "explaining";
    case "POINTING":
      return "pointing";
    case "CELEBRATING":
      return "celebrating";
    case "SLEEPING":
      return "sleeping";
    case "LOADING":
      return "loading";
    default:
      return "idle";
  }
}

interface Props {
  mood?: ShadeMood;
  size?: number;
  name?: string;
  hidden?: boolean;
  className?: string;
}

/**
 * Shade — a small black pixel cat with phosphor eyes, sitting at a laptop.
 * Motion is CSS-only and disabled under prefers-reduced-motion.
 */
export function ShadeMascot({
  mood = "idle",
  size = 88,
  name = "Shade",
  hidden,
  className,
}: Props) {
  if (hidden) return null;

  const style = { ["--shade-size" as string]: `${size}px` } as CSSProperties;
  const eyesClosed = mood === "sleeping";
  const eyesHappy = mood === "happy" || mood === "success" || mood === "celebrating" || mood === "excited";
  const eyesError = mood === "error";

  return (
    <div
      className={`shade-mascot shade-${mood} ${className ?? ""}`}
      style={style}
      role="img"
      aria-label={`${name}, ${mood}`}
    >
      <svg viewBox="0 0 88 80" width={size} height={size} aria-hidden>
        <g className="shade-body" fill="var(--devly-shade-body)">
          <path d="M18 36 L26 16 L36 32 Z" />
          <path d="M52 32 L62 16 L70 36 Z" />
          <path d="M24 28 L28 20 L32 30 Z" fill="#164249" />
          <path d="M56 30 L60 20 L64 28 Z" fill="#164249" />
          <rect x="16" y="30" width="56" height="34" rx="14" />
          <rect x="22" y="58" width="10" height="8" />
          <rect x="56" y="58" width="10" height="8" />
        </g>

        <g className="shade-eyes">
          {eyesError ? (
            <>
              <path d="M28 42 L38 50 M38 42 L28 50" stroke="var(--devly-error)" strokeWidth="2" />
              <path d="M50 42 L60 50 M60 42 L50 50" stroke="var(--devly-error)" strokeWidth="2" />
            </>
          ) : eyesClosed || eyesHappy ? (
            <>
              <path d="M28 46 Q33 40 38 46" fill="none" stroke="var(--devly-shade-eye)" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M50 46 Q55 40 60 46" fill="none" stroke="var(--devly-shade-eye)" strokeWidth="2.4" strokeLinecap="round" />
            </>
          ) : (
            <>
              <rect className="shade-eye" x="28" y="40" width="10" height="8" rx="1" fill="var(--devly-shade-eye)" />
              <rect className="shade-eye" x="50" y="40" width="10" height="8" rx="1" fill="var(--devly-shade-eye)" />
              <rect className="shade-pupil" x="34" y="42" width="3" height="4" fill="#05090b" />
              <rect className="shade-pupil" x="56" y="42" width="3" height="4" fill="#05090b" />
            </>
          )}
        </g>

        <rect x="41" y="52" width="6" height="3" fill="var(--devly-shade-glow)" opacity="0.7" />

        {(mood === "thinking" || mood === "confused") && (
          <text x="70" y="22" fill="var(--devly-shade-glow)" fontSize="12" fontFamily="var(--devly-mono)">
            ?
          </text>
        )}
        {mood === "sleeping" && (
          <text x="68" y="20" className="shade-zzz" fill="var(--devly-shade-glow)" fontSize="10" fontFamily="var(--devly-mono)">
            z
          </text>
        )}
        {(mood === "success" || mood === "celebrating") && (
          <g className="shade-confetti">
            <rect x="8" y="18" width="3" height="3" fill="var(--devly-shade-glow)" />
            <rect x="76" y="14" width="3" height="3" fill="var(--devly-violet)" />
            <rect x="12" y="28" width="2" height="2" fill="var(--devly-success)" />
            <rect x="74" y="28" width="2" height="2" fill="var(--devly-accent-hover)" />
          </g>
        )}

        <g className="shade-laptop">
          <rect x="18" y="64" width="52" height="12" fill="#101b20" stroke="var(--devly-border)" strokeWidth="1" />
          <rect x="22" y="66" width="44" height="6" fill="#071416" />
          <rect className="shade-cursor" x="24" y="68" width="10" height="2" fill="var(--devly-shade-glow)" />
          <rect x="36" y="68" width="6" height="2" fill="#164249" />
          <rect x="14" y="75" width="60" height="3" fill="#0b1317" />
        </g>
      </svg>
    </div>
  );
}
