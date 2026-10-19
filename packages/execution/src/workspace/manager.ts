import { access, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

export type WorkspaceMode = "current" | "new-window" | "temporary";

export interface LabMeta {
  id: string;
  topicTitle: string;
  topicId?: string;
  directory: string;
  workspaceMode: WorkspaceMode;
  agentId: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  demoUrl?: string;
  repairAttempts?: number;
}

export interface CreateLabOptions {
  topicTitle: string;
  topicId?: string;
  agentId: string;
  workspaceMode: WorkspaceMode;
  currentWorkspaceRoot?: string;
  homeLabsRoot?: string;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "lab"
  );
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export class WorkspaceManager {
  constructor(private homeLabsRoot = path.join(os.homedir(), "DevlyLabs")) {}

  async createLab(options: CreateLabOptions): Promise<LabMeta> {
    const baseSlug = slugify(options.topicTitle);
    const stamp = randomBytes(3).toString("hex");
    let id = `${baseSlug}-${stamp}`;
    let directory: string;

    if (options.workspaceMode === "current") {
      if (!options.currentWorkspaceRoot) {
        throw new Error("No workspace folder is open. Choose New Window or Temporary.");
      }
      const root = path.join(options.currentWorkspaceRoot, ".devly", "labs");
      directory = await this.uniqueDir(root, id);
      id = path.basename(directory);
    } else if (options.workspaceMode === "temporary") {
      const root = path.join(os.tmpdir(), "devly-labs");
      directory = await this.uniqueDir(root, id);
      id = path.basename(directory);
    } else {
      const root = options.homeLabsRoot ?? this.homeLabsRoot;
      directory = await this.uniqueDir(root, id);
      id = path.basename(directory);
    }

    await mkdir(directory, { recursive: true });
    await mkdir(path.join(directory, ".devly"), { recursive: true });

    const now = new Date().toISOString();
    const meta: LabMeta = {
      id,
      topicTitle: options.topicTitle,
      topicId: options.topicId,
      directory,
      workspaceMode: options.workspaceMode,
      agentId: options.agentId,
      state: "CREATED",
      createdAt: now,
      updatedAt: now,
      repairAttempts: 0,
    };
    await this.writeMeta(meta);
    return meta;
  }

  async writeMeta(meta: LabMeta): Promise<void> {
    const file = path.join(meta.directory, ".devly", "lab.json");
    await mkdir(path.dirname(file), { recursive: true });
    meta.updatedAt = new Date().toISOString();
    await writeFile(file, JSON.stringify(meta, null, 2), "utf8");
  }

  async readMeta(directory: string): Promise<LabMeta | undefined> {
    try {
      const raw = await readFile(path.join(directory, ".devly", "lab.json"), "utf8");
      return JSON.parse(raw) as LabMeta;
    } catch {
      return undefined;
    }
  }

  async deleteLab(directory: string): Promise<void> {
    // Safety: only delete if it looks like a Devly lab
    const meta = await this.readMeta(directory);
    if (!meta) throw new Error("Not a Devly lab directory");
    await rm(directory, { recursive: true, force: true });
  }

  private async uniqueDir(root: string, id: string): Promise<string> {
    await mkdir(root, { recursive: true });
    let candidate = path.join(root, id);
    let n = 2;
    while (await pathExists(candidate)) {
      candidate = path.join(root, `${id}-${n}`);
      n += 1;
    }
    return candidate;
  }
}
