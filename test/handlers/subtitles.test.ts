import { expect, test } from "bun:test";
import {
  formatTimestamp,
  normalizeSubtitleText,
  parseTimestamp,
  validateCueTiming,
} from "../../src/handlers/subtitles.ts";

test("subtitle normalization removes a leading BOM and converts CRLF and CR to LF", () => {
  expect(normalizeSubtitleText("\uFEFFfirst\r\nsecond\rthird\n\n")).toBe(
    "first\nsecond\nthird\n\n",
  );
});

test("subtitle normalization preserves cue whitespace, Unicode and embedded BOMs", () => {
  const text = "  café 日本語\uFEFF\t\n\n  ";
  expect(normalizeSubtitleText(text)).toBe(text);
  expect(normalizeSubtitleText("")).toBe("");
});

test.each([
  ["srt", "00:00:00,000", 0],
  ["srt", "01:02:03,004", 3_723_004],
  ["srt", "100:00:00,001", 360_000_001],
  ["vtt", "00:00.000", 0],
  ["vtt", "02:03.004", 123_004],
  ["vtt", "01:02:03.004", 3_723_004],
  ["vtt", "100:00:00.001", 360_000_001],
  ["ass", "0:00:00.00", 0],
  ["ass", "1:02:03.04", 3_723_040],
  ["ass", "10:00:00.01", 36_000_010],
] as const)("parses %s timestamp %s as %i milliseconds", (format, timestamp, expected) => {
  expect(parseTimestamp(timestamp, format)).toBe(expected);
});

test.each([
  ["srt", "00:60:00,000"],
  ["srt", "00:00:60,000"],
  ["srt", "00:00:01.000"],
  ["srt", "00:00:01,00"],
  ["srt", "0:00:01,000"],
  ["srt", "00:01,000"],
  ["srt", "-01:00:00,000"],
  ["vtt", "60:00.000"],
  ["vtt", "00:60.000"],
  ["vtt", "00:01,000"],
  ["vtt", "00:01.00"],
  ["vtt", "1:00:01.000"],
  ["vtt", "00:01.000 align:start"],
  ["vtt", "00:01.000\n"],
  ["vtt", "00:01.000\r\n"],
  ["vtt", " 00:01.000"],
  ["vtt", "00:01.000 "],
  ["vtt", ""],
  ["ass", "0:60:00.00"],
  ["ass", "0:00:60.00"],
  ["ass", "0:00:01,00"],
  ["ass", "0:00:01.000"],
  ["ass", "0:0:01.00"],
] as const)("rejects malformed %s timestamp %j", (format, timestamp) => {
  expect(() => parseTimestamp(timestamp, format)).toThrow(
    `Invalid ${format.toUpperCase()} timestamp`,
  );
});

test("timestamp parsing accepts the largest safe millisecond value and rejects overflow", () => {
  expect(parseTimestamp("2501999792:59:00,991", "srt")).toBe(Number.MAX_SAFE_INTEGER);
  expect(() => parseTimestamp("2501999792:59:00,992", "srt")).toThrow(RangeError);
  expect(() => parseTimestamp(`${"9".repeat(400)}:00:00.000`, "vtt")).toThrow(RangeError);
});

test.each([
  ["srt", 0, "00:00:00,000"],
  ["srt", 3_723_004, "01:02:03,004"],
  ["srt", 360_000_001, "100:00:00,001"],
  ["vtt", 0, "00:00:00.000"],
  ["vtt", 123_004, "00:02:03.004"],
  ["vtt", 3_723_004, "01:02:03.004"],
  ["vtt", 360_000_001, "100:00:00.001"],
  ["ass", 0, "0:00:00.00"],
  ["ass", 3_723_040, "1:02:03.04"],
  ["ass", 36_000_010, "10:00:00.01"],
] as const)("formats %s time %i as %s", (format, milliseconds, expected) => {
  expect(formatTimestamp(milliseconds, format)).toBe(expected);
});

test("timestamp formatting preserves milliseconds near the safe integer limit", () => {
  expect(formatTimestamp(Number.MAX_SAFE_INTEGER, "srt")).toBe("2501999792:59:00,991");
  expect(formatTimestamp(9_007_199_254_739_999, "srt")).toBe("2501999792:58:59,999");
  expect(formatTimestamp(9_007_199_254_739_999, "vtt")).toBe("2501999792:58:59.999");
  expect(formatTimestamp(Number.MAX_SAFE_INTEGER, "ass")).toBe("2501999792:59:00.99");
});

test.each([
  [4, "0:00:00.00"],
  [5, "0:00:00.01"],
  [994, "0:00:00.99"],
  [995, "0:00:01.00"],
  [59_995, "0:01:00.00"],
  [3_599_995, "1:00:00.00"],
] as const)("rounds ASS time %i to %s", (milliseconds, expected) => {
  expect(formatTimestamp(milliseconds, "ass")).toBe(expected);
});

test.each([[-1], [0.5], [NaN], [Infinity], [Number.MAX_SAFE_INTEGER + 1]])(
  "rejects invalid millisecond value %s when formatting or validating either cue endpoint",
  (milliseconds) => {
    expect(() => formatTimestamp(milliseconds, "srt")).toThrow(RangeError);
    expect(() => validateCueTiming(milliseconds, 1_000)).toThrow(RangeError);
    expect(() => validateCueTiming(0, milliseconds)).toThrow(RangeError);
  },
);

test("cue timing accepts positive durations, including overlapping cues", () => {
  expect(() => validateCueTiming(0, 2_000)).not.toThrow();
  expect(() => validateCueTiming(1_000, 3_000)).not.toThrow();
  expect(() => validateCueTiming(0, 1)).not.toThrow();
});

test("cue timing rejects zero and negative durations", () => {
  expect(() => validateCueTiming(1_000, 1_000)).toThrow("end must be greater than its start");
  expect(() => validateCueTiming(2_000, 1_000)).toThrow("end must be greater than its start");
});
