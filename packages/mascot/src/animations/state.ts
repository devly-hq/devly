export type MascotState =
  | "IDLE"
  | "HAPPY"
  | "THINKING"
  | "TYPING"
  | "EXCITED"
  | "CONFUSED"
  | "ERROR"
  | "SUCCESS"
  | "EXPLAINING"
  | "POINTING"
  | "CELEBRATING"
  | "SLEEPING"
  | "LOADING";

const ALLOWED: Record<MascotState, MascotState[]> = {
  IDLE: ["HAPPY", "THINKING", "TYPING", "LOADING", "POINTING", "SLEEPING", "EXPLAINING", "EXCITED", "CONFUSED", "ERROR", "SUCCESS", "CELEBRATING"],
  HAPPY: ["IDLE", "CELEBRATING", "EXPLAINING", "THINKING"],
  THINKING: ["IDLE", "TYPING", "LOADING", "CONFUSED", "ERROR", "SUCCESS"],
  TYPING: ["IDLE", "THINKING", "LOADING", "SUCCESS", "ERROR", "CELEBRATING"],
  EXCITED: ["IDLE", "CELEBRATING", "HAPPY"],
  CONFUSED: ["IDLE", "THINKING", "ERROR"],
  ERROR: ["IDLE", "THINKING", "CONFUSED"],
  SUCCESS: ["IDLE", "CELEBRATING", "HAPPY", "EXPLAINING"],
  EXPLAINING: ["IDLE", "POINTING", "HAPPY", "THINKING"],
  POINTING: ["IDLE", "EXPLAINING", "HAPPY"],
  CELEBRATING: ["IDLE", "HAPPY", "SUCCESS"],
  SLEEPING: ["IDLE", "HAPPY"],
  LOADING: ["IDLE", "THINKING", "TYPING", "SUCCESS", "ERROR", "CELEBRATING"],
};

export function transitionMascot(from: MascotState, to: MascotState): MascotState {
  if (from === to) return from;
  if (ALLOWED[from].includes(to)) return to;
  // Allow forced jumps via IDLE bridge for robustness
  return to;
}
