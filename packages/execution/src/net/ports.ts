import net from "node:net";

const PORT_FLAGS = new Set(["--port", "-p", "--bind", "-b", "--listen"]);

export function portFromUrl(url: string | undefined): number | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!parsed.port) return undefined;
    const port = Number(parsed.port);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
  } catch {
    return undefined;
  }
}

/** True when something on this computer is already accepting connections there. */
export function portIsBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(true));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(false));
    });
  });
}

export async function firstFreePort(start: number): Promise<number> {
  const first = Math.max(1, start);
  for (let port = first; port <= Math.min(65535, first + 30); port += 1) {
    if (!(await portIsBusy(port))) return port;
  }
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export function retargetUrl(url: string, from: number, to: number): string {
  try {
    const parsed = new URL(url);
    if (Number(parsed.port) !== from) return url;
    parsed.port = String(to);
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Swap a loopback port inside one command's arguments. */
export function retargetArgs(args: string[], from: number, to: number): string[] {
  return args.map((arg, index) => retargetArg(arg, args[index - 1], from, to));
}

function retargetArg(arg: string, prev: string | undefined, from: number, to: number): string {
  const fromS = String(from);
  const toS = String(to);
  const flagged = /^(--(?:port|bind)|-p)=(\d+)$/.exec(arg);
  if (flagged && flagged[2] === fromS) return `${flagged[1]}=${toS}`;
  if (prev && (PORT_FLAGS.has(prev) || prev === "http.server") && arg === fromS) return toS;
  if (prev === "-p" || prev === "--publish") {
    const mapped = /^(?:((?:127\.0\.0\.1|localhost|0\.0\.0\.0):))?(\d+):(\d+)$/.exec(arg);
    if (mapped && mapped[2] === fromS) return `${mapped[1] ?? ""}${toS}:${mapped[3]}`;
  }
  return arg.replace(
    /(https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0)|(?:127\.0\.0\.1|localhost|0\.0\.0\.0)):(\d+)(?!\d)/g,
    (full, host: string, port: string) => (port === fromS ? `${host}:${toS}` : full),
  );
}

export interface PortMove {
  port: number;
  healthUrl?: string;
  /** The start command was rewritten onto a free port. */
  moved: boolean;
  /** The requested port is taken and the command does not say which port it binds. */
  blocked: boolean;
}

/**
 * If `port` is already taken, rewrite command arguments and the health URL
 * onto the next free port. A busy port is never reported as this run's port
 * unless the start command itself was moved.
 */
export async function relocateBusyPort(input: {
  port: number;
  commands: { args: string[] }[];
  healthUrl?: string;
}): Promise<PortMove> {
  if (!(await portIsBusy(input.port))) {
    return { port: input.port, healthUrl: input.healthUrl, moved: false, blocked: false };
  }
  const next = await firstFreePort(input.port + 1);
  let changed = false;
  for (const cmd of input.commands) {
    const args = retargetArgs(cmd.args, input.port, next);
    if (args.some((arg, index) => arg !== cmd.args[index])) {
      cmd.args = args;
      changed = true;
    }
  }
  if (!changed) {
    return { port: input.port, healthUrl: input.healthUrl, moved: false, blocked: true };
  }
  const healthUrl = input.healthUrl ? retargetUrl(input.healthUrl, input.port, next) : undefined;
  return { port: next, healthUrl, moved: true, blocked: false };
}
