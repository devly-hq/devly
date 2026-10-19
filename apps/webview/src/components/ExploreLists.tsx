import { useMemo } from "react";
import type { LiveHit, Topic, TrendingRepo } from "@devly/protocol";
import { EmptyState, LoadingState } from "./EmptyState";
import { LiveHitCard } from "./LiveHitCard";
import { TopicCard } from "./TopicCard";
import { TrendingRepoCard } from "./TrendingRepoCard";

type LiveRow = { key: string; kind: "topic"; topic: Topic } | { key: string; kind: "hit"; hit: LiveHit };

function mixSeed(topics: Topic[], hits: LiveHit[]): number {
  const text = [...topics.map((topic) => topic.id), ...hits.map((hit) => `${hit.kind}:${hit.id}`)].join("|");
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Non-model topics stay the feed. Model cards land in the gaps. */
function mixLiveRows(topics: Topic[], hits: LiveHit[]): LiveRow[] {
  const models = hits.filter((hit) => hit.kind === "model");
  const stories = hits.filter((hit) => hit.kind !== "model");
  const seed = mixSeed(topics, hits);
  const spine = shuffle(
    [
      ...topics.map((topic): LiveRow => ({ key: `topic-${topic.id}`, kind: "topic", topic })),
      ...stories.map((hit): LiveRow => ({ key: `hit-${hit.id}`, kind: "hit", hit })),
    ],
    seed,
  );
  const inserts = shuffle(
    models.map((hit): LiveRow => ({ key: `model-${hit.id}`, kind: "hit", hit })),
    seed ^ 0x9e3779b9,
  );
  if (spine.length === 0) return inserts;
  const total = spine.length + inserts.length;
  const modelSlots = new Set<number>();
  const stride = total / inserts.length;
  for (let i = 0; i < inserts.length; i++) {
    let slot = Math.round((i + 0.5) * stride + (seed % 3) - 1);
    slot = Math.max(0, Math.min(total - 1, slot));
    while (modelSlots.has(slot)) slot = (slot + 1) % total;
    modelSlots.add(slot);
  }
  const rows: LiveRow[] = [];
  let topicIndex = 0;
  let modelIndex = 0;
  for (let i = 0; i < total; i++) {
    if (modelSlots.has(i)) rows.push(inserts[modelIndex++]!);
    else rows.push(spine[topicIndex++]!);
  }
  return rows;
}

export function ExploreGitHub({
  searching,
  query,
  repos,
  notice,
  news,
  refreshing,
  tryLiveBusyId,
  busyLabel,
  onTryLive,
  onOpen,
}: {
  searching: boolean;
  query: string;
  repos: TrendingRepo[];
  notice: string | null;
  news: LiveHit[];
  refreshing: boolean;
  tryLiveBusyId: string | null;
  busyLabel: string;
  onTryLive: (repo: TrendingRepo) => void;
  onOpen: (url: string) => void;
}) {
  if (searching && repos.length === 0) {
    return <LoadingState label={`Searching GitHub for “${query.trim()}”…`} />;
  }
  if (refreshing && repos.length === 0) {
    return <LoadingState label="Fetching trending repos…" />;
  }
  if (repos.length === 0) {
    return (
      <EmptyState
        title={query.trim() ? "No repositories" : "No trending repos yet"}
        body={notice ?? (query.trim() ? "Try a different name or description." : "Hit Refresh to pull live GitHub data.")}
        mood="thinking"
      />
    );
  }
  return (
    <>
      {notice && (
        <p className="muted" style={{ marginTop: 0 }}>
          {notice}
        </p>
      )}
      {repos.map((repo) => (
        <TrendingRepoCard
          key={repo.id}
          repo={repo}
          busy={tryLiveBusyId === repo.id}
          disabled={!!tryLiveBusyId && tryLiveBusyId !== repo.id}
          busyLabel={busyLabel}
          onTryLive={() => onTryLive(repo)}
          onOpenGithub={() => onOpen(repo.htmlUrl)}
        />
      ))}
      {news.length > 0 && (
        <>
          <h2 className="h-section">Latest</h2>
          {news.map((hit) => (
            <LiveHitCard key={hit.id} hit={hit} onOpen={() => onOpen(hit.url)} />
          ))}
        </>
      )}
    </>
  );
}

export function ExploreLive({
  searching,
  query,
  topics,
  hits,
  refreshing,
  onOpenTopic,
  onBuild,
  onSave,
  onOpen,
  onSetup,
  setupBusyId,
  busyLabel,
}: {
  searching: boolean;
  query: string;
  topics: Topic[];
  hits: LiveHit[];
  refreshing: boolean;
  onOpenTopic: (topic: Topic) => void;
  onBuild: (topic: Topic) => void;
  onSave: (topicId: string) => void;
  onOpen: (url: string) => void;
  onSetup: (hit: LiveHit) => void;
  setupBusyId: string | null;
  busyLabel: string;
}) {
  const rows = useMemo(() => mixLiveRows(topics, hits), [topics, hits]);
  if ((searching || refreshing) && rows.length === 0) {
    return <LoadingState label={searching ? `Searching “${query.trim()}”…` : "Refreshing live topics…"} />;
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing live yet"
        body="Hit Refresh to load Hugging Face models and the live topic feed."
        mood="thinking"
      />
    );
  }
  return (
    <>
      {rows.map((row) =>
        row.kind === "topic" ? (
          <TopicCard
            key={row.key}
            topic={row.topic}
            lane="Live"
            onBuild={() => onBuild(row.topic)}
            onOpen={() => onOpenTopic(row.topic)}
            onSave={() => onSave(row.topic.id)}
          />
        ) : (
          <LiveHitCard
            key={row.key}
            hit={row.hit}
            busy={row.hit.kind === "model" && setupBusyId === row.hit.id}
            disabled={row.hit.kind === "model" && !!setupBusyId && setupBusyId !== row.hit.id}
            busyLabel={busyLabel}
            onOpen={() => onOpen(row.hit.url)}
            onSetup={row.hit.kind === "model" ? () => onSetup(row.hit) : undefined}
          />
        ),
      )}
    </>
  );
}
