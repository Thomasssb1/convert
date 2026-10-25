export type SubtitleFormat = "srt" | "vtt" | "ass";

/** Times are non-negative safe integer milliseconds. Separate cues may overlap. */
export interface SubtitleCue {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

/** Normalize file framing without trimming cue text or blank lines. */
export function normalizeSubtitleText(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

const timestampPatterns: Record<SubtitleFormat, RegExp> = {
  srt: /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/,
  vtt: /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/,
  ass: /^(\d+):([0-5]\d):([0-5]\d)\.(\d{2})$/,
};

function validateTimestampMs(milliseconds: number): void {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new RangeError("Subtitle timestamps must be non-negative safe integer milliseconds");
  }
}

/** Parse an entire timestamp; callers separate cue settings and surrounding whitespace. */
export function parseTimestamp(timestamp: string, format: SubtitleFormat): number {
  const match = timestampPatterns[format].exec(timestamp);
  // JavaScript's $ anchor can also match before a final newline.
  if (!match || match[0] !== timestamp) {
    throw new Error(`Invalid ${format.toUpperCase()} timestamp: ${timestamp}`);
  }

  const milliseconds =
    Number(match[1] ?? 0) * 3_600_000 +
    Number(match[2]) * 60_000 +
    Number(match[3]) * 1_000 +
    Number(match[4]) * (format === "ass" ? 10 : 1);
  validateTimestampMs(milliseconds);
  return milliseconds;
}

/** Write hours explicitly; round ASS to the nearest centisecond, with ties rounding up. */
export function formatTimestamp(milliseconds: number, format: SubtitleFormat): string {
  validateTimestampMs(milliseconds);
  const isAss = format === "ass";
  const unitsPerSecond = isAss ? 100 : 1_000;
  const units = isAss ? Math.round(milliseconds / 10) : milliseconds;
  const seconds = Math.floor(units / unitsPerSecond);
  const hoursText = Math.floor(seconds / 3_600)
    .toString()
    .padStart(isAss ? 1 : 2, "0");
  const minutesText = (Math.floor(seconds / 60) % 60).toString().padStart(2, "0");
  const secondsText = (seconds % 60).toString().padStart(2, "0");
  const fractionText = (units % unitsPerSecond).toString().padStart(isAss ? 2 : 3, "0");
  const separator = format === "srt" ? "," : ".";
  return `${hoursText}:${minutesText}:${secondsText}${separator}${fractionText}`;
}

/** Validate one cue's positive duration without imposing ordering on other cues. */
export function validateCueTiming(startMs: number, endMs: number): void {
  validateTimestampMs(startMs);
  validateTimestampMs(endMs);
  if (endMs <= startMs) {
    throw new RangeError("Subtitle cue end must be greater than its start");
  }
}
