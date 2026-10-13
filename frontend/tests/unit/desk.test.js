import { describe, expect, it } from "vitest";

import { sheetsFromReports } from "@/lib/desk";

describe("sheetsFromReports", () => {
  it("prints each report's score, its first two topics and the date", () => {
    const [sheet] = sheetsFromReports([
      { report_id: "r1", overall: 7.4, topics: ["dsa", "system_design", "os"], generated_at: "2026-09-30T10:00:00Z" },
    ]);
    expect(sheet).toEqual({ id: "r1", score: 7.4, label: "DSA · System design", date: "30 Sept 2026" });
  });

  it("labels a report without topics as an interview, and handles no reports", () => {
    expect(sheetsFromReports([{ report_id: "r2", overall: 5, generated_at: "2026-09-30T10:00:00Z" }])[0].label).toBe("Interview");
    expect(sheetsFromReports()).toEqual([]);
  });
});
