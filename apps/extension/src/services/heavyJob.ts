/** One heavy local job at a time, so a model download and a repo build do not run together. */
let held = false;

export function holdHeavyJob(): boolean {
  if (held) return false;
  held = true;
  return true;
}

export function releaseHeavyJob(): void {
  held = false;
}
