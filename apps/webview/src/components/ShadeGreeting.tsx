import { ShadeMascot, type ShadeMood } from "./ShadeMascot";

interface Props {
  line: string;
  mood?: ShadeMood;
  name?: string;
  hidden?: boolean;
  compact?: boolean;
  /** Today screen uses the fixed terminal greeting. */
  terminal?: boolean;
}

function terminalLines(line: string, terminal?: boolean): string[] {
  if (terminal) return ["Hey!", "Ready to dive into", "something new?"];
  const clean = line.replace(/\s+/g, " ").trim();
  if (!clean) return ["Hey!", "Ready when you are."];
  const words = clean.split(" ");
  const rows: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 28 && current) {
      rows.push(current);
      current = word;
    } else {
      current = next;
    }
    if (rows.length === 2) break;
  }
  if (rows.length < 3 && current && !rows.includes(current)) rows.push(current);
  while (rows.length < 2) rows.push("");
  return rows.slice(0, 3);
}

export function ShadeGreeting({ line, mood = "idle", name = "Shade", hidden, compact, terminal }: Props) {
  const rows = terminalLines(line, terminal && mood === "idle");
  return (
    <section className={`shade-greeting ${compact ? "compact" : ""}`} aria-label={`${name} greeting`}>
      <ShadeMascot mood={mood} size={compact ? 64 : 88} name={name} hidden={hidden} />
      <div className="shade-terminal" role="status">
        <div className="shade-terminal-bar">
          <span className="meta">{name}</span>
        </div>
        <ol className="shade-terminal-lines">
          {rows.map((row, i) => (
            <li key={i}>
              <span className="term-no">{String(i + 1).padStart(2, "0")}</span>
              <span>{row}</span>
            </li>
          ))}
          <li>
            <span className="term-no">04</span>
            <span className="term-cursor" aria-hidden>
              _
            </span>
          </li>
        </ol>
      </div>
    </section>
  );
}
