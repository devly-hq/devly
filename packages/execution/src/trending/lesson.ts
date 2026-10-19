import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { RunPlan } from "./inspect.js";

export interface ProjectFileNote {
  /** Path relative to the project folder. */
  path: string;
  about: string;
}

export interface ProjectLesson {
  title: string;
  directory: string;
  /** What the project does, in plain language. */
  what: string;
  /** What to click on the running page. */
  tryIt: string;
  /** How Devly got it onto this machine and started it. */
  how: string;
  /** Tools used to download and run it. */
  used: string[];
  files: ProjectFileNote[];
  demoUrl?: string;
  live: boolean;
}

export interface LessonInput {
  title: string;
  directory: string;
  description?: string;
  mode: "try-live" | "learn";
  plan?: RunPlan;
  demoUrl?: string;
  live?: boolean;
  dockerBootstrapped?: boolean;
  /** Manifest entry files, checked before the usual names. */
  preferredFiles?: string[];
}

const COMMON_FILES = [
  "src/index.ts",
  "src/index.js",
  "src/main.ts",
  "src/main.js",
  "src/server.ts",
  "src/server.js",
  "src/App.tsx",
  "src/app.tsx",
  "src/app.py",
  "app/main.py",
  "main.py",
  "app.py",
  "server.py",
  "manage.py",
  "index.js",
  "index.ts",
  "server.js",
  "main.go",
];

const MAX_FILES = 6;

/**
 * A lesson Shade can show without an agent: the README, the command that
 * started the project, and a handful of files that actually matter.
 */
export async function collectProjectLesson(input: LessonInput): Promise<ProjectLesson> {
  const readme = await readFirst(["README.md", "README.rst", "readme.md"], input.directory);
  const lessonMd = input.mode === "learn" ? await readRel(input.directory, "LESSON.md") : undefined;
  const page = userPageUrl(input.demoUrl);
  const shown: LessonInput = { ...input, demoUrl: page };
  const what =
    openingSection(lessonMd) ||
    paragraph(lessonMd) ||
    paragraph(readme?.text) ||
    clean(input.description) ||
    `${input.title} is the project Devly just ran on this computer.`;
  const notes = lessonFileNotes(lessonMd);
  const files = await pickFiles(shown, readme?.rel, notes);
  const steps = trySteps(lessonMd);
  const tryIt =
    steps ||
    (shown.mode === "learn" && page
      ? "Open the app. The /health address only says the server is awake. The page is where you try the idea."
      : "");

  return {
    title: input.title,
    directory: input.directory,
    what,
    tryIt,
    how: howWeRan(shown),
    used: toolsUsed(shown),
    files,
    demoUrl: page,
    live: input.live === true,
  };
}

/** The page a person opens. /health is only the check Devly uses. */
export function userPageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
    if (/^\/(health|healthz|ready|live)\/?$/i.test(parsed.pathname)) {
      parsed.pathname = "/";
      parsed.search = "";
      parsed.hash = "";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function howWeRan(input: LessonInput): string {
  const steps: string[] = [];
  if (input.mode === "learn") {
    steps.push("Devly built this lab in a folder on your computer so you can study one idea in a small project.");
  } else {
    steps.push(`Devly downloaded ${input.title} from GitHub into a folder on your computer.`);
  }
  if (input.dockerBootstrapped) {
    steps.push("Docker was not running, so Devly started it first.");
  }
  const started = input.plan?.start.map((cmd) => cmd.description).filter(Boolean) ?? [];
  if (started.length > 0) {
    steps.push(`It then ran ${started.join(", then ")}.`);
  } else if (input.plan?.summary) {
    steps.push(input.plan.summary);
  }
  if (input.live && input.demoUrl) {
    steps.push(`The app is running at ${input.demoUrl}.`);
  } else if (input.live === false && started.length > 0) {
    steps.push("That command did not open a page, so there is no local address to visit.");
  } else if (input.live === false && !input.plan?.summary) {
    steps.push("The project did not stay running. The files below are still how it is built.");
  }
  return steps.join(" ");
}

function toolsUsed(input: LessonInput): string[] {
  const used: string[] = [];
  if (input.mode === "try-live") used.push("Git");
  const commands = [...(input.plan?.setup ?? []), ...(input.plan?.start ?? [])]
    .map((cmd) => `${cmd.executable} ${cmd.args.join(" ")}`)
    .join(" ");
  if (input.plan?.usesDocker || /\bdocker\b/.test(commands)) used.push("Docker");
  if (input.plan?.kind === "compose" || /\bcompose\b/.test(commands)) used.push("Docker Compose");
  if (input.plan?.kind === "node" || /\b(npm|pnpm|yarn|node)\b/.test(commands)) used.push("Node.js");
  if (input.plan?.kind === "python" || /\b(python|pip|uv)\b/.test(commands)) used.push("Python");
  return used;
}

async function pickFiles(
  input: LessonInput,
  readmeRel: string | undefined,
  fileNotes: Map<string, string>,
): Promise<ProjectFileNote[]> {
  const rels: string[] = [];
  const add = (rel?: string) => {
    if (!rel || rels.length >= MAX_FILES) return;
    const norm = rel.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!norm || norm.split("/").includes("..") || rels.includes(norm)) return;
    rels.push(norm);
  };

  add(readmeRel);
  add(input.plan?.composeFile);
  if (input.plan?.kind === "dockerfile") add("Dockerfile");
  for (const rel of input.preferredFiles ?? []) add(rel);
  const pkg = await readRel(input.directory, "package.json");
  if (pkg) {
    add("package.json");
    add(mainFromPackage(pkg));
  }
  if (input.plan?.kind === "python") {
    add("requirements.txt");
    add("pyproject.toml");
  }
  for (const rel of COMMON_FILES) add(rel);

  const picked: ProjectFileNote[] = [];
  for (const rel of rels) {
    const text = await readRel(input.directory, rel);
    if (text == null) continue;
    picked.push({ path: rel, about: aboutFile(rel, text, input, fileNotes) });
    if (picked.length >= MAX_FILES) break;
  }
  return picked;
}

