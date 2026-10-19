import net from "node:net";
import { describe, expect, it } from "vitest";
import { relocateBusyPort, retargetArgs, userPageUrl } from "@devly/execution";

function listen(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        port,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

describe("relocateBusyPort", () => {
  it("moves a --port command and the health url onto a free port", async () => {
    const held = await listen();
    const commands = [{ args: ["-m", "repo_tour", "serve", "--port", String(held.port)] }];
    const moved = await relocateBusyPort({
      port: held.port,
      commands,
      healthUrl: `http://127.0.0.1:${held.port}/health`,
    });
    expect(moved.moved).toBe(true);
    expect(moved.blocked).toBe(false);
    expect(moved.port).not.toBe(held.port);
    expect(commands[0]?.args).toEqual(["-m", "repo_tour", "serve", "--port", String(moved.port)]);
    const health = new URL(moved.healthUrl ?? "");
    expect(health.port).toBe(String(moved.port));
    expect(health.pathname).toBe("/health");
    expect(userPageUrl(moved.healthUrl)).toBe(`http://127.0.0.1:${moved.port}/`);
    await held.close();
  });

  it("keeps the written port when nothing else is using it", async () => {
    const held = await listen();
    await held.close();
    const commands = [{ args: ["--port", String(held.port)] }];
    const moved = await relocateBusyPort({
      port: held.port,
      commands,
      healthUrl: `http://127.0.0.1:${held.port}/health`,
    });
    expect(moved).toMatchObject({ port: held.port, moved: false, blocked: false });
    expect(commands[0]?.args).toEqual(["--port", String(held.port)]);
  });

  it("refuses to claim a busy port when the start command cannot move", async () => {
    const held = await listen();
    const commands = [{ args: ["run", "start"] }];
    const moved = await relocateBusyPort({
      port: held.port,
      commands,
      healthUrl: `http://127.0.0.1:${held.port}/health`,
    });
    expect(moved.moved).toBe(false);
    expect(moved.blocked).toBe(true);
    expect(moved.port).toBe(held.port);
    expect(commands[0]?.args).toEqual(["run", "start"]);
    await held.close();
  });

  it("rewrites a docker publish argument's host port", () => {
    expect(retargetArgs(["-p", "8080:80"], 8080, 8081)).toEqual(["-p", "8081:80"]);
  });
});
