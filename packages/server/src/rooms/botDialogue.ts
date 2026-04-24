/** Bot trash-talk. `$0` is replaced with the first positional argument
 *  (killer/victim name) when present. */
export const BOT_LINES = {
  on_fire: [
    "Eat this.",
    "Range me on three.",
    "Adjusting — dead wrong, dead man.",
    "Wind's with me.",
    "Sending mail.",
    "Round out.",
    "Hope you packed a helmet.",
    "This one's got your name on it.",
    "Steady… and release.",
    "Light 'em up.",
  ],
  on_kill: [
    "Scratch one, $0.",
    "Don't blink next time, $0.",
    "Was that it?",
    "Tag them and bag them.",
    "Nap time, $0.",
    "You fire that thing backwards?",
    "Rookie numbers.",
    "Go cry about it.",
    "Thanks for the kill streak.",
    "GG ez.",
  ],
  on_death: [
    "Lucky shot, $0.",
    "I'll be back. With interest.",
    "Nice one. For a cheater.",
    "Reviewing the tape.",
    "You'll pay for that.",
    "Cheese strats.",
    "Mark that down — won't happen twice.",
    "Tell my hull I loved her.",
  ],
  on_hit: [
    "Barely felt it.",
    "Is that the best you got?",
    "Closer. Try again.",
    "Keep firing, champ.",
    "Scratched the paint.",
    "My gunner's laughing.",
  ],
} as const;

export function pick(lines: readonly string[], args: string[] = []): string {
  const line = lines[Math.floor(Math.random() * lines.length)]!;
  return args.length > 0
    ? line.replace(/\$(\d)/g, (_, i) => args[Number(i)] ?? "")
    : line;
}
