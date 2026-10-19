import * as vscode from "vscode";
import path from "node:path";
import { uiPalette, type UiPalette } from "@devly/mascot";
import type { MascotPreferences } from "@devly/protocol";
import type { ProjectLesson } from "@devly/execution";

let openPanel: vscode.WebviewPanel | undefined;

/**
 * The same kind of side panel as Shade's daily nudge, filled with the lesson
 * for a project that just finished. Important files open in the editor.
 */
export async function showProjectLesson(lesson: ProjectLesson, mascot: MascotPreferences): Promise<void> {
  await openLessonFiles(lesson);

  const theme = uiPalette(mascot.theme);
  const eye = mascot.eyeColor || theme.eye;
  openPanel?.dispose();
  const panel = vscode.window.createWebviewPanel(
    "devly.projectLesson",
    lesson.title,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
  );
  openPanel = panel;
  panel.onDidDispose(() => {
    if (openPanel === panel) openPanel = undefined;
  });
  panel.webview.html = renderHtml(lesson, mascot.name || "Shade", theme, eye);
  panel.webview.onDidReceiveMessage(async (msg: { type?: string; path?: string; url?: string }) => {
    if (msg?.type === "close") {
      panel.dispose();
      return;
    }
    if (msg?.type === "openFile" && msg.path) {
      await revealFile(lesson.directory, msg.path);
      return;
    }
    if (msg?.type === "openUrl" && msg.url && isLocalHttp(msg.url)) {
      await vscode.env.openExternal(vscode.Uri.parse(msg.url));
    }
  });
}

async function openLessonFiles(lesson: ProjectLesson): Promise<void> {
  for (const file of lesson.files) {
    await revealFile(lesson.directory, file.path);
  }
}

async function revealFile(root: string, rel: string): Promise<void> {
  const abs = resolveInside(root, rel);
  if (!abs) return;
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.One,
      preview: false,
      preserveFocus: true,
    });
  } catch {
    /* Binary or missing files stay listed in the lesson. */
  }
}

function resolveInside(root: string, rel: string): string | undefined {
  if (!rel || rel.includes("\0")) return undefined;
  const abs = path.resolve(root, rel);
  const back = path.relative(root, abs);
  if (back.startsWith("..") || path.isAbsolute(back)) return undefined;
  return abs;
}

function isLocalHttp(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  } catch {
    return false;
  }
}

