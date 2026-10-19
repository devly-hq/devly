import * as vscode from "vscode";
import {
  MascotPreferencesSchema,
  UserPreferencesSchema,
  type LabSummary,
  type MascotPreferences,
  type UserPreferences,
} from "@devly/protocol";

const KEYS = {
  prefs: "devly.preferences",
  mascot: "devly.mascot",
  labs: "devly.labs",
  progress: "devly.progress",
  recentlyShown: "devly.recentlyShown",
  lastNotifyDate: "devly.lastNotifyDate",
  notifyState: "devly.notifyState",
};

export interface NotifyState {
  date: string;
  count: number;
  /** Which half-days already fired: morning (<14:00) and/or afternoon */
  slots?: Array<"morning" | "afternoon">;
}

export interface ProgressState {
  completedTopicIds: string[];
  streakDays: number;
  lastCompletedAt?: string;
}

export class Persistence {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  getPreferences(): UserPreferences {
    const raw = this.ctx.globalState.get(KEYS.prefs, {});
    return UserPreferencesSchema.parse(raw);
  }

  async setPreferences(prefs: UserPreferences): Promise<void> {
    await this.ctx.globalState.update(KEYS.prefs, prefs);
  }

  async patchPreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
    const next = UserPreferencesSchema.parse({ ...this.getPreferences(), ...patch });
    await this.setPreferences(next);
    return next;
  }

  getMascot(): MascotPreferences {
    return MascotPreferencesSchema.parse(this.ctx.globalState.get(KEYS.mascot, {}));
  }

  async setMascot(prefs: MascotPreferences): Promise<void> {
    await this.ctx.globalState.update(KEYS.mascot, prefs);
  }

  async patchMascot(patch: Partial<MascotPreferences>): Promise<MascotPreferences> {
    const next = MascotPreferencesSchema.parse({ ...this.getMascot(), ...patch });
    await this.setMascot(next);
    return next;
  }

  getLabs(): LabSummary[] {
    return (this.ctx.globalState.get(KEYS.labs, []) as LabSummary[]) ?? [];
  }

  async setLabs(labs: LabSummary[]): Promise<void> {
    await this.ctx.globalState.update(KEYS.labs, labs);
  }

  async upsertLab(lab: LabSummary): Promise<void> {
    const labs = this.getLabs().filter((l) => l.id !== lab.id);
    labs.unshift(lab);
    await this.setLabs(labs.slice(0, 100));
  }

  getProgress(): ProgressState {
    return (
      this.ctx.globalState.get(KEYS.progress, {
        completedTopicIds: [],
        streakDays: 0,
      }) as ProgressState
    );
  }

  async markCompleted(topicId?: string): Promise<ProgressState> {
    const progress = this.getProgress();
    if (topicId && !progress.completedTopicIds.includes(topicId)) {
      progress.completedTopicIds.push(topicId);
    }
    const today = new Date().toISOString().slice(0, 10);
    const last = progress.lastCompletedAt?.slice(0, 10);
    if (last === today) {
      /* same day */
    } else {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      progress.streakDays = last === yesterday ? progress.streakDays + 1 : 1;
    }
    progress.lastCompletedAt = new Date().toISOString();
    await this.ctx.globalState.update(KEYS.progress, progress);
    return progress;
  }

  getRecentlyShown(): string[] {
    return this.ctx.globalState.get(KEYS.recentlyShown, []) as string[];
  }

  /** Replace history (rare). Prefer appendRecentlyShown for Refresh. */
  async setRecentlyShown(ids: string[]): Promise<void> {
    await this.ctx.globalState.update(KEYS.recentlyShown, ids.slice(0, 80));
  }

  /** Prepend ids so Refresh can hard-skip what you just saw. Deduped, capped. */
  async appendRecentlyShown(ids: string[]): Promise<string[]> {
    const prev = this.getRecentlyShown();
    const next = [...ids, ...prev.filter((id) => !ids.includes(id))].slice(0, 80);
    await this.ctx.globalState.update(KEYS.recentlyShown, next);
    return next;
  }

  getLastNotifyDate(): string | undefined {
    return this.ctx.globalState.get(KEYS.lastNotifyDate) as string | undefined;
  }

  async setLastNotifyDate(date: string): Promise<void> {
    await this.ctx.globalState.update(KEYS.lastNotifyDate, date);
  }

  getNotifyState(): NotifyState {
    const raw = this.ctx.globalState.get(KEYS.notifyState) as NotifyState | undefined;
    if (raw?.date && typeof raw.count === "number") return raw;
    const legacy = this.getLastNotifyDate();
    if (legacy) return { date: legacy, count: 1 };
    return { date: "", count: 0 };
  }

  async setNotifyState(state: NotifyState): Promise<void> {
    await this.ctx.globalState.update(KEYS.notifyState, state);
    await this.setLastNotifyDate(state.date);
  }

  async getSecret(key: string): Promise<string | undefined> {
    return this.ctx.secrets.get(key);
  }

  async setSecret(key: string, value: string): Promise<void> {
    await this.ctx.secrets.store(key, value);
  }
}
