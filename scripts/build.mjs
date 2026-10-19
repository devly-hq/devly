#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function run(cmd, args, cwd = process.cwd()) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const root = path.resolve(import.meta.dirname, "..");

// Ensure esbuild binary
const pnpmEsbuild = spawnSync("bash", ["-lc", "ls -d node_modules/.pnpm/esbuild@*/node_modules/esbuild | head -1"], {
  cwd: root,
  encoding: "utf8",
});
const esbuildDir = pnpmEsbuild.stdout.trim();
if (esbuildDir && existsSync(path.join(esbuildDir, "install.js"))) {
  if (!existsSync(path.join(esbuildDir, "bin", "esbuild")) || spawnSync(path.join(esbuildDir, "bin", "esbuild"), ["--version"]).status !== 0) {
    run("node", [path.join(esbuildDir, "install.js")], root);
  }
}

for (const pkg of ["protocol", "core", "mascot", "execution", "agents"]) {
  run("npx", ["tsc", "-p", `packages/${pkg}/tsconfig.json`], root);
}
run("npx", ["vite", "build"], path.join(root, "apps/webview"));
run("node", ["esbuild.mjs"], path.join(root, "apps/extension"));
console.log("Build complete.");
