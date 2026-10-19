export type ModelRunTag = "Easy" | "Minutes" | "Hard";

export interface HuggingFaceModel {
  id: string;
  title: string;
  description: string;
  url: string;
  meta: string;
  tag: ModelRunTag;
  bytes?: number;
}

interface HfApiModel {
  id?: string;
  pipeline_tag?: string;
  likes?: number;
  downloads?: number;
  library_name?: string;
}

const HEADERS = { Accept: "application/json", "User-Agent": "devly" };

/** Easy is the lightest. Minutes can finish on a laptop. Hard is difficult to run locally. */
export function modelRunTag(input: { id: string; pipeline?: string; bytes?: number }): ModelRunTag {
  const id = input.id.toLowerCase();
  const pipeline = (input.pipeline ?? "").toLowerCase();
  if (input.bytes !== undefined) {
    if (input.bytes <= 400_000_000) return "Easy";
    if (input.bytes <= 3_000_000_000) return "Minutes";
    return "Hard";
  }
  const hugeName = /\b([7-9]|[1-9]\d)b\b/.test(id) || /flux|ltx|hunyuan|wan2|sd3|stable-diffusion-3/.test(id);
  if (pipeline.includes("video") || hugeName) return "Hard";
  if (
    pipeline === "text-classification" ||
    pipeline === "token-classification" ||
    pipeline === "fill-mask" ||
    pipeline === "zero-shot-classification"
  ) {
    return "Easy";
  }
  if (pipeline.includes("text-to-image") || pipeline.includes("image-to-image")) return "Hard";
  if (/\b[1-4]b\b/.test(id)) return "Minutes";
  if (pipeline === "feature-extraction" || pipeline === "sentence-similarity") return "Easy";
  return "Minutes";
}

/** Two lightest, two that fit in a few minutes, two large, then shuffled. */
export function pickModelMix<T extends { id: string; tag: ModelRunTag; bytes?: number }>(models: T[], seed: string): T[] {
  const seen = new Set<string>();
  const unique = models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
  const used = new Set<string>();
  const take = (tag: ModelRunTag, count: number, lightestFirst: boolean): T[] => {
    const pool = unique
      .filter((model) => model.tag === tag && !used.has(model.id))
      .sort((a, b) => {
        const av = a.bytes ?? (lightestFirst ? Number.MAX_SAFE_INTEGER : 0);
        const bv = b.bytes ?? (lightestFirst ? Number.MAX_SAFE_INTEGER : 0);
        return lightestFirst ? av - bv : bv - av;
      });
    const picked = pool.slice(0, count);
    for (const model of picked) used.add(model.id);
    return picked;
  };
  const chosen = [...take("Easy", 2, true), ...take("Minutes", 2, true), ...take("Hard", 2, false)];
  return shuffle(chosen, seed);
}

function shuffle<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let state = hashSeed(seed);
  for (let i = out.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function listModels(params: Record<string, string>): Promise<HfApiModel[]> {
  const url = new URL("https://huggingface.co/api/models");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as HfApiModel[];
    return Array.isArray(data) ? data.filter((model) => Boolean(model.id)) : [];
  } catch {
    return [];
  }
}

