import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5199";
const b = await chromium.launch();
const errs = [];

async function shot(name, variant, steps = async () => {}) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(`${name}: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && errs.push(`${name} console: ${m.text()}`));
  await p.goto(`${base}/?variant=${variant}#/cuisine/proto-rail`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await steps(p);
  await p.screenshot({ path: `/tmp/rail-${name}.png`, fullPage: true });
  await ctx.close();
}

await shot("A1-horizon", "A");
await shot("A2-pas", "A", async (p) => {
  await p.getByRole("button", { name: "3", exact: true }).click();
  await p.waitForTimeout(600);
});
await shot("B1-pioche", "B");
await shot("B2-recu", "B", async (p) => {
  // pose la première carte, puis passe : le reçu doit s'empiler
  await p.locator(".co-jouable").first().click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Passer" }).click();
  await p.waitForTimeout(500);
});
await shot("C1-selection", "C");
await shot("C2-plateau", "C", async (p) => {
  const cases = p.locator("button:has-text('dîner')");
  for (const i of [0, 1, 2]) await cases.nth(i).click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: /Planifier ces/ }).click();
  await p.waitForTimeout(900);
});

await b.close();
console.log(errs.length ? "ERREURS:\n" + errs.join("\n") : "aucune erreur console");