function renderHtml(
  lesson: ProjectLesson,
  name: string,
  theme: UiPalette,
  eye: string,
): string {
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  const files = lesson.files
    .map(
      (file) => `<article class="file">
        <div class="file-row">
          <code>${escapeHtml(file.path)}</code>
          <button type="button" class="open" data-open="${escapeHtml(file.path)}">Open</button>
        </div>
        <p>${escapeHtml(file.about)}</p>
      </article>`,
    )
    .join("");
  const used = lesson.used.map((tool) => `<span class="pill">${escapeHtml(tool)}</span>`).join("");
  const openApp =
    lesson.live && lesson.demoUrl
      ? `<button type="button" class="primary" data-url="${escapeHtml(lesson.demoUrl)}">Open the app</button>`
      : "";
  const trySection = lesson.tryIt
    ? `<section>
      <h2>Try it</h2>
      <p>${escapeHtml(lesson.tryIt)}</p>
      ${openApp}
    </section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style nonce="${nonce}">
    :root {
      --bg: ${theme.bg};
      --surface: ${theme.surface};
      --border: ${theme.border};
      --accent: ${theme.accent};
      --accent-hover: ${theme.accentHover};
      --text: ${theme.text};
      --muted: ${theme.muted};
      --display: "Space Grotesk", "Avenir Next", "Segoe UI", var(--vscode-font-family, ui-sans-serif), system-ui, sans-serif;
      --mono: "JetBrains Mono", "SF Mono", "Cascadia Code", var(--vscode-editor-font-family, ui-monospace), monospace;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      font-family: var(--vscode-font-family, ui-sans-serif), system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: var(--text);
      background: var(--bg);
    }
    .wrap { padding: 16px 16px 28px; max-width: 640px; }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .mark { width: 22px; height: 22px; flex-shrink: 0; }
    .brand-name { font-family: var(--display); font-size: 14px; font-weight: 600; letter-spacing: -0.02em; }
    .brand-sub {
      font-family: var(--mono); font-size: 10px; letter-spacing: 0.04em;
      text-transform: uppercase; color: var(--muted);
    }
    .close {
      margin-left: auto; background: transparent; color: var(--muted);
      border: 1px solid var(--border); border-radius: 6px; width: 28px; height: 28px; cursor: pointer;
    }
    .close:hover { color: var(--text); border-color: var(--accent); }
    h1 {
      margin: 0 0 14px; font-family: var(--display); font-size: 18px; font-weight: 600;
      letter-spacing: -0.03em; line-height: 1.3;
    }
    section {
      background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
      padding: 12px 14px; margin-bottom: 10px;
    }
    h2 {
      margin: 0 0 6px; font-family: var(--mono); font-size: 10px; font-weight: 500;
      letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent);
    }
    p { margin: 0; color: var(--text); }
    .pills { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill {
      font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
      color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent);
    }
    .file { border-top: 1px solid var(--border); padding-top: 10px; margin-top: 10px; }
    .file:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
    .file-row { display: flex; align-items: center; gap: 8px; }
    code {
      font-family: var(--mono); font-size: 12px; color: var(--text);
      overflow-wrap: anywhere;
    }
    .file p { margin-top: 4px; color: var(--muted); font-size: 12.5px; }
    button { font: inherit; cursor: pointer; }
    .open, .primary {
      border-radius: 6px; border: 1px solid var(--accent); background: transparent;
      color: var(--accent); font-family: var(--mono); font-size: 11px; padding: 4px 8px;
    }
    .open { margin-left: auto; flex-shrink: 0; }
    .primary {
      margin-top: 10px; background: var(--accent); color: ${theme.ink}; font-weight: 600;
      font-family: inherit; font-size: 12px; padding: 7px 12px;
    }
    .primary:hover { background: var(--accent-hover); }
    .open:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="brand">
      <svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="4" fill="${theme.surface}" stroke="${theme.border}"/>
        <path d="M6 12c0-2.4 1.5-4 4-4h4c2.5 0 4 1.6 4 4v3H6v-3Z" fill="${theme.body}"/>
        <path d="M7.2 10.2 5.5 7.6M16.8 10.2 18.5 7.6" stroke="${eye}" stroke-width="1.2"/>
        <rect x="8.2" y="11.2" width="2.2" height="1.6" fill="${eye}"/>
        <rect x="13.6" y="11.2" width="2.2" height="1.6" fill="${eye}"/>
      </svg>
      <div>
        <div class="brand-name">${escapeHtml(name)}</div>
        <div class="brand-sub">Project lesson</div>
      </div>
      <button class="close" data-close="1" aria-label="Close">✕</button>
    </header>
    <h1>${escapeHtml(lesson.title)}</h1>
    <section>
      <h2>What this project does</h2>
      <p>${escapeHtml(lesson.what)}</p>
      ${lesson.tryIt ? "" : openApp}
    </section>
    ${trySection}
    <section>
      <h2>How we did it</h2>
      <p>${escapeHtml(lesson.how)}</p>
    </section>
    <section>
      <h2>What we used to run it</h2>
      <div class="pills">${used || `<span class="pill">This computer</span>`}</div>
    </section>
    <section>
      <h2>Important files</h2>
      ${files || `<p>Shade could not find a README or a start file in this folder.</p>`}
    </section>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    for (const btn of document.querySelectorAll("[data-open]")) {
      btn.addEventListener("click", () => {
        vscode.postMessage({ type: "openFile", path: btn.getAttribute("data-open") });
      });
    }
    for (const btn of document.querySelectorAll("[data-url]")) {
      btn.addEventListener("click", () => {
        vscode.postMessage({ type: "openUrl", url: btn.getAttribute("data-url") });
      });
    }
    document.querySelector("[data-close]")?.addEventListener("click", () => {
      vscode.postMessage({ type: "close" });
    });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)]!;
  return out;
}