async function modelBytes(id: string): Promise<number | undefined> {
  try {
    const res = await fetch(`https://huggingface.co/api/models/${encodeURIComponent(id)}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { usedStorage?: number; safetensors?: { total?: number } };
    if (typeof data.usedStorage === "number" && data.usedStorage > 0) return data.usedStorage;
    if (typeof data.safetensors?.total === "number" && data.safetensors.total > 0) return data.safetensors.total * 2;
    return undefined;
  } catch {
    return undefined;
  }
}

/** What a model is, and what the local Run button will do. */
export function describeModel(pipeline?: string, library?: string): { about: string; afterRun: string } {
  const task = (pipeline ?? "").toLowerCase();
  const lib = (library ?? "").toLowerCase();
  if (task.includes("text-to-video") || task.includes("image-to-video")) {
    return {
      about: "This model tries to make a short video from a text prompt. It is heavy on a laptop.",
      afterRun: "Run starts that generation on your machine.",
    };
  }
  if (task.includes("text-to-image") || task.includes("image-to-image") || lib.includes("diffusers")) {
    return {
      about: "This model draws a picture from the words you type.",
      afterRun: "Run creates the picture and shows it on the page.",
    };
  }
  if (task.includes("feature-extraction") || task.includes("sentence-similarity") || lib.includes("sentence-transformers")) {
    return {
      about: "This model turns text into numbers so similar sentences land near each other. It does not write a reply.",
      afterRun: "Run shows a short preview of those numbers.",
    };
  }
  if (task.includes("summar")) {
    return {
      about: "This model shortens a long passage into a few sentences.",
      afterRun: "Run shows that shorter version.",
    };
  }
  if (task.includes("translation")) {
    return {
      about: "This model translates the text you give it.",
      afterRun: "Run shows the translation.",
    };
  }
  if (task.includes("text-classification") || task.includes("zero-shot") || task.includes("sentiment")) {
    return {
      about: "This model labels a piece of text, for example positive or negative.",
      afterRun: "Run shows the label it chose.",
    };
  }
  if (task.includes("fill-mask")) {
    return {
      about: "This model fills in a missing word. Write [MASK] where the word should go.",
      afterRun: "Run shows the words it would use.",
    };
  }
  if (task.includes("token-classification")) {
    return {
      about: "This model marks parts of a sentence, such as names and places.",
      afterRun: "Run shows those marks.",
    };
  }
  if (task.includes("question-answering")) {
    return {
      about: "This model looks for an answer inside a passage you provide. It does not search the web.",
      afterRun: "Run shows the span of text it picked.",
    };
  }
  if (task.includes("text-generation") || task.includes("text2text")) {
    return {
      about: "This model continues the words you type. It is not a chatbot, and it does not answer questions.",
      afterRun: "Run writes the next chunk of text under the box.",
    };
  }
  if (task.includes("speech") || task.includes("audio")) {
    return {
      about: "This model works with sound. The local page can only send text, so the demo is limited.",
      afterRun: "Run sends your text and shows whatever comes back.",
    };
  }
  return {
    about: "This is a Hugging Face model you can run on your machine.",
    afterRun: "Run sends your text to it and shows the result on the page.",
  };
}

function toCard(model: HfApiModel & { id: string }, bytes?: number): HuggingFaceModel {
  const tag = modelRunTag({ id: model.id, pipeline: model.pipeline_tag, bytes });
  const explained = describeModel(model.pipeline_tag, model.library_name);
  return {
    id: `hf-${model.id.replace(/[^a-zA-Z0-9._-]/g, "-")}`,
    title: model.id,
    description: `${explained.about} ${explained.afterRun}`,
    url: `https://huggingface.co/${model.id}`,
    meta: `${model.likes ?? 0} likes · ${model.downloads ?? 0} downloads`,
    tag,
    bytes,
  };
}

async function withSizes(models: HfApiModel[], limit: number): Promise<HuggingFaceModel[]> {
  const seen = new Set<string>();
  const unique: Array<HfApiModel & { id: string }> = [];
  for (const model of models) {
    if (!model.id || seen.has(model.id) || unique.length >= limit) continue;
    seen.add(model.id);
    unique.push(model as HfApiModel & { id: string });
  }
  const cards: HuggingFaceModel[] = [];
  for (let i = 0; i < unique.length; i += 6) {
    const batch = unique.slice(i, i + 6);
    const sized = await Promise.all(
      batch.map(async (model) => toCard(model, await modelBytes(model.id).catch(() => undefined))),
    );
    cards.push(...sized);
  }
  return cards;
}

function spread(groups: HfApiModel[][], limit: number): HfApiModel[] {
  const out: HfApiModel[] = [];
  const seen = new Set<string>();
  let progressed = true;
  while (progressed && out.length < limit) {
    progressed = false;
    for (const group of groups) {
      const next = group.find((model) => model.id && !seen.has(model.id));
      if (!next?.id) continue;
      seen.add(next.id);
      out.push(next);
      progressed = true;
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Search returns tagged matches. A refresh with no query returns a shuffled mix:
 * the two lightest, two that can run in minutes, and two large models.
 */
export async function fetchHuggingFaceModels(query?: string, seed = ""): Promise<HuggingFaceModel[]> {
  const q = query?.trim() ?? "";
  if (q) {
    const found = await listModels({ search: q, limit: "12" });
    const cards = found
      .filter((model): model is HfApiModel & { id: string } => Boolean(model.id))
      .map((model) => toCard(model));
    return shuffle(cards, seed || q);
  }

  const [trending, extract, classify, mask, similar, generate, image, video] = await Promise.all([
    listModels({ sort: "trendingScore", direction: "-1", limit: "12" }),
    listModels({ pipeline_tag: "feature-extraction", sort: "downloads", direction: "-1", limit: "8" }),
    listModels({ pipeline_tag: "text-classification", sort: "downloads", direction: "-1", limit: "6" }),
    listModels({ pipeline_tag: "fill-mask", sort: "downloads", direction: "-1", limit: "4" }),
    listModels({ pipeline_tag: "sentence-similarity", sort: "downloads", direction: "-1", limit: "4" }),
    listModels({ pipeline_tag: "text-generation", sort: "downloads", direction: "-1", limit: "8" }),
    listModels({ pipeline_tag: "text-to-image", sort: "downloads", direction: "-1", limit: "4" }),
    listModels({ pipeline_tag: "text-to-video", sort: "downloads", direction: "-1", limit: "3" }),
  ]);
  const pool = await withSizes(spread([extract, classify, mask, similar, generate, trending, image, video], 24), 24);
  return pickModelMix(pool, seed || "devly");
}
