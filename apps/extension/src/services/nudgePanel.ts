import * as vscode from "vscode";
import { uiPalette, type UiPalette } from "@devly/mascot";
import type { MascotPreferences } from "@devly/protocol";
import type { NudgeOffer } from "./nudgeOffers.js";

export type NudgeChoice =
  | { action: "build"; topicId: string }
  | { action: "repo"; id: string }
  | { action: "more" }
  | { action: "later" }
  | { action: "dismiss" };

export interface NudgeContent {
  offers: NudgeOffer[];
  mascot: MascotPreferences;
}

/**
 * Shade's daily nudge. Same side panel, type, and theme tokens as the project lesson.
 */
export function showShadeNudge(content: NudgeContent): Promise<NudgeChoice | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (choice?: NudgeChoice) => {
      if (settled) return;
      settled = true;
      panel.dispose();
      resolve(choice);
    };

    const palette = uiPalette(content.mascot.theme);
    const panel = vscode.window.createWebviewPanel(
      "devly.shadeNudge",
      "Shade",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [] },
    );

    panel.webview.html = renderHtml(content, palette);
    panel.webview.onDidReceiveMessage((msg: { type?: string; choice?: NudgeChoice }) => {
      if (msg?.type === "choice" && msg.choice) finish(msg.choice);
      if (msg?.type === "close") finish(undefined);
    });
    panel.onDidDispose(() => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    });
  });
}

function renderHtml(content: NudgeContent, palette: UiPalette): string {
  const nonce = getNonce();
  const csp = [`default-src 'none'`, `style-src 'nonce-${nonce}'`, `script-src 'nonce-${nonce}'`].join("; ");
  const name = escapeHtml(content.mascot.name || "Shade");
  const eye = palette.eye;
  const cards = content.offers
    .map((offer) => {
      const label = offer.kind === "repo" ? "Try this repo" : offer.kind === "live" ? "Let's build" : "Start this";
      const action = offer.kind === "repo" ? "repo" : "build";
      const id = offer.kind === "repo" ? offer.id : offer.topicId ?? "";
      const buttonClass = offer.kind === "live" ? "primary" : "open";
      return `<section>
        <h2>${laneLabel(offer.kind)}</h2>
        <p class="title">${escapeHtml(offer.title)}</p>
        <p class="desc">${escapeHtml(offer.subtitle)}</p>
        <div class="pills"><span class="pill">${escapeHtml(offer.meta)}</span></div>
        <button type="button" class="${buttonClass}" data-action="${action}" data-id="${escapeHtml(id)}">${label}</button>
      </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style nonce="${nonce}">
    :root {
      --bg: ${palette.bg};
      --surface: ${palette.surface};
      --border: ${palette.border};
      --accent: ${palette.accent};
      --accent-hover: ${palette.accentHover};
      --text: ${palette.text};
      --muted: ${palette.muted};
      --display: "Space Grotesk", "Avenir Next", "Segoe UI", var(--vscode-font-family, ui-sans-serif), system-ui, sans-serif;
      --mono: "JetBrains Mono", "SF Mono", "Cascadia Code", var(--vscode-editor-font-family, ui-monospace), monospace;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; min-height: 100%;
      font-family: var(--vscode-font-family, ui-sans-serif), system-ui, sans-serif;
      font-size: 13px; line-height: 1.5; color: var(--text); background: var(--bg);
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
    .title { margin: 0; font-weight: 600; }
    .desc { margin: 4px 0 0; color: var(--muted); font-size: 12.5px; }
    .pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .pill {
      font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
      color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent);
    }
    button { font: inherit; cursor: pointer; }
    .open, .primary, .ghost {
      border-radius: 6px; border: 1px solid var(--accent); background: transparent;
      color: var(--accent); font-family: var(--mono); font-size: 11px; padding: 4px 8px;
    }
    .primary {
      margin-top: 10px; background: var(--accent); color: ${palette.ink}; font-weight: 600;
      font-family: inherit; font-size: 12px; padding: 7px 12px;
    }
    .open { margin-top: 10px; }
    .primary:hover { background: var(--accent-hover); }
    .open:hover, .ghost:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); }
    .ghost { color: var(--muted); border-color: var(--border); font-family: inherit; font-size: 12px; padding: 7px 12px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="brand">
      <svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="4" fill="${palette.surface}" stroke="${palette.border}"/>
        <path d="M6 12c0-2.4 1.5-4 4-4h4c2.5 0 4 1.6 4 4v3H6v-3Z" fill="${palette.body}"/>
        <path d="M7.2 10.2 5.5 7.6M16.8 10.2 18.5 7.6" stroke="${eye}" stroke-width="1.2"/>
        <rect x="8.2" y="11.2" width="2.2" height="1.6" fill="${eye}"/>
        <rect x="13.6" y="11.2" width="2.2" height="1.6" fill="${eye}"/>
      </svg>
      <div>
        <div class="brand-name">${name}</div>
        <div class="brand-sub">Today</div>
      </div>
      <button class="close" data-action="dismiss" aria-label="Close">✕</button>
    </header>
    <h1>Three things you can try today</h1>
    ${cards}
    <div class="actions">
      <button type="button" class="ghost" data-action="more">Open Shade</button>
      <button type="button" class="ghost" data-action="later">Later</button>
      <button type="button" class="ghost" data-action="dismiss">Not today</button>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    for (const btn of document.querySelectorAll("[data-action]")) {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id") || "";
        if (action === "build") vscode.postMessage({ type: "choice", choice: { action: "build", topicId: id } });
        else if (action === "repo") vscode.postMessage({ type: "choice", choice: { action: "repo", id } });
        else vscode.postMessage({ type: "choice", choice: { action } });
      });
    }
  </script>
</body>
</html>`;
}

function laneLabel(kind: NudgeOffer["kind"]): string {
  if (kind === "live") return "Live";
  if (kind === "repo") return "GitHub";
  return "Small task";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)]!;
  return out;
}
