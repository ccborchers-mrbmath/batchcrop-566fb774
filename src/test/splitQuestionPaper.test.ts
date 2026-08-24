import { describe, it, expect } from "vitest";
import {
  isDotLine,
  mergeBands,
  filterQuestionStarts,
  questionPaperFileName,
  QP_CONTENT,
  QP_MAX_GAP_PT,
  SCALE,
} from "@/lib/splitQuestionPaper";

describe("isDotLine", () => {
  it("classifies dotted answer lines as non-content", () => {
    expect(isDotLine(".".repeat(60))).toBe(true);
    expect(isDotLine(". . . . . . . . . . . . . . . .")).toBe(true);
    expect(isDotLine("...........................[3]")).toBe(true);
  });

  it("treats empty and whitespace-only text as non-content", () => {
    expect(isDotLine("")).toBe(true);
    expect(isDotLine("   \n ")).toBe(true);
  });

  it("keeps real question text, including text with decimals", () => {
    expect(isDotLine("A cyclist is travelling along a straight horizontal road")).toBe(false);
    expect(isDotLine("She accelerates at 2 m s^-2 for 4.5 s.")).toBe(false);
    // The reference notes 0.45 is deliberately loose; short numeric answers must survive.
    expect(isDotLine("0.0225 to 0.227 (3 sf)")).toBe(false);
  });
});

describe("mergeBands", () => {
  it("rejoins the line-by-line bands of one paragraph", () => {
    expect(mergeBands([[10, 20], [24, 34]], 6)).toEqual([[10, 34]]);
  });

  it("keeps bands separated by more than the merge distance", () => {
    expect(mergeBands([[10, 20], [40, 50]], 6)).toEqual([[10, 20], [40, 50]]);
  });

  it("sorts unordered input before merging", () => {
    expect(mergeBands([[40, 50], [10, 20]], 6)).toEqual([[10, 20], [40, 50]]);
  });

  it("absorbs a band fully contained in another", () => {
    expect(mergeBands([[10, 50], [20, 30]], 6)).toEqual([[10, 50]]);
  });

  it("returns nothing for no input", () => {
    expect(mergeBands([], 6)).toEqual([]);
  });
});

describe("filterQuestionStarts", () => {
  it("keeps a clean ascending run", () => {
    const got = filterQuestionStarts([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(got.map((g) => g.n)).toEqual([1, 2, 3]);
  });

  it("drops repeats of a number already seen", () => {
    const got = filterQuestionStarts([{ n: 1 }, { n: 1 }, { n: 2 }]);
    expect(got.map((g) => g.n)).toEqual([1, 2]);
  });

  it("ignores stray digits that break the sequence", () => {
    // [4] mark allocations, years and coordinate labels all produce digits.
    const got = filterQuestionStarts([{ n: 1 }, { n: 7 }, { n: 2 }, { n: 25 }, { n: 3 }]);
    expect(got.map((g) => g.n)).toEqual([1, 2, 3]);
  });

  it("requires the sequence to start at 1", () => {
    const got = filterQuestionStarts([{ n: 4 }, { n: 5 }, { n: 1 }, { n: 2 }]);
    expect(got.map((g) => g.n)).toEqual([1, 2]);
  });

  it("returns nothing when no question 1 is present", () => {
    expect(filterQuestionStarts([{ n: 6 }, { n: 9 }])).toEqual([]);
  });
});

describe("questionPaperFileName", () => {
  it("zero-pads to the bank's convention", () => {
    expect(questionPaperFileName("9709_m25_qp62", 1)).toBe("9709_m25_qp62_q01.png");
    expect(questionPaperFileName("9709_m25_qp62", 12)).toBe("9709_m25_qp62_q12.png");
  });

  it("strips characters that are illegal in file names", () => {
    expect(questionPaperFileName('a/b:c*d', 3)).toBe("a_b_c_d_q03.png");
  });

  it("falls back when the base name is empty", () => {
    expect(questionPaperFileName("   ", 1)).toBe("question_paper_q01.png");
  });
});

describe("geometry constants", () => {
  it("renders A4 portrait at the width of the existing image bank", () => {
    // 595.28pt x 4 = 2381px, which is what the hand-made images are.
    expect(Math.round(595.28 * SCALE)).toBe(2381);
  });

  it("excludes the page furniture the reference implementation calls out", () => {
    const [x0, y0, x1] = QP_CONTENT;
    expect(y0).toBeGreaterThan(59.1);  // barcode block ends at 59.1
    expect(y0).toBeLessThan(63.4);     // first question starts at 63.4
    expect(x1).toBeLessThan(558.4);    // corner crop marks sit at 558.4
    expect(x0).toBeLessThan(49.6);     // question text starts at 49.6
  });

  it("clamps answer-line runs but leaves real spacing alone", () => {
    // ~19pt between a stem and part (a) passes through; ~46pt of answer lines does not.
    expect(Math.min(19, QP_MAX_GAP_PT)).toBe(19);
    expect(Math.min(120, QP_MAX_GAP_PT)).toBe(QP_MAX_GAP_PT);
  });
});
