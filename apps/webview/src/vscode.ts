import type { HostToWebview, WebviewToHost } from "@devly/protocol";
import { parseHostMessage } from "@devly/protocol";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | undefined;
try {
  api = acquireVsCodeApi();
} catch {
  api = {
    postMessage: (m) => console.log("postMessage", m),
    getState: () => undefined,
    setState: () => undefined,
  };
}

export function post(message: WebviewToHost): void {
  api?.postMessage(message);
}

export function onHostMessage(handler: (msg: HostToWebview) => void): () => void {
  const listener = (event: MessageEvent) => {
    const msg = parseHostMessage(event.data);
    if (msg) handler(msg);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