function aboutFile(rel: string, text: string, input: LessonInput, notes: Map<string, string>): string {
  const fromLesson = notes.get(rel);
  const base = path.posix.basename(rel).toLowerCase();
  if (fromLesson && base !== "readme.md" && base !== "readme.rst") return fromLesson;
  if (base === "readme.md" || base === "readme.rst") {
    const intro = paragraph(text);
    return intro
      ? `The project's own introduction. ${intro}`
      : "The project's own introduction.";
  }
  if (base === "docker-compose.yml" || base === "docker-compose.yaml" || base === "compose.yml" || base === "compose.yaml") {
    const services = composeServices(text);
    const list = services.length > 0 ? services.join(", ") : "its services";
    return `Devly started the project from this file. It runs ${list}.`;
  }
  if (base === "dockerfile") {
    const from = text.match(/^\s*FROM\s+(\S+)/im)?.[1];
    return from
      ? `Devly built a container from this file. The image starts from ${from}.`
      : "Devly built a container from this file and ran it.";
  }
  if (base === "package.json") {
    try {
      const pkg = JSON.parse(text) as { description?: string; scripts?: { start?: string; dev?: string } };
      const script = pkg.scripts?.start ?? pkg.scripts?.dev;
      const desc = clean(pkg.description);
      if (desc && script) return `${desc} The run script is "${script}".`;
      if (desc) return desc;
      if (script) return `The Node manifest. The run script is "${script}".`;
    } catch {
      /* fall through */
    }
    return "The Node manifest: name, libraries, and the command that starts the app.";
  }
  if (base === "requirements.txt" || base === "pyproject.toml") {
    return "The Python libraries installed before this project can run.";
  }
  const comment = leadingComment(text);
  if (comment) return comment;
  if (input.plan?.composeFile === rel) return "Devly started the project from this file.";
  return "One of the files the running app is built from.";
}

function mainFromPackage(text: string): string | undefined {
  try {
    const pkg = JSON.parse(text) as { main?: string };
    if (typeof pkg.main === "string" && pkg.main.length > 0 && pkg.main.length < 180) return pkg.main;
  } catch {
    /* ignore */
  }
  return undefined;
}

function composeServices(text: string): string[] {
  const idx = text.search(/^services:\s*$/m);
  const body = idx >= 0 ? text.slice(idx) : text;
  return [...body.matchAll(/^ {2}([A-Za-z0-9_.-]+):\s*$/gm)].map((m) => m[1]!).slice(0, 4);
}

