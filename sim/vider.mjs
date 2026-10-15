import { chromium } from "@playwright/test";
const ctx = await chromium.launchPersistentContext(process.env.PROFILE, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
const page = ctx.pages()[0];
await page.clock.setFixedTime(new Date("2026-10-16T08:00"));
await page.goto("http://localhost:4193/#/cuisine/stock");
await page.getByRole("button",{name:"Relever"}).first().waitFor(); await page.waitForTimeout(800);
for (let k=0;k<5;k++){ const b=page.getByRole("button",{name:"Je n’en ai plus"}); if(!(await b.count())) break; await b.first().dispatchEvent("click"); await page.waitForTimeout(600);}
const nz = await page.getByRole("button",{name:"Relever"}).count();
for (let z=0; z<nz; z++){
  await page.getByRole("button",{name:"Relever"}).nth(z).dispatchEvent("click"); await page.waitForTimeout(500);
  const moins = page.getByRole("button",{name:"−"}); const n=await moins.count();
  for (let i=0;i<n;i++){ for(let k=0;k<30;k++){ if(await moins.nth(i).isDisabled()) break; await moins.nth(i).dispatchEvent("click"); } }
  await page.getByRole("button",{name:/Valider le relevé/}).dispatchEvent("click"); await page.waitForTimeout(700);
  console.log("zone",z,"lignes",n);
}
await page.reload(); await page.locator(".co-barre").waitFor(); await page.waitForTimeout(1500);
console.log((await page.evaluate(()=>document.body.innerText)).slice(0,4000));
await ctx.close();
