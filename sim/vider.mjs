// Jour 0 de l'année simulée : le stock de démonstration retiré, chaque zone
// du plan recomptée à zéro. Depuis T141, une zone s'ouvre en la touchant sur
// le plan de la cuisine, puis « Tout recompter » (même chemin que
// `e2e/parcours.ts:ouvrirRangement`).
import { chromium } from "@playwright/test";
const ctx = await chromium.launchPersistentContext(process.env.PROFILE, {
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block",
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.clock.setFixedTime(new Date(`${process.env.DEBUT ?? "2026-10-16"}T08:00`));
await page.goto(`${process.env.URL || "http://localhost:4193"}/#/cuisine/stock`);
const plan = page.getByRole("group", { name: /Plan de la cuisine/ });
await plan.waitFor({ timeout: 30_000 }); await page.waitForTimeout(800);

// Les lots du frigo et du congélateur se constatent un par un : on ouvre la
// zone sur le plan, puis « Fini » sur chaque lot (T141).
for (const zone of [/^Frigo/, /^Congélo/]) {
  const ouvert = (await page.locator(".st-panneau .nom").first().innerText().catch(() => "")).trim();
  if (!zone.test(ouvert)) { await plan.getByRole("button").filter({ hasText: zone }).first().dispatchEvent("click"); await page.waitForTimeout(500); }
  for (let k = 0; k < 40; k++) {
    const b = page.locator(".st-panneau").getByRole("button", { name: /^Fini$|Je n.en ai plus/ });
    if (!(await b.count())) break;
    await b.first().dispatchEvent("click"); await page.waitForTimeout(400);
  }
  console.log("lots retirés :", zone.source);
}

const zones = await plan.getByRole("button").allInnerTexts();
for (let z = 0; z < zones.length; z++) {
  await plan.getByRole("button").nth(z).dispatchEvent("click"); await page.waitForTimeout(500);
  const panneau = page.locator(".st-panneau");
  const recompter = panneau.getByRole("button", { name: "Tout recompter" });
  if (!(await recompter.count())) { console.log("zone", z, zones[z].split("\n")[0], "— rien à recompter"); continue; }
  await recompter.dispatchEvent("click"); await page.waitForTimeout(400);
  const moins = panneau.getByRole("button", { name: "−" }); const n = await moins.count();
  for (let i = 0; i < n; i++) for (let k = 0; k < 30; k++) { if (await moins.nth(i).isDisabled()) break; await moins.nth(i).dispatchEvent("click"); }
  await panneau.getByRole("button", { name: /^Valider/ }).dispatchEvent("click"); await page.waitForTimeout(600);
  console.log("zone", z, zones[z].split("\n")[0], "lignes", n);
}
await page.reload(); await plan.waitFor(); await page.waitForTimeout(1500);
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1500));
await ctx.close();
