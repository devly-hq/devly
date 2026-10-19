import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentInfo,
  ExecutionPlan,
  HostToWebview,
  LabSummary,
  MascotPreferences,
  Topic,
  TrendingRepo,
  UserPreferences,
  VerificationCheck,
  LiveHit,
} from "@devly/protocol";
import { pickLine } from "@devly/mascot";
import { onHostMessage, post } from "./vscode";
import { resolveUiTheme, UI_THEMES } from "./theme";
import { DevlyHeader } from "./components/DevlyHeader";
import { ShadeGreeting } from "./components/ShadeGreeting";
import { mapShadeState } from "./components/ShadeMascot";
import { TopicSearch } from "./components/TopicSearch";
import { RepoPickCard, TopicCard } from "./components/TopicCard";
import { TrendingRepoCard } from "./components/TrendingRepoCard";
import { JobsProvider, type RunningJob } from "./components/JobDock";
import { ExploreGitHub, ExploreLive } from "./components/ExploreLists";
import { Navigation, type NavId } from "./components/Navigation";
import { PrimaryButton, SecondaryButton, GhostButton } from "./components/Buttons";
import { ExecutionTimeline, VerificationChecklist } from "./components/ExecutionTimeline";
import { EmptyState, LoadingState } from "./components/EmptyState";
import { ShadeMascot } from "./components/ShadeMascot";

type Page =
  | "onboarding"
  | "picks"
  | "trending"
  | "explore"
  | "labs"
  | "progress"
  | "ask"
  | "customize"
  | "settings"
  | "build"
  | "lesson"
  | "topic";

type TodayCard =
  | { kind: "repo"; repo: TrendingRepo }
  | { kind: "topic"; topic: Topic; lane: "Discover" | "Topic" };

/** Two live repos, one daily discovery, one seed topic. Extra real topics fill a hole. */
function upsertJob(
  current: RunningJob[],
  msg: { labId: string; phase: string; message: string; title?: string; url?: string; estimate?: string },
): RunningJob[] {
  const id = msg.labId === "pending" || msg.labId === "failed" || msg.labId === "cancelled" ? "clone" : msg.labId;
  const previous = current.find((job) => job.id === id);
  const url = msg.url || msg.message.match(/https?:\/\/127\.0\.0\.1:\d+\/?/)?.[0];
  const next: RunningJob = {
    id,
    title: msg.title || previous?.title || msg.message.match(/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/)?.[0] || (id === "model" ? "Model" : "Repository"),
    detail: msg.message,
    phase: msg.phase,
    url: url || previous?.url,
    estimate: msg.estimate || previous?.estimate,
    kind: id === "model" ? "model" : "clone",
  };
  return [next, ...current.filter((job) => job.id !== id)].slice(0, 4);
}

function buildTodayCards(repos: TrendingRepo[], topics: Topic[]): TodayCard[] {
  const cards: TodayCard[] = [];
  const used = new Set<string>();
  for (const repo of repos.slice(0, 2)) cards.push({ kind: "repo", repo });

  const daily = topics.find((topic) => !topic.evergreen);
  if (daily) {
    used.add(daily.id);
    cards.push({ kind: "topic", topic: daily, lane: "Discover" });
  }
  const seed = topics.find((topic) => topic.evergreen && !used.has(topic.id));
  if (seed) {
    used.add(seed.id);
    cards.push({ kind: "topic", topic: seed, lane: "Topic" });
  }
  for (const topic of topics) {
    if (cards.length >= 4) break;
    if (used.has(topic.id)) continue;
    used.add(topic.id);
    cards.push({ kind: "topic", topic, lane: topic.evergreen ? "Topic" : "Discover" });
  }
  return cards.slice(0, 4);
}

const CLONE_STEPS = ["Confirm", "Clone", "Build", "Docker", "Start", "Ready"] as const;

function cloneStepIndex(status: string | null): number {
  const text = (status ?? "").toLowerCase();
  if (text.includes("ready") || text.includes("live") || text.includes("open")) return 5;
  if (text.includes("start") || text.includes("compos") || text.includes("run")) return 4;
  if (text.includes("docker")) return 3;
  if (text.includes("build") || text.includes("install") || text.includes("setup")) return 2;
  if (text.includes("clon")) return 1;
  return 0;
}

const INTERESTS = [
  "ai-fundamentals",
  "ai-engineering",
  "ai-frameworks",
  "agent-protocols",
  "backend",
  "databases",
  "devops",
  "cloud",
  "system-design",
  "programming",
  "security",
  "open-source",
];

