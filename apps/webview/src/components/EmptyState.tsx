import { ShadeMascot, type ShadeMood } from "./ShadeMascot";
import { PrimaryButton, SecondaryButton } from "./Buttons";

interface Props {
  title: string;
  body?: string;
  mood?: ShadeMood;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function EmptyState({
  title,
  body,
  mood = "idle",
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: Props) {
  return (
    <div className="empty-state">
      <ShadeMascot mood={mood} size={56} />
      <h3 className="h-section" style={{ marginTop: 12 }}>
        {title}
      </h3>
      {body && <p className="muted" style={{ margin: "4px 0 12px" }}>{body}</p>}
      <div className="row">
        {actionLabel && onAction && <PrimaryButton onClick={onAction}>{actionLabel}</PrimaryButton>}
        {secondaryLabel && onSecondary && (
          <SecondaryButton onClick={onSecondary}>{secondaryLabel}</SecondaryButton>
        )}
      </div>
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="empty-state">
      <ShadeMascot mood="loading" size={52} />
      <p className="muted" style={{ marginTop: 10 }}>
        {label}
      </p>
    </div>
  );
}
