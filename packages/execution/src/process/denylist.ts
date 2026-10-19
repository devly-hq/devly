import path from "node:path";

export interface ApprovalCommand {
  executable: string;
  args: string[];
  cwd: string;
}

const DENIED_EXECUTABLES = new Set([
  "sudo",
  "su",
  "doas",
  "pkexec",
  "shutdown",
  "reboot",
  "mkfs",
  "dd",
  "diskutil",
]);

export function isDeniedCommand(cmd: ApprovalCommand, labRoot: string): string | null {
  const exe = path.basename(cmd.executable).toLowerCase();
  if (DENIED_EXECUTABLES.has(exe)) {
    return `Executable not allowed: ${exe}`;
  }

  const joined = [cmd.executable, ...cmd.args].join(" ");
  if (/curl\s+.*\|\s*(ba)?sh/i.test(joined) || /wget\s+.*\|\s*(ba)?sh/i.test(joined)) {
    return "Piping remote scripts into a shell is not allowed";
  }
  if (/\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/\b/.test(joined) || /rm\s+-rf\s+\//.test(joined)) {
    return "Destructive rm targeting / is not allowed";
  }

  // Ensure cwd is inside lab
  const resolvedCwd = path.resolve(cmd.cwd);
  const resolvedLab = path.resolve(labRoot);
  if (resolvedCwd !== resolvedLab && !resolvedCwd.startsWith(resolvedLab + path.sep)) {
    return `Working directory outside lab: ${resolvedCwd}`;
  }

  // Block args that clearly escape the lab for write/rm operations
  for (const arg of cmd.args) {
    if (arg.startsWith("-")) continue;
    if (arg.includes("://")) continue;
    if (path.isAbsolute(arg)) {
      const resolved = path.resolve(arg);
      if (resolved !== resolvedLab && !resolved.startsWith(resolvedLab + path.sep)) {
        // Allow common tool paths like /usr/bin via executable only; absolute data paths outside lab blocked for rm/mv/cp
        if (["rm", "mv", "cp", "chmod", "chown"].includes(exe)) {
          return `Argument path outside lab: ${arg}`;
        }
      }
    }
  }

  return null;
}
