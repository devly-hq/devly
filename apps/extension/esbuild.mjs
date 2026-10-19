import * as esbuild from "esbuild";
import { cpSync, mkdirSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const watch = process.argv.includes("--watch");

mkdirSync("dist", { recursive: true });

// Copy webview build into extension media if present
const webviewDist = path.resolve("../webview/dist");
const mediaOut = path.resolve("media/webview");
if (existsSync(webviewDist)) {
  mkdirSync(mediaOut, { recursive: true });
  cpSync(webviewDist, mediaOut, { recursive: true });
}

// Bundle content catalog with the extension
const contentSrc = path.resolve("../../content");
const contentOut = path.resolve("content");
if (existsSync(contentSrc)) {
  if (existsSync(contentOut)) rmSync(contentOut, { recursive: true, force: true });
  cpSync(contentSrc, contentOut, { recursive: true });
}

const ctx = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  platform: "node",
  format: "cjs",
  sourcemap: true,
  target: "node20",
  logLevel: "info",
});

if (watch) {
  await ctx.watch();
  console.log("watching...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