function leadingComment(text: string): string | undefined {
  const lines = text.replace(/\r/g, "").split("\n").slice(0, 12);
  const bits: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    const m = /^(?:\/\/+|#+)\s*(.+)$/.exec(t) ?? /^\/\*\*?\s*(.+?)(?:\*\/)?$/.exec(t);
    if (!m) {
      if (bits.length) break;
      if (t === "" || t === "/*" || t === "*/" || t.startsWith("*")) {
        const star = /^\*\s+(.+)$/.exec(t);
        if (star) bits.push(star[1]!);
        continue;
      }
      break;
    }
    bits.push(m[1]!.replace(/\*\/$/, "").trim());
  }
  const sentence = clean(bits.join(" "));
  if (sentence.length < 12) return undefined;
  return sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence;
}

function paragraph(text: string | undefined): string {
  if (!text) return "";
  const kept: string[] = [];
  let tagline = "";
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const t = raw.trim();
    if (!t) {
      if (kept.length) break;
      continue;
    }
    if (
      t.startsWith("#") ||
      t.startsWith("!") ||
      t.startsWith("<") ||
      t.startsWith("|") ||
      t.startsWith(">") ||
      t === "---" ||
      t.startsWith("[![") ||
      t.startsWith("[!") ||
      /^\[.+\]:\s+\S+/.test(t)
    ) {
      continue;
    }
    if (/^\*[^*]+\*$/.test(t) || /^_[^_]+_$/.test(t)) {
      tagline = unwrapMarkdown(t);
      continue;
    }
    kept.push(unwrapMarkdown(t).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
  }
  const body = clipSentences(clean(kept.join(" ")));
  return body || tagline;
}

/** Every paragraph under the first heading, until the next heading. */
function openingSection(markdown: string | undefined): string {
  if (!markdown) return "";
  const parts: string[] = [];
  let seenHeading = false;
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const t = raw.trim();
    if (/^#{1,6}\s+/.test(t)) {
      if (seenHeading && parts.some((part) => part.length > 0)) break;
      seenHeading = true;
      continue;
    }
    if (!seenHeading) continue;
    if (!t) {
      if (parts.length > 0 && parts[parts.length - 1] !== "") parts.push("");
      continue;
    }
    if (
      t.startsWith("```") ||
      t.startsWith("![") ||
      t.startsWith("<") ||
      t.startsWith("|") ||
      t.startsWith(">") ||
      t === "---" ||
      /^\*[^*]+\*$/.test(t) ||
      /^_[^_]+_$/.test(t)
    ) {
      continue;
    }
    parts.push(unwrapMarkdown(t).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
  }
  const text = parts
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return clipSentences(text);
}

function clipSentences(text: string, max = 1400): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const end = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (end > 80) return slice.slice(0, end + 1);
  return `${slice.trimEnd()}…`;
}

function trySteps(markdown: string | undefined): string {
  if (!markdown) return "";
  let capture = false;
  const steps: string[] = [];
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const t = raw.trim();
    if (/^#{1,3}\s+/.test(t)) {
      if (capture && steps.length > 0) break;
      capture = /\b(watch|try it|try this)\b/i.test(t);
      continue;
    }
    if (!capture) continue;
    const step = /^\d+\.\s+(.+)$/.exec(t);
    if (!step) continue;
    steps.push(step[1]!.replace(/`([^`]+)`/g, "$1"));
    if (steps.length >= 4) break;
  }
  return steps.join(" ");
}

function lessonFileNotes(markdown: string | undefined): Map<string, string> {
  const notes = new Map<string, string>();
  if (!markdown) return notes;
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const match = /^[-*]\s+`([^`]+)`:\s*(.+)$/.exec(raw.trim());
    if (!match) continue;
    notes.set(match[1]!.replace(/^\.\//, ""), match[2]!.trim());
  }
  return notes;
}

function unwrapMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function readFirst(
  names: string[],
  root: string,
): Promise<{ rel: string; text: string } | undefined> {
  for (const rel of names) {
    const text = await readRel(root, rel);
    if (text != null) return { rel, text };
  }
  return undefined;
}

async function readRel(root: string, rel: string): Promise<string | undefined> {
  const abs = resolveInside(root, rel);
  if (!abs) return undefined;
  try {
    const info = await stat(abs);
    if (!info.isFile() || info.size > 64_000) return undefined;
    const text = await readFile(abs, "utf8");
    if (text.includes("\u0000")) return undefined;
    return text;
  } catch {
    return undefined;
  }
}

function resolveInside(root: string, rel: string): string | undefined {
  if (!rel || rel.includes("\0")) return undefined;
  const abs = path.resolve(root, rel);
  const back = path.relative(root, abs);
  if (back.startsWith("..") || path.isAbsolute(back)) return undefined;
  return abs;
}
