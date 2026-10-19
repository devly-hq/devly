import type { TrendingRepo } from "@devly/protocol";
import { PrimaryButton, GhostButton } from "./Buttons";

interface Props {
  repo: TrendingRepo;
  busy?: boolean;
  disabled?: boolean;
  busyLabel?: string;
  onTryLive: () => void;
  onOpenGithub: () => void;
}

export function TrendingRepoCard({ repo, busy, disabled, busyLabel, onTryLive, onOpenGithub }: Props) {
  return (
    <article className="topic-card card">
      <div className="topic-card-top">
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className="pill accent">{repo.category}</span>
          {repo.language && <span className="pill">{repo.language}</span>}
          <span className="pill">★ {formatStars(repo.stars)}</span>
          {repo.runHints.slice(0, 2).map((h) => (
            <span key={h} className="pill">
              {h}
            </span>
          ))}
        </div>
      </div>
      <h3 className="h-card" style={{ marginTop: 8 }}>
        {repo.fullName}
      </h3>
      <p className="topic-desc muted">{repo.description || "No description from GitHub yet."}</p>
      <p className="card-note">Try Live downloads this repository and runs it on your computer. You stay in Devly.</p>
      <div className="topic-card-actions">
        <PrimaryButton disabled={busy || disabled} onClick={onTryLive}>
          {busy ? busyLabel ?? "Working…" : "Try Live"}
        </PrimaryButton>
        <GhostButton onClick={onOpenGithub}>GitHub</GhostButton>
      </div>
    </article>
  );
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
