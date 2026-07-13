import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const TARGETS = [
  { name: "home", path: "/" },
  { name: "workout log", path: "/workout/log" },
  { name: "calendar", path: "/calendar" },
  { name: "program store", path: "/program-store" },
  { name: "settings", path: "/settings" },
  { name: "login", path: "/login" },
] as const;

for (const target of TARGETS) {
  test(`${target.name} has no serious runtime accessibility violations`, async ({
    page,
  }) => {
    const response = await page.goto(target.path, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations
      .filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      )
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.map((node) => node.target),
      }));

    expect(blocking).toEqual([]);
  });
}
