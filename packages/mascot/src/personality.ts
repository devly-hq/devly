export type Personality = "calm" | "friendly" | "witty" | "sarcastic" | "enthusiastic" | "minimal";

const LINES: Record<Personality, Record<string, string[]>> = {
  calm: {
    greet: ["Ready when you are.", "Let's learn something quietly useful."],
    building: ["Building carefully.", "One step at a time."],
    success: ["It works. Nice.", "Verified and ready."],
    error: ["Something failed. We'll sort it out.", "A snag — let's inspect the logs."],
  },
  friendly: {
    greet: ["Hey! Ready to learn something new?", "Shade here — what shall we build?"],
    building: ["Cooking up your lab...", "I'm on it!"],
    success: ["Your project is ready!", "We did it — go try it!"],
    error: ["Oops, that didn't work. Want me to try a fix?", "Hmm, tests failed. Repair time?"],
  },
  witty: {
    greet: ["Curiosity detected.", "Shall we turn news into working code?"],
    building: ["Spinning electrons into lessons.", "Compiling vibes into files."],
    success: ["Green checks. My favorite color.", "It runs. Your move, human."],
    error: ["The tests have spoken. Harshly.", "Plot twist: it broke."],
  },
  sarcastic: {
    greet: ["Oh look, another concept to conquer.", "Sure, let's learn something. Again."],
    building: ["Yes, I'm doing the boring setup for you.", "Generating code so you don't have to."],
    success: ["Miraculously, it works.", "Don't act surprised."],
    error: ["Shocked. Truly.", "It failed. Who could have guessed."],
  },
  enthusiastic: {
    greet: ["LET'S BUILD SOMETHING AWESOME!", "Today's going to be a great lab day!"],
    building: ["Building!! This is exciting!", "Files appearing! Services starting!"],
    success: ["YES!! It's alive!!", "Verified working — celebrate!"],
    error: ["Okay okay — we can fix this!", "Setback! But repair loop engage!"],
  },
  minimal: {
    greet: ["Ready."],
    building: ["Working."],
    success: ["Done."],
    error: ["Failed."],
  },
};

export function pickLine(personality: Personality, bucket: string, seed = Date.now()): string {
  const list = LINES[personality][bucket] ?? LINES.friendly.greet;
  return list[seed % list.length]!;
}
