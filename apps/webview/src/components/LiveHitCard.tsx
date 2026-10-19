import type { LiveHit } from "@devly/protocol";

interface Props {
  hit: LiveHit;
  onOpen: () => void;
  onSetup?: () => void;
  busy?: boolean;
  disabled?: boolean;
  busyLabel?: string;
}

export function LiveHitCard({ hit, onOpen, onSetup, busy, disabled, busyLabel }: Props) {
  const kicker = hit.kind === "model" ? "Hugging Face" : hit.kind === "news" ? "Latest" : "Live";
  const setup = hit.kind === "model" && onSetup;
  return (
    <article className="topic-card card">
      <div className="topic-kicker">
        <span className="lane">{kicker}</span>
        {hit.tag && (
          <span className={`pill tag${hit.tag === "Easy" ? " accent" : ""}${hit.tag === "Hard" ? " hard" : ""}`}>
            {hit.tag}
          </span>
        )}
        {hit.meta && <span>{hit.meta}</span>}
      </div>
      <button type="button" className="topic-card-title-btn" onClick={onOpen}>
        <h3 className="h-card">{hit.title}</h3>
      </button>
      <p className="topic-desc muted">{hit.description}</p>
      {setup && <p className="card-note">Set up downloads this model and opens a local page. Nothing runs until you confirm.</p>}
      {!setup && hit.kind !== "model" && (
        <p className="card-note">This is a link to read. Devly does not clone or run it.</p>
      )}
      <div className="topic-card-actions">
        <button type="button" className="btn btn-outline" disabled={busy || disabled} onClick={setup ? onSetup : onOpen}>
          {busy ? busyLabel ?? "Working…" : setup ? <>Set up <span aria-hidden>→</span></> : <>Open <span aria-hidden>→</span></>}
        </button>
      </div>
    </article>
  );
}
