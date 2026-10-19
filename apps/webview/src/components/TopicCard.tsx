import type { Topic, TrendingRepo } from "@devly/protocol";
import { OverflowMenu } from "./OverflowMenu";

interface Props {
  topic: Topic;
  index?: number;
  lane?: string;
  onBuild: () => void;
  onSave?: () => void;
  onHide?: () => void;
  onKnown?: () => void;
  onOpen?: () => void;
}

export function TopicCard({ topic, index, lane, onBuild, onSave, onHide, onKnown, onOpen }: Props) {
  const items = [
    onSave ? { id: "save", label: "Save for later", onSelect: onSave } : null,
    onHide ? { id: "hide", label: "Hide", onSelect: onHide } : null,
    onKnown ? { id: "known", label: "I already know this", onSelect: onKnown } : null,
  ].filter(Boolean) as Array<{ id: string; label: string; onSelect: () => void }>;

  return (
    <article className="topic-card card">
      <div className="topic-card-top">
        <div className="topic-kicker">
          {index != null && <span className="topic-index">{String(index).padStart(2, "0")}</span>}
          {lane && <span className="lane">{lane}</span>}
          <span>{topic.category}</span>
          <span>{topic.difficulty}</span>
          <span className="topic-time">{topic.estimatedMinutes} min</span>
        </div>
        {items.length > 0 && <OverflowMenu items={items} />}
      </div>
      <button type="button" className="topic-card-title-btn" onClick={onOpen ?? onBuild}>
        <h3 className="h-card">{topic.title}</h3>
      </button>
      <p className="topic-desc muted">{topic.description}</p>
      <p className="card-note">Let's Build makes a small lab so you can learn this by building it.</p>
      <div className="topic-card-actions">
        <button type="button" className="btn btn-outline" onClick={onBuild}>
          Let's Build <span aria-hidden>→</span>
        </button>
      </div>
    </article>
  );
}

export function RepoPickCard({
  repo,
  index,
  busy,
  disabled,
  busyLabel,
  onTryLive,
  onOpen,
}: {
  repo: TrendingRepo;
  index?: number;
  busy?: boolean;
  disabled?: boolean;
  busyLabel?: string;
  onTryLive: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="topic-card card">
      <div className="topic-card-top">
        <div className="topic-kicker">
          {index != null && <span className="topic-index">{String(index).padStart(2, "0")}</span>}
          <span className="lane">Trend</span>
          <span>{repo.language ?? repo.category}</span>
          <span className="topic-time">★ {formatStars(repo.stars)}</span>
        </div>
      </div>
      <button type="button" className="topic-card-title-btn" onClick={onOpen}>
        <h3 className="h-card">{repo.fullName}</h3>
      </button>
      <p className="topic-desc muted">{repo.description || "A trending repository you can clone and run."}</p>
      <p className="card-note">Try Live downloads this repository and runs it on your computer. You stay in Devly.</p>
      <div className="topic-card-actions">
        <button type="button" className="btn btn-outline" disabled={busy || disabled} onClick={onTryLive}>
          {busy ? busyLabel ?? "Working…" : <>Try Live <span aria-hidden>→</span></>}
        </button>
      </div>
    </article>
  );
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}