export function App() {
  const [page, setPage] = useState<Page>("picks");
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [mascot, setMascot] = useState<MascotPreferences | null>(null);
  const [picks, setPicks] = useState<Topic[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [labs, setLabs] = useState<LabSummary[]>([]);
  const [progress, setProgress] = useState<{ completedTopicIds: string[]; streakDays: number }>({
    completedTopicIds: [],
    streakDays: 0,
  });
  const [shadeState, setShadeState] = useState("IDLE");
  const [shadeLine, setShadeLine] = useState("Hey! Ready to build something interesting?");
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Topic[]>([]);
  const [repoSearchResults, setRepoSearchResults] = useState<TrendingRepo[] | null>(null);
  const [repoNews, setRepoNews] = useState<LiveHit[]>([]);
  const [liveHits, setLiveHits] = useState<LiveHit[]>([]);
  const [liveSearchHits, setLiveSearchHits] = useState<LiveHit[]>([]);
  const [liveTopics, setLiveTopics] = useState<Topic[]>([]);
  const [exploreTab, setExploreTab] = useState<"github" | "live">("github");
  const [refreshingLive, setRefreshingLive] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeLab, setActiveLab] = useState<LabSummary | null>(null);
  const [plan, setPlan] = useState<ExecutionPlan | undefined>();
  const [checks, setChecks] = useState<VerificationCheck[]>([]);
  const [logs, setLogs] = useState("");
  const [logsOpen, setLogsOpen] = useState(false);
  const [lesson, setLesson] = useState("");
  const [askQ, setAskQ] = useState("");
  const [askA, setAskA] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [detailTopic, setDetailTopic] = useState<Topic | null>(null);
  const [onboardStep, setOnboardStep] = useState(0);
  const [draftPrefs, setDraftPrefs] = useState<UserPreferences | null>(null);
  const [refreshingPicks, setRefreshingPicks] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const searchingRef = useRef(false);
  const [trendingRepos, setTrendingRepos] = useState<TrendingRepo[]>([]);
  const [trendingNotice, setTrendingNotice] = useState<string | null>(null);
  const [refreshingTrending, setRefreshingTrending] = useState(false);
  const [tryLiveBusyId, setTryLiveBusyId] = useState<string | null>(null);
  const [tryLiveStatus, setTryLiveStatus] = useState<string | null>(null);
  const [jobs, setJobs] = useState<RunningJob[]>([]);
  const [tryLiveLog, setTryLiveLog] = useState("");

  const mood = refreshingPicks ? "loading" : mapShadeState(shadeState);
  const uiTheme = resolveUiTheme(mascot?.theme);
  const showNav = page !== "onboarding";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", uiTheme);
  }, [uiTheme]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".topic-search-input")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const off = onHostMessage((msg: HostToWebview) => {
      switch (msg.type) {
        case "bootstrap":
          setPrefs(msg.preferences);
          setMascot(msg.mascot);
          setPicks(msg.picks);
          setCategories(msg.categories);
          setAgents(msg.agents);
          setLabs(msg.labs);
          setTrendingRepos(msg.trendingRepos ?? []);
          setTrendingNotice(null);
          setProgress(msg.progress);
          setDraftPrefs(msg.preferences);
          if (!msg.preferences.onboardingComplete) setPage("onboarding");
          setShadeLine(pickLine(msg.mascot.personality, "greet", Date.now()));
          break;
        case "picks":
          setPicks(msg.picks);
          setRefreshingPicks(false);
          if (refreshTimer.current != null) {
            window.clearTimeout(refreshTimer.current);
            refreshTimer.current = null;
          }
          setShadeState("IDLE");
          setShadeLine(
            msg.picks.length
              ? `Got ${msg.picks.length} fresh picks — what looks interesting?`
              : "Hmm, nothing new yet. Try Explore or refresh again.",
          );
          break;
        case "trendingRepos":
          setTrendingRepos(msg.repos);
          setTrendingNotice(msg.notice ?? null);
          setRefreshingTrending(false);
          break;
        case "repoSearchResults":
          setRepoSearchResults(msg.repos);
          setTrendingNotice(msg.notice ?? null);
          setSearching(false);
          break;
        case "repoNews":
          setRepoNews(msg.items);
          break;
        case "liveHits":
          if (searchingRef.current) setLiveSearchHits(msg.hits);
          else setLiveHits(msg.hits);
          searchingRef.current = false;
          setRefreshingLive(false);
          setSearching(false);
          break;
        case "liveTopics":
          setLiveTopics(msg.topics);
          setRefreshingLive(false);
          break;
        case "tryLiveStatus": {
          setTryLiveStatus(msg.message);
          setJobs((current) => upsertJob(current, msg));
          if (msg.labId !== "model") setPage("trending");
          if (msg.phase !== "failed") {
            setToast((t) => (t?.startsWith("Try Live failed") ? null : t));
          }
          if (msg.phase === "live" || msg.phase === "ready" || msg.phase === "cloned" || msg.phase === "failed" || msg.phase === "guide") {
            setTryLiveBusyId(null);
          }
          break;
        }
        case "searchResults":
          setSearchResults(msg.results);
          break;
        case "agents":
          setAgents(msg.agents);
          break;
        case "labs":
          setLabs(msg.labs);
          break;
        case "labUpdate":
          setActiveLab(msg.lab);
          if (msg.lab.agentId === "try-live") {
            setPage("trending");
            if (msg.logs) setTryLiveStatus(msg.logs);
            break;
          }
          if (msg.plan) setPlan(msg.plan);
          if (msg.checks) setChecks(msg.checks);
          if (msg.logs) setLogs((l) => l + msg.logs);
          if (msg.lessonMarkdown) {
            setLesson(msg.lessonMarkdown);
            setPage("lesson");
          } else {
            setPage("build");
          }
          break;
        case "logChunk":
          if (msg.labId === "try-live") {
            setTryLiveLog((l) => (l + msg.chunk).slice(-4000));
          } else {
            setLogs((l) => (l + msg.chunk).slice(-20000));
          }
          break;
        case "shadeState":
          setShadeState(msg.state);
          if (msg.line) setShadeLine(msg.line);
          break;
        case "askShadeReply":
          setAskA(msg.answer);
          setPage("customize");
          break;
        case "toast":
          setToast(msg.message);
          break;
        case "error":
          setToast(msg.message);
          setShadeState("ERROR");
          setRefreshingPicks(false);
          setRefreshingTrending(false);
          setTryLiveBusyId(null);
          if (refreshTimer.current != null) {
            window.clearTimeout(refreshTimer.current);
            refreshTimer.current = null;
          }
          break;
        case "topicDetail":
          setDetailTopic(msg.topic);
          setPage("topic");
          break;
        default:
          break;
      }
    });
    post({ type: "ready" });
    post({ type: "getBootstrap" });
    return off;
  }, []);

  const installedAgents = useMemo(() => agents.filter((a) => a.installed), [agents]);

  function startTryLive(repo: TrendingRepo) {
    if (tryLiveBusyId) return;
    setToast(null);
    setTryLiveBusyId(repo.id);
    setTryLiveLog("");
    setTryLiveStatus(`Preparing ${repo.fullName}… Confirm in the dialog.`);
    post({
      type: "tryLiveRepo",
      repoId: repo.id,
      fullName: repo.fullName,
      cloneUrl: repo.cloneUrl,
      htmlUrl: repo.htmlUrl,
      description: repo.description,
    });
  }

  function startModelSetup(hit: LiveHit) {
    if (tryLiveBusyId) return;
    setToast(null);
    setTryLiveBusyId(hit.id);
    setTryLiveStatus(`Preparing ${hit.title}… Confirm in the dialog.`);
    setPage("explore");
    setExploreTab("live");
    post({ type: "setupModel", title: hit.title, url: hit.url });
  }

  function startTopic(topic: Topic) {
    const agentId =
      prefs?.defaultAgentId ||
      installedAgents.find((a) => a.id === "claude-code")?.id ||
      installedAgents.find((a) => a.id === "fake")?.id ||
      installedAgents[0]?.id ||
      "fake";
    setLogs("");
    setChecks([]);
    setPlan(undefined);
    setLesson("");
    setLogsOpen(false);
    setPage("build");
    post({
      type: "startLab",
      topicId: topic.id,
      agentId,
      workspaceMode: prefs?.workspacePreference ?? "temporary",
      learningMode: prefs?.learningMode ?? "watch",
    });
  }

  function tryLiveLabel(status: string | null): string {
    const s = (status ?? "").toLowerCase();
    if (s.includes("install") || s.includes("pytorch") || s.includes("runtime")) return "Installing…";
    if (s.includes("weight") || s.includes("download")) return "Downloading…";
    if (s.includes("set up") || s.includes("model page") || s.includes("checking")) return "Setting up…";
    if (s.includes("clon")) return "Cloning…";
    if (s.includes("docker")) return "Docker…";
    if (s.includes("build") || s.includes("install") || s.includes("setup")) return "Building…";
    if (s.includes("compos") || s.includes("start") || s.includes("run")) return "Starting…";
    if (s.includes("fix")) return "Fixing…";
    if (s.includes("what this") || s.includes("how to use") || s.includes("writing")) return "Explaining…";
    if (s.includes("confirm") || s.includes("prepar")) return "Confirm…";
    return "Working…";
  }

  function goNav(id: NavId) {
    setPage(id);
  }

  if (!prefs || !mascot || !draftPrefs) {
    return (
      <div className="app">
        <div className="app-body no-nav-pad">
          <LoadingState label="Waking up Shade…" />
        </div>
      </div>
    );
  }

  const success =
    activeLab &&
    (activeLab.state === "READY" || activeLab.state === "PARTIALLY_READY") &&
    page === "build";
  const todayCards = buildTodayCards(trendingRepos, picks);

  return (
    <JobsProvider
      jobs={jobs}
      dismiss={(id) => setJobs((current) => current.filter((job) => job.id !== id))}
      openUrl={(url) => post({ type: "openExternal", url })}
    >
    <div className="app">
      <div className={`app-body ${showNav ? "" : "no-nav-pad"}`}>
        {page === "onboarding" && (
          <Onboarding
            step={onboardStep}
            setStep={setOnboardStep}
            draft={draftPrefs}
            setDraft={setDraftPrefs}
            agents={agents}
            line={shadeLine}
            mood={mood}
            mascotName={mascot.name}
            onDone={() => {
              post({ type: "completeOnboarding", preferences: { ...draftPrefs, onboardingComplete: true } });
              setPrefs({ ...draftPrefs, onboardingComplete: true });
              setPage("picks");
            }}
          />
        )}

        {page === "picks" && (
          <>
            <DevlyHeader onSettings={() => setPage("settings")} onProgress={() => setPage("progress")} />
            <ShadeGreeting terminal line={shadeLine} mood={mood} name={mascot.name} hidden={mascot.hidden} />
            <TopicSearch
              value={search}
              onChange={(v) => {
                setSearch(v);
                setRepoSearchResults(null);
                if (v.trim()) {
                  searchingRef.current = true;
                  setSearching(true);
                  post({ type: "searchTopics", query: v });
                } else {
                  searchingRef.current = false;
                  setSearchResults([]);
                  setSearching(false);
                }
              }}
            />
            {search.trim() && (
              <div style={{ marginBottom: 12 }}>
                <h2 className="h-section">Live</h2>
                {searching && searchResults.length === 0 && (repoSearchResults?.length ?? 0) === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    Searching GitHub and topics…
                  </p>
                ) : searchResults.length === 0 && (repoSearchResults?.length ?? 0) === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    No matches yet.
                  </p>
                ) : (
                  <>
                    {searchResults.slice(0, 3).map((t, i) => (
                      <TopicCard
                        key={t.id}
                        topic={t}
                        index={i + 1}
                        lane="Live"
                        onBuild={() => startTopic(t)}
                        onOpen={() => {
                          setDetailTopic(t);
                          setPage("topic");
                        }}
                        onSave={() => post({ type: "saveTopic", topicId: t.id })}
                      />
                    ))}
                    {(repoSearchResults ?? []).slice(0, 3).map((repo) => (
                      <RepoPickCard
                        key={repo.id}
                        repo={repo}
                        busy={tryLiveBusyId === repo.id}
                        disabled={!!tryLiveBusyId && tryLiveBusyId !== repo.id}
                        busyLabel={tryLiveLabel(tryLiveStatus)}
                        onTryLive={() => startTryLive(repo)}
                        onOpen={() => post({ type: "openExternal", url: repo.htmlUrl })}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <h2 className="h-section" style={{ margin: 0 }}>
                Today's Picks
              </h2>
              <GhostButton
                disabled={refreshingPicks}
                aria-busy={refreshingPicks}
                onClick={() => {
                  setRefreshingPicks(true);
                  setShadeLine("Finding fresh topics for you…");
                  post({ type: "refreshPicks" });
                  if (refreshTimer.current != null) window.clearTimeout(refreshTimer.current);
                  refreshTimer.current = window.setTimeout(() => {
                    setRefreshingPicks(false);
                    refreshTimer.current = null;
                  }, 12_000);
                }}
              >
                {refreshingPicks ? "Refreshing…" : "Refresh"}
              </GhostButton>
            </div>
            {refreshingPicks ? (
              <LoadingState label="Refreshing today's picks…" />
            ) : todayCards.length === 0 ? (
              <EmptyState title="No picks yet" body="Try Explore or refresh." mood="thinking" />
            ) : (
              todayCards.map((card, i) =>
                card.kind === "repo" ? (
                  <RepoPickCard
                    key={card.repo.id}
                    repo={card.repo}
                    index={i + 1}
                    busy={tryLiveBusyId === card.repo.id}
                    disabled={!!tryLiveBusyId && tryLiveBusyId !== card.repo.id}
                    busyLabel={tryLiveLabel(tryLiveStatus)}
                    onTryLive={() => startTryLive(card.repo)}
                    onOpen={() => post({ type: "openExternal", url: card.repo.htmlUrl })}
                  />
                ) : (
                  <TopicCard
                    key={card.topic.id}
                    topic={card.topic}
                    index={i + 1}
                    lane={card.lane}
                    onBuild={() => startTopic(card.topic)}
                    onOpen={() => {
                      setDetailTopic(card.topic);
                      setPage("topic");
                    }}
                    onSave={() => post({ type: "saveTopic", topicId: card.topic.id })}
                    onHide={() => post({ type: "hideTopic", topicId: card.topic.id })}
                    onKnown={() => post({ type: "markKnown", topicId: card.topic.id })}
                  />
                ),
              )
            )}
          </>
        )}

        {page === "trending" && (
          <>
            <DevlyHeader title="Trending" onSettings={() => setPage("settings")} />
            <ShadeGreeting
              line={
                tryLiveStatus ??
                "Hot GitHub repos — Try Live clones and runs them here. You stay on this screen."
              }
              mood={tryLiveBusyId || refreshingTrending ? "loading" : mood}
              name={mascot.name}
              hidden={mascot.hidden}
            />
            {(tryLiveBusyId || tryLiveStatus) && (
              <CloneProgress
                title={tryLiveBusyId ? "Cloning and starting" : "Latest run"}
                status={tryLiveStatus}
                log={tryLiveLog}
                demoUrl={activeLab?.agentId === "try-live" && activeLab.state === "READY" ? activeLab.demoUrl : undefined}
                onOpen={(url) => post({ type: "openExternal", url })}
              />
            )}
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <h2 className="h-section" style={{ margin: 0 }}>
                Trending GitHub
              </h2>
              <GhostButton
                disabled={refreshingTrending || !!tryLiveBusyId}
                onClick={() => {
                  setRefreshingTrending(true);
                  post({ type: "refreshTrending" });
                }}
              >
                {refreshingTrending ? "Refreshing…" : "Refresh"}
              </GhostButton>
            </div>
            {trendingNotice && trendingRepos.length > 0 && (
              <p className="muted" style={{ marginTop: 0 }}>
                {trendingNotice}
              </p>
            )}
            {refreshingTrending && trendingRepos.length === 0 ? (
              <LoadingState label="Fetching trending repos…" />
            ) : trendingRepos.length === 0 ? (
              <EmptyState
                title="No trending repos yet"
                body={trendingNotice ?? "Hit Refresh once to pull live GitHub + HN data."}
                mood="thinking"
                actionLabel="Refresh"
                onAction={() => {
                  setRefreshingTrending(true);
                  post({ type: "refreshTrending" });
                }}
              />
            ) : (
              trendingRepos.map((r) => (
                <TrendingRepoCard
                  key={r.id}
                  repo={r}
                  busy={tryLiveBusyId === r.id}
                  disabled={!!tryLiveBusyId && tryLiveBusyId !== r.id}
                  busyLabel={tryLiveLabel(tryLiveStatus)}
                  onTryLive={() => startTryLive(r)}
                  onOpenGithub={() => post({ type: "openExternal", url: r.htmlUrl })}
                />
              ))
            )}
          </>
        )}

        {page === "explore" && (
          <>
            <DevlyHeader title="Explore" onSettings={() => setPage("settings")} onProgress={() => setPage("progress")} />
            <div className="chips" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={exploreTab === "github" ? "chip selected" : "chip"}
                onClick={() => {
                  setExploreTab("github");
                  setSearch("");
                  setRepoSearchResults(null);
                }}
              >
                GitHub
              </button>
              <button
                type="button"
                className={exploreTab === "live" ? "chip selected" : "chip"}
                onClick={() => {
                  setExploreTab("live");
                  setSearch("");
                  setRepoSearchResults(null);
                  if (liveHits.length === 0 && liveTopics.length === 0) {
                    setRefreshingLive(true);
                    post({ type: "refreshLive" });
                  }
                }}
              >
                Live
              </button>
            </div>
            <TopicSearch
              value={search}
              onChange={(v) => {
                setSearch(v);
                if (!v.trim()) {
                  searchingRef.current = false;
                  setRepoSearchResults(null);
                  setSearching(false);
                  return;
                }
                searchingRef.current = true;
                setSearching(true);
                post({ type: "searchLive", query: v, scope: exploreTab === "github" ? "github" : "live" });
              }}
            />
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <h2 className="h-section" style={{ margin: 0 }}>
                {exploreTab === "github" ? "GitHub" : "Live"}
              </h2>
              <GhostButton
                disabled={exploreTab === "github" ? refreshingTrending : refreshingLive}
                onClick={() => {
                  setSearch("");
                  setRepoSearchResults(null);
                  searchingRef.current = false;
                  setSearching(false);
                  if (exploreTab === "github") {
                    setRefreshingTrending(true);
                    post({ type: "refreshTrending" });
                  } else {
                    setRefreshingLive(true);
                    post({ type: "refreshLive" });
                  }
                }}
              >
                {(exploreTab === "github" ? refreshingTrending : refreshingLive) ? "Refreshing…" : "Refresh"}
              </GhostButton>
            </div>
            {exploreTab === "github" ? (
              <ExploreGitHub
                searching={searching && !!search.trim()}
                query={search}
                repos={search.trim() ? (repoSearchResults ?? []) : trendingRepos}
                notice={trendingNotice}
                news={search.trim() ? [] : repoNews}
                refreshing={refreshingTrending}
                tryLiveBusyId={tryLiveBusyId}
                busyLabel={tryLiveLabel(tryLiveStatus)}
                onTryLive={startTryLive}
                onOpen={(url) => post({ type: "openExternal", url })}
              />
            ) : (
              <ExploreLive
                searching={searching && !!search.trim()}
                query={search}
                topics={search.trim() ? [] : liveTopics}
                hits={search.trim() ? liveSearchHits : liveHits}
                refreshing={refreshingLive}
                onOpenTopic={(topic) => {
                  setDetailTopic(topic);
                  setPage("topic");
                }}
                onBuild={startTopic}
                onSave={(topicId) => post({ type: "saveTopic", topicId })}
                onOpen={(url) => post({ type: "openExternal", url })}
                onSetup={startModelSetup}
                setupBusyId={tryLiveBusyId}
                busyLabel={tryLiveLabel(tryLiveStatus)}
              />
            )}
            <div className="field">
              <label htmlFor="custom">Or ask for any topic</label>
              <input
                id="custom"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Teach me how Kafka works"
              />
              <PrimaryButton
                disabled={customTopic.trim().length < 3}
                onClick={() => post({ type: "customTopic", text: customTopic.trim() })}
              >
                Start custom lab
              </PrimaryButton>
            </div>
          </>
        )}

        {page === "topic" && detailTopic && (
          <TopicDetail
            topic={detailTopic}
            onBack={() => setPage("picks")}
            onBuild={() => startTopic(detailTopic)}
          />
        )}

        {page === "labs" && (
          <>
            <DevlyHeader title="Labs" onProgress={() => setPage("progress")} />
            {labs.length === 0 ? (
              <EmptyState
                title="No labs yet"
                body="Start one from Today's Picks."
                mood="sleeping"
                actionLabel="Go to Today"
                onAction={() => setPage("picks")}
              />
            ) : (
              labs.map((lab) => (
                <div className="card" key={lab.id} style={{ marginBottom: 8 }}>
                  <h3 className="h-card">{lab.topicTitle}</h3>
                  <div className="meta" style={{ margin: "6px 0 10px" }}>
                    {lab.state} · {lab.agentId}
                  </div>
                  <div className="row">
                    <SecondaryButton onClick={() => post({ type: "openLab", labId: lab.id })}>Open</SecondaryButton>
                    <SecondaryButton
                      onClick={() => {
                        setActiveLab(lab);
                        setPage("build");
                      }}
                    >
                      View
                    </SecondaryButton>
                    <GhostButton onClick={() => post({ type: "stopServices", labId: lab.id })}>Stop</GhostButton>
                    <GhostButton onClick={() => post({ type: "deleteLab", labId: lab.id })}>Delete</GhostButton>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {page === "progress" && (
          <>
            <DevlyHeader title="Progress" onSettings={() => setPage("settings")} />
            <ShadeGreeting
              line={
                progress.completedTopicIds.length
                  ? `${progress.completedTopicIds.length} labs finished. Streak ${progress.streakDays}.`
                  : "Nothing finished yet. Start from Today."
              }
              mood={progress.streakDays > 0 ? "happy" : "idle"}
              name={mascot.name}
              hidden={mascot.hidden}
              compact
            />
            <div className="progress-stats">
              <div className="progress-stat">
                <div className="meta">Streak</div>
                <strong>{progress.streakDays}</strong>
              </div>
              <div className="progress-stat">
                <div className="meta">Completed</div>
                <strong>{progress.completedTopicIds.length}</strong>
              </div>
            </div>
            {progress.completedTopicIds.length === 0 ? (
              <EmptyState title="No finished labs" body="Build a topic from Today and it will show up here." mood="idle" actionLabel="Back to Today" onAction={() => setPage("picks")} />
            ) : (
              <ul className="progress-list">
                {progress.completedTopicIds.map((id, i) => (
                  <li key={id}>
                    <span className="term-no">{String(i + 1).padStart(2, "0")}</span>
                    <span>{id}</span>
                    <span className="meta">done</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {page === "ask" && (
          <>
            <DevlyHeader title="Ask Shade" />
            <ShadeGreeting line="Ask me anything about your lab or a concept." mood="explaining" name={mascot.name} hidden={mascot.hidden} compact />
            <div className="field">
              <label htmlFor="ask">Your question</label>
              <textarea id="ask" rows={4} value={askQ} onChange={(e) => setAskQ(e.target.value)} placeholder="Why do we need embeddings?" />
              <PrimaryButton
                onClick={() =>
                  post({
                    type: "askShade",
                    question: askQ,
                    labId: activeLab?.id,
                  })
                }
              >
                Ask Shade
              </PrimaryButton>
            </div>
            {askA && (
              <div className="card">
                <div className="meta" style={{ marginBottom: 6 }}>
                  Shade says
                </div>
                <div className="lesson">{askA}</div>
              </div>
            )}
          </>
        )}

        {page === "customize" && (
          <>
            <Customize
              mascot={mascot}
              onChange={(patch) => {
                post({ type: "updateMascot", preferences: patch });
                setMascot({ ...mascot, ...patch });
              }}
            />
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="ask">Ask Shade</label>
              <textarea id="ask" rows={3} value={askQ} onChange={(e) => setAskQ(e.target.value)} placeholder="Why do we need embeddings?" />
              <PrimaryButton
                onClick={() =>
                  post({
                    type: "askShade",
                    question: askQ,
                    labId: activeLab?.id,
                  })
                }
              >
                Ask Shade
              </PrimaryButton>
            </div>
            {askA && (
              <div className="card">
                <div className="meta" style={{ marginBottom: 6 }}>
                  Shade says
                </div>
                <div className="lesson">{askA}</div>
              </div>
            )}
          </>
        )}

        {page === "settings" && (
          <Settings
            prefs={prefs}
            agents={agents}
            onSave={(patch) => {
              post({ type: "updatePreferences", preferences: patch });
              setPrefs({ ...prefs, ...patch });
              setToast("Settings saved");
            }}
            onDetect={() => post({ type: "detectAgents" })}
          />
        )}

        {page === "build" && activeLab && !success && (
          <BuildPanel
            lab={activeLab}
            plan={plan}
            checks={checks}
            logs={logs}
            logsOpen={logsOpen}
            setLogsOpen={setLogsOpen}
            mood={mood}
            line={shadeLine}
            mascotName={mascot.name}
            hidden={mascot.hidden}
            onApprove={() => post({ type: "approvePlan", labId: activeLab.id })}
            onReject={() => post({ type: "rejectPlan", labId: activeLab.id })}
            onCancel={() => post({ type: "cancelLab", labId: activeLab.id })}
            onRepair={() => post({ type: "repairLab", labId: activeLab.id })}
          />
        )}

        {page === "build" && activeLab && success && (
          <SuccessPanel
            lab={activeLab}
            checks={checks}
            mascotName={mascot.name}
            hidden={mascot.hidden}
            onLesson={() => setPage("lesson")}
            onExplore={() => post({ type: "openFile", labId: activeLab.id, relativePath: "README.md" })}
            onOpenApp={() => activeLab.demoUrl && post({ type: "openExternal", url: activeLab.demoUrl })}
            onStop={() => post({ type: "stopServices", labId: activeLab.id })}
          />
        )}

        {page === "lesson" && (
          <>
            <DevlyHeader title="Learn" />
            <ShadeGreeting
              line="Let's walk through what we built."
              mood="explaining"
              name={mascot.name}
              hidden={mascot.hidden}
              compact
            />
            <div className="card">
              <h3 className="h-card">{activeLab?.topicTitle ?? "Lesson"}</h3>
              {activeLab?.demoUrl && (
                <div className="row" style={{ margin: "10px 0" }}>
                  <PrimaryButton onClick={() => post({ type: "openExternal", url: activeLab.demoUrl! })}>
                    Open Application
                  </PrimaryButton>
                </div>
              )}
              <div className="lesson">{lesson || "Lesson will appear after the lab is ready."}</div>
              <div className="row" style={{ marginTop: 12 }}>
                {activeLab && (
                  <>
                    <SecondaryButton onClick={() => post({ type: "openFile", labId: activeLab.id, relativePath: "README.md" })}>
                      Explore Code
                    </SecondaryButton>
                    <GhostButton onClick={() => post({ type: "stopServices", labId: activeLab.id })}>Stop Services</GhostButton>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button type="button" className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss notification">
            ✕
          </button>
        </div>
      )}
      {showNav && (
        <Navigation
          active={
            page === "topic" || page === "trending"
              ? "picks"
              : page === "build" || page === "lesson"
                ? "labs"
                : page === "ask"
                  ? "customize"
                  : page
          }
          onChange={goNav}
        />
      )}
    </div>
    </JobsProvider>
  );
}

function CloneProgress({
  title,
  status,
  log,
  demoUrl,
  onOpen,
}: {
  title: string;
  status: string | null;
  log: string;
  demoUrl?: string;
  onOpen: (url: string) => void;
}) {
  const current = cloneStepIndex(status);
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h3 className="h-card">{title}</h3>
      <p className="muted" style={{ margin: "8px 0" }}>
        {status}
      </p>
      <ol className="clone-steps">
        {CLONE_STEPS.map((label, index) => (
          <li key={label} className={`clone-step ${index < current ? "done" : ""} ${index === current ? "current" : ""}`}>
            <span className="clone-dot" />
            <span>
              {String(index + 1).padStart(2, "0")} {label}
            </span>
          </li>
        ))}
      </ol>
      {log.trim() && (
        <pre className="mono muted" style={{ maxHeight: 140, overflow: "auto", whiteSpace: "pre-wrap", marginTop: 8 }}>
          {log.slice(-1200)}
        </pre>
      )}
      {demoUrl && (
        <div style={{ marginTop: 10 }}>
          <PrimaryButton onClick={() => onOpen(demoUrl)}>Open the running app</PrimaryButton>
        </div>
      )}
    </div>
  );
}

function TopicDetail({ topic, onBack, onBuild }: { topic: Topic; onBack: () => void; onBuild: () => void }) {
  return (
    <>
      <GhostButton onClick={onBack}>← Back</GhostButton>
      <div style={{ height: 8 }} />
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        <span className="pill accent">{topic.category}</span>
        <span className="pill">{topic.difficulty}</span>
        <span className="pill">{topic.estimatedMinutes} min</span>
      </div>
      <h1 className="h-page" style={{ marginBottom: 8 }}>
        {topic.title}
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {topic.description}
      </p>
      {topic.learningObjectives.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 className="h-section">What you'll learn</h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--devly-text-secondary)", fontSize: 12.5 }}>
            {topic.learningObjectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}
      {topic.requiredTechnologies.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          <h3 className="h-section">Technologies</h3>
          <div className="chips">
            {topic.requiredTechnologies.map((t) => (
              <span key={t} className="pill">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <PrimaryButton block onClick={onBuild}>
          Let's Build →
        </PrimaryButton>
      </div>
    </>
  );
}

function BuildPanel({
  lab,
  plan,
  checks,
  logs,
  logsOpen,
  setLogsOpen,
  mood,
  line,
  mascotName,
  hidden,
  onApprove,
  onReject,
  onCancel,
  onRepair,
}: {
  lab: LabSummary;
  plan?: ExecutionPlan;
  checks: VerificationCheck[];
  logs: string;
  logsOpen: boolean;
  setLogsOpen: (v: boolean) => void;
  mood: ReturnType<typeof mapShadeState>;
  line: string;
  mascotName: string;
  hidden: boolean;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  onRepair: () => void;
}) {
  return (
    <>
      <DevlyHeader title="Building" />
      <ShadeGreeting line={line || "Setting up your project…"} mood={mood} name={mascotName} hidden={hidden} />
      <div className="card">
        <h3 className="h-card">{lab.topicTitle}</h3>
        <div className="meta" style={{ margin: "6px 0 12px" }}>
          {lab.state} · {lab.agentId}
        </div>
        <ExecutionTimeline state={lab.state} checks={checks.length ? checks : undefined} />

        {lab.state === "WAITING_FOR_APPROVAL" && plan && (
          <>
            <div className="plan-box">
              <div style={{ marginBottom: 8 }}>{plan.architecture}</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {plan.commands.map((c) => (
                  <li key={c.id} style={{ marginBottom: 4 }}>
                    <code>
                      {c.executable} {c.args.join(" ")}
                    </code>
                    {c.description ? ` — ${c.description}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div className="row">
              <PrimaryButton onClick={onApprove}>Approve & Build</PrimaryButton>
              <SecondaryButton onClick={onReject}>Cancel</SecondaryButton>
            </div>
          </>
        )}

        <div className="row" style={{ marginTop: 10 }}>
          <GhostButton onClick={onCancel}>Cancel run</GhostButton>
          {(lab.state === "FAILED" || lab.state === "PARTIALLY_READY") && (
            <PrimaryButton onClick={onRepair}>Repair</PrimaryButton>
          )}
          <GhostButton onClick={() => setLogsOpen(!logsOpen)}>{logsOpen ? "Hide logs" : "Show logs"}</GhostButton>
        </div>
      </div>
      {logsOpen && <div className="log-panel" aria-live="polite">{logs || "Waiting for agent output…"}</div>}
    </>
  );
}

function SuccessPanel({
  lab,
  checks,
  mascotName,
  hidden,
  onLesson,
  onExplore,
  onOpenApp,
  onStop,
}: {
  lab: LabSummary;
  checks: VerificationCheck[];
  mascotName: string;
  hidden: boolean;
  onLesson: () => void;
  onExplore: () => void;
  onOpenApp: () => void;
  onStop: () => void;
}) {
  return (
    <>
      <DevlyHeader title="Ready" />
      <ShadeGreeting line="Your project is ready!" mood="celebrating" name={mascotName} hidden={hidden} />
      <div className="card">
        <h3 className="h-card">{lab.topicTitle}</h3>
        <div style={{ marginTop: 12 }}>
          {checks.length > 0 ? <VerificationChecklist checks={checks} /> : <ExecutionTimeline state="READY" />}
        </div>
        <div className="stack" style={{ marginTop: 8 }}>
          {lab.demoUrl && <PrimaryButton onClick={onOpenApp}>Open Application</PrimaryButton>}
          <SecondaryButton onClick={onExplore}>Explore Code</SecondaryButton>
          <SecondaryButton onClick={onLesson}>Learn How It Works</SecondaryButton>
          <GhostButton onClick={onStop}>Stop Services</GhostButton>
        </div>
      </div>
    </>
  );
}

function Onboarding({
  step,
  setStep,
  draft,
  setDraft,
  agents,
  line,
  mood,
  mascotName,
  onDone,
}: {
  step: number;
  setStep: (n: number) => void;
  draft: UserPreferences;
  setDraft: (p: UserPreferences) => void;
  agents: AgentInfo[];
  line: string;
  mood: ReturnType<typeof mapShadeState>;
  mascotName: string;
  onDone: () => void;
}) {
  const steps = ["Welcome", "Interests", "Level", "Languages", "Agent", "Mode", "Workspace", "Notifications"];
  return (
    <>
      <DevlyHeader title="Welcome" />
      <ShadeGreeting line={step === 0 ? "Meet Shade — your mysterious coding companion." : line} mood={mood} name={mascotName} />
      <div className="card">
        <div className="meta" style={{ marginBottom: 8 }}>
          {steps[step]} · {step + 1}/{steps.length}
        </div>
        {step === 0 && <p className="muted">Devly turns topics into working local projects in about 10 minutes.</p>}
        {step === 1 && (
          <div className="chips">
            {INTERESTS.map((id) => (
              <button
                key={id}
                type="button"
                className={`chip ${draft.interests.includes(id) ? "selected" : ""}`}
                onClick={() => {
                  const set = new Set(draft.interests);
                  if (set.has(id)) set.delete(id);
                  else set.add(id);
                  setDraft({ ...draft, interests: [...set] });
                }}
              >
                {id}
              </button>
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="chips">
            {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={`chip ${draft.experienceLevel === lvl ? "selected" : ""}`}
                onClick={() => setDraft({ ...draft, experienceLevel: lvl })}
              >
                {lvl}
              </button>
            ))}
          </div>
        )}
        {step === 3 && (
          <div className="chips">
            {["python", "typescript", "go", "rust", "javascript"].map((lang) => (
              <button
                key={lang}
                type="button"
                className={`chip ${draft.preferredLanguages.includes(lang) ? "selected" : ""}`}
                onClick={() => {
                  const set = new Set(draft.preferredLanguages);
                  if (set.has(lang)) set.delete(lang);
                  else set.add(lang);
                  setDraft({ ...draft, preferredLanguages: [...set] });
                }}
              >
                {lang}
              </button>
            ))}
          </div>
        )}
        {step === 4 && (
          <div className="chips">
            {agents.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`chip ${draft.defaultAgentId === a.id ? "selected" : ""}`}
                onClick={() => setDraft({ ...draft, defaultAgentId: a.id })}
                disabled={!a.installed && a.id !== "manual" && a.id !== "fake"}
              >
                {a.displayName} {a.installed ? "✓" : ""}
              </button>
            ))}
          </div>
        )}
        {step === 5 && (
          <div className="chips">
            {(["watch", "do"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${draft.learningMode === m ? "selected" : ""}`}
                onClick={() => setDraft({ ...draft, learningMode: m })}
              >
                {m === "watch" ? "Watch & Learn" : "Learn by Doing"}
              </button>
            ))}
          </div>
        )}
        {step === 6 && (
          <div className="chips">
            {(
              [
                ["current", "Current window"],
                ["new-window", "New window"],
                ["temporary", "Temporary"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`chip ${draft.workspacePreference === id ? "selected" : ""}`}
                onClick={() => setDraft({ ...draft, workspacePreference: id })}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {step === 7 && (
          <label className="row">
            <input
              type="checkbox"
              checked={draft.dailySuggestions}
              onChange={(e) => setDraft({ ...draft, dailySuggestions: e.target.checked })}
            />
            Daily learning suggestions
          </label>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          {step > 0 && <SecondaryButton onClick={() => setStep(step - 1)}>Back</SecondaryButton>}
          {step < steps.length - 1 ? (
            <PrimaryButton onClick={() => setStep(step + 1)}>Next</PrimaryButton>
          ) : (
            <PrimaryButton onClick={onDone}>Finish</PrimaryButton>
          )}
          <GhostButton onClick={onDone}>Skip</GhostButton>
        </div>
      </div>
    </>
  );
}

function Customize({
  mascot,
  onChange,
}: {
  mascot: MascotPreferences;
  onChange: (p: Partial<MascotPreferences>) => void;
}) {
  return (
    <>
      <DevlyHeader title="Customize Shade" />
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <ShadeMascot mood="idle" size={88} name={mascot.name} hidden={mascot.hidden} />
      </div>
      <div className="card">
        <div className="field">
          <label>Name</label>
          <input value={mascot.name} onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="field">
          <label>Theme</label>
          <div className="chips">
            {UI_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`chip ${mascot.theme === t.id ? "selected" : ""}`}
                onClick={() => onChange({ theme: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Outfit</label>
          <select value={mascot.outfit} onChange={(e) => onChange({ outfit: e.target.value })}>
            <option value="none">None</option>
            <option value="hacker-hoodie">Hacker Hoodie</option>
            <option value="wizard-hat">Wizard Hat</option>
            <option value="glasses">Glasses</option>
            <option value="headphones">Headphones</option>
            <option value="crown">Crown</option>
          </select>
        </div>
        <div className="field">
          <label>Personality</label>
          <select
            value={mascot.personality}
            onChange={(e) => onChange({ personality: e.target.value as MascotPreferences["personality"] })}
          >
            <option value="calm">Calm</option>
            <option value="friendly">Friendly</option>
            <option value="witty">Witty</option>
            <option value="sarcastic">Sarcastic</option>
            <option value="enthusiastic">Enthusiastic</option>
            <option value="minimal">Minimal</option>
          </select>
        </div>
        <label className="row">
          <input type="checkbox" checked={mascot.hidden} onChange={(e) => onChange({ hidden: e.target.checked })} />
          Hide Shade
        </label>
      </div>
    </>
  );
}

function Settings({
  prefs,
  agents,
  onSave,
  onDetect,
}: {
  prefs: UserPreferences;
  agents: AgentInfo[];
  onSave: (p: Partial<UserPreferences>) => void;
  onDetect: () => void;
}) {
  const [local, setLocal] = useState(prefs);
  return (
    <>
      <DevlyHeader title="Settings" />
      <div className="card">
        <div className="field">
          <label>Default agent</label>
          <select value={local.defaultAgentId ?? ""} onChange={(e) => setLocal({ ...local, defaultAgentId: e.target.value })}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} {a.installed ? "" : "(not installed)"}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Max repair attempts</label>
          <input
            type="number"
            min={0}
            max={10}
            value={local.maxRepairAttempts}
            onChange={(e) => setLocal({ ...local, maxRepairAttempts: Number(e.target.value) })}
          />
        </div>
        <label className="row" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={local.dailySuggestions}
            onChange={(e) => setLocal({ ...local, dailySuggestions: e.target.checked })}
          />
          Daily suggestions
        </label>
        <div className="row">
          <PrimaryButton onClick={() => onSave(local)}>Save</PrimaryButton>
          <SecondaryButton onClick={onDetect}>Detect agents</SecondaryButton>
        </div>
        <div className="meta" style={{ marginTop: 12 }}>
          {agents.map((a) => (
            <div key={a.id}>
              {a.displayName}: {a.installed ? `installed ${a.version ?? ""}` : "missing"}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
