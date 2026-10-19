import { createContext, useContext, useState, type ReactNode } from "react";

export interface RunningJob {
  id: string;
  title: string;
  detail: string;
  phase: string;
  url?: string;
  estimate?: string;
  kind: "model" | "clone";
}

interface JobsValue {
  jobs: RunningJob[];
  dismiss: (id: string) => void;
  openUrl: (url: string) => void;
}

const JobsContext = createContext<JobsValue | null>(null);

export function JobsProvider({
  jobs,
  dismiss,
  openUrl,
  children,
}: JobsValue & { children: ReactNode }) {
  return <JobsContext.Provider value={{ jobs, dismiss, openUrl }}>{children}</JobsContext.Provider>;
}

const MODEL_STEPS = ["Check", "Install", "Start page", "Download", "Ready"] as const;

function modelIndex(phase: string): number {
  if (phase === "checking") return 0;
  if (phase === "installing") return 1;
  if (phase === "starting") return 2;
  if (phase === "weights" || phase === "live") return 3;
  if (phase === "ready") return 4;
  return 0;
}

function modelNow(phase: string): { now: string; after: string } {
  if (phase === "checking") {
    return {
      now: "Looking up the model size and which libraries it needs.",
      after: "Next, Devly installs a CPU copy of PyTorch. That is the long step the first time.",
    };
  }
  if (phase === "installing") {
    return {
      now: "Installing PyTorch and the model libraries into a folder just for this model.",
      after: "Next, a local page starts, then the weights download.",
    };
  }
  if (phase === "starting") {
    return {
      now: "Starting the local page.",
      after: "Next, the weights download. The page says Ready when you can use the model.",
    };
  }
  if (phase === "ready") {
    return {
      now: "The weights are loaded.",
      after: "Open the page, type a sentence, and press Run.",
    };
  }
  return {
    now: "The page is up. The model file is still downloading.",
    after: "Open it whenever you want. Run stays disabled until the page says Ready.",
  };
}

function cloneEstimate(phase: string, message: string): string {
  const text = `${phase} ${message}`.toLowerCase();
  if (text.includes("docker") || text.includes("build") || text.includes("compos")) return "A first Docker build often takes several minutes.";
  if (text.includes("clon")) return "Usually under a minute.";
  if (text.includes("repair") || text.includes("fix")) return "A repair pass can take a few minutes.";
  if (phase === "live" || phase === "guide") return "This one is finished.";
  return "Devly will keep this row updated.";
}

export function JobMenu() {
  const ctx = useContext(JobsContext);
  const [open, setOpen] = useState(true);
  if (!ctx || ctx.jobs.length === 0) return null;
  const running = ctx.jobs.filter((job) => job.phase !== "ready" && job.phase !== "live" && job.phase !== "failed" && job.phase !== "guide").length;
  const label = running > 0 ? `${running} running` : "Jobs";
  return (
    <div className="job-menu">
      <button type="button" className="job-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className={`job-dot ${running > 0 ? "on" : ""}`} />
        {label}
      </button>
      {open && (
        <div className="job-panel" role="status">
          {ctx.jobs.map((job) => (
            <JobCard key={job.id} job={job} onOpen={ctx.openUrl} onDismiss={() => ctx.dismiss(job.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ job, onOpen, onDismiss }: { job: RunningJob; onOpen: (url: string) => void; onDismiss: () => void }) {
  const done = job.phase === "ready" || job.phase === "live" || job.phase === "guide";
  const failed = job.phase === "failed";
  const estimate = job.estimate || (job.kind === "clone" ? cloneEstimate(job.phase, job.detail) : undefined);
  return (
    <article className="job-card">
      <div className="job-card-top">
        <p className="job-kicker">{job.kind === "model" ? "Model" : "Try Live"}</p>
        {(done || failed) && (
          <button type="button" className="job-dismiss" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
      <h3 className="h-card">{job.title}</h3>
      {job.kind === "model" && !failed ? <ModelSteps phase={job.phase} /> : null}
      <p className="job-now">{failed ? job.detail : job.kind === "model" ? modelNow(job.phase).now : job.detail}</p>
      {job.kind === "model" && !failed && <p className="job-after">{modelNow(job.phase).after}</p>}
      {estimate && <p className="job-estimate">{estimate}</p>}
      {job.url && (
        <button type="button" className="btn btn-outline" onClick={() => onOpen(job.url!)}>
          Open {job.url.replace(/\/$/, "")}
        </button>
      )}
    </article>
  );
}

function ModelSteps({ phase }: { phase: string }) {
  const current = modelIndex(phase);
  return (
    <ol className="job-steps">
      {MODEL_STEPS.map((label, index) => (
        <li key={label} className={index < current ? "done" : index === current ? "current" : ""}>
          {label}
        </li>
      ))}
    </ol>
  );
}
