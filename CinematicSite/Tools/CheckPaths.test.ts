import { test, expect } from "bun:test";
import { dirname } from "node:path";
import { safeShotPath } from "./CheckPaths";

test("подписи из DOM не выводят снимок из каталога отчёта", () => {
  for(const label of ["../../../audit-target", "a/../../other", "..\\..\\other", "\0/x", "кадр 1", "", "x".repeat(10000)]) {
    const file=safeShotPath("/tmp/site-check","mobile",0,label);
    expect(dirname(file)).toBe("/tmp/site-check");
    expect(file.length).toBeLessThan(130);
  }
});
