// Une année de cuisine menée par l'app, au doigt, dans un vrai navigateur.
//
// usage : PROFILE=<dossier> OUT=<dossier> node sim/annee.mjs [jours]
//
// Le monde réel (ce qu'il y a VRAIMENT dans le frigo) est tenu ici, à côté de
// l'app, pour pouvoir comparer ce qu'elle croit à ce qui est. Tout ce qui
// touche l'app passe par un geste d'écran — aucune écriture en base.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";

let graine = 20261016;
const hasard = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
const URL = process.env.URL || "http://localhost:4193";
const OUT = process.env.OUT;
const PROFILE = process.env.PROFILE;
mkdirSync(`${OUT}/captures`, { recursive: true });
const ETAT = `${OUT}/etat.json`;
const JOURNAL = `${OUT}/jours.jsonl`;
const NOTES = `${OUT}/notes.jsonl`;

const cat = JSON.parse(readFileSync("public/cuisine-data.json", "utf8"));
const platParTitre = new Map(cat.plats.map((p) => [p.titre.trim(), p]));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-_'’]/g, " ").replace(/\s+/g, " ").trim();
const idParNom = new Map();
for (const p of cat.plats) for (const i of p.ingredients) { idParNom.set(norm(i.id), i.id); idParNom.set(norm(i.nom), i.id); if (i.ref) idParNom.set(norm(i.ref), i.id); }
const toujours = new Set(cat.rayons.placard);
const rayonDe = new Map();
for (const [r, ids] of Object.entries(cat.rayons.rayons ?? {})) for (const id of ids) rayonDe.set(id, r);
const FRAIS = /frais|fruit|legume|boucher|poisson|cremerie|crèmerie|laitier|fromage/i;

// ───────────────────────────────────────────────────────────── le calendrier
const DEBUT = new Date("2026-10-16T00:00:00");
const N = +(process.argv[2] ?? 365);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const entre = (j, a, b) => j >= a && j <= b;

// Les événements. `prevu` = connu d'avance (on peut planifier autour) ; sinon il tombe.
function evenements(j) {
  const e = [];
  const absent = [
    ["2026-12-20", "2026-12-27", "Noël dans la famille"],
    ["2027-02-20", "2027-02-27", "vacances au ski"],
    ["2027-05-06", "2027-05-09", "pont de l'Ascension"],
    ["2027-08-01", "2027-08-21", "vacances d'été"],
  ];
  for (const [a, b, q] of absent) if (entre(j, a, b)) e.push({ type: "absent", prevu: true, quoi: q });
  const invites = {
    "2026-11-01": [8, "Toussaint : déjeuner de famille, 8 couverts", "dejeuner"],
    "2026-12-31": [6, "Réveillon avec 4 amis", "diner"],
    "2027-03-28": [6, "Pâques : 6 couverts", "dejeuner"],
    "2027-06-19": [10, "anniversaire du petit, 10 personnes", "dejeuner"],
    "2027-09-25": [6, "dîner avec les voisins", "diner"],
  };
  if (invites[j]) e.push({ type: "invites", prevu: true, parts: invites[j][0], quoi: invites[j][1], repas: invites[j][2] });
  if (j === "2027-02-14") e.push({ type: "deux", prevu: true, quoi: "Saint-Valentin, le petit chez ses grands-parents", parts: 2 });
  if (j === "2027-06-02") e.push({ type: "invites", prevu: false, parts: 5, quoi: "deux amis passent à l'improviste", repas: "diner" });
  // Les imprévus.
  if (entre(j, "2026-11-12", "2026-11-14")) e.push({ type: "malade", prevu: false, quoi: "le petit est malade, on mange des pâtes" });
  if (j === "2026-11-28" || j === "2027-04-24") e.push({ type: "rupture", prevu: false, quoi: "deux articles manquent en rayon" });
  if (j === "2027-01-08") e.push({ type: "panne-congelo", prevu: false, quoi: "coupure de courant de 14 h, le congélateur a décongelé" });
  if (entre(j, "2027-01-20", "2027-01-30")) e.push({ type: "four-en-panne", prevu: false, quoi: "le four est en panne" });
  if (j === "2027-03-05" || j === "2027-10-01") e.push({ type: "dehors", prevu: false, quoi: "invités au dernier moment chez des amis" });
  if (j === "2027-04-17") e.push({ type: "liste-oubliee", prevu: false, quoi: "liste oubliée, courses de mémoire" });
  if (j === "2027-05-21") e.push({ type: "jete", prevu: false, quoi: "un reste a tourné avant sa date" });
  if (entre(j, "2027-07-05", "2027-07-31") && new Date(j).getDay() === 3) e.push({ type: "don", prevu: false, quoi: "courgettes et tomates du jardin d'un voisin" });
  if (entre(j, "2027-07-12", "2027-07-18")) e.push({ type: "canicule", prevu: false, quoi: "canicule, pas de four" });
  if (j === "2027-09-10") e.push({ type: "rate", prevu: false, quoi: "plat brûlé, pizza commandée" });
  if (j === "2027-10-04") e.push({ type: "panne-frigo", prevu: false, quoi: "le frigo lâche dans la nuit" });
  if (j === "2027-03-15") e.push({ type: "batch", prevu: true, quoi: "dimanche de batch cooking" });
  return e;
}

// ───────────────────────────────────────────────────────────── l'état
const etat = existsSync(ETAT)
  ? JSON.parse(readFileSync(ETAT, "utf8"))
  : { jour: 0, reel: {}, restes: [], recents: [], compte: { cuits: 0, restesManges: 0, jetes: 0, gaspilleG: 0 } };
const sauver = () => writeFileSync(ETAT, JSON.stringify(etat));
const note = (j, type, texte, extra = {}) => { appendFileSync(NOTES, JSON.stringify({ j, type, texte, ...extra }) + "\n"); console.log(`  ⚑ ${type} — ${texte}`); };

// ───────────────────────────────────────────────────────────── le navigateur
const ctx = await chromium.launchPersistentContext(PROFILE, {
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block",
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(15_000);
let jourCourant = "";
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text().slice(0, 300)); });

let taps = 0;
const tap = async (loc) => { taps += 1; await loc.dispatchEvent("click"); };
const texte = () => page.evaluate(() => document.body.innerText);
const aller = async (route) => { await page.goto(`${URL}/#/${route}`); await page.waitForTimeout(250); };
const attendre = async (sel, t = 15_000) => page.locator(sel).first().waitFor({ timeout: t });
const capture = async (nom) => { try { await page.screenshot({ path: `${OUT}/captures/${nom}.png`, fullPage: false }); } catch {} };

async function ouvrirJour(j, heure = "07:30") {
  await page.clock.setFixedTime(new Date(`${j}T${heure}:00`));
  await aller("cockpit");
  await attendre(".co-barre", 30_000);
}

// ───────────────────────────────────────────────────────────── le monde réel
function acheter(nom, q, j) {
  const id = idParNom.get(norm(nom)) ?? norm(nom);
  const m = /([\d.,]+)\s*(kg|g|l|cl|ml)?/i.exec(q ?? "");
  let qte = m ? parseFloat(m[1].replace(",", ".")) : 1;
  const u = (m?.[2] ?? "u").toLowerCase();
  if (u === "kg" || u === "l") qte *= 1000; if (u === "cl") qte *= 10;
  const r = etat.reel[id] ?? { q: 0, achete: 0 };
  r.q += qte; r.achete = qte; r.le = j; r.frais = FRAIS.test(rayonDe.get(id) ?? "");
  etat.reel[id] = r;
}
function consommer(plat, parts) {
  const f = Math.max(0.5, parts / (plat.portions || 4));
  for (const i of plat.ingredients) {
    if (i.base || toujours.has(i.id)) continue;
    const r = etat.reel[i.id];
    if (!r) continue;
    r.q = Math.max(0, r.q - (i.qty ?? 0) * Math.min(f, 2));
  }
}
function reponse(nomQ) {
  const id = idParNom.get(norm(nomQ.replace(/^Des?\s+|^De l[a’']?\s*|\s*\?$/g, "")));
  if (!id) return "Non";
  if (toujours.has(id)) return "Oui";
  const r = etat.reel[id];
  if (!r || r.q <= 0) return "Non";
  return r.q < 0.3 * (r.achete || 1) ? "Il en reste peu" : "Oui";
}
function pourrirLeFrais(j) {
  for (const [id, r] of Object.entries(etat.reel)) {
    if (r.frais && r.q > 0 && (new Date(j) - new Date(r.le)) / 864e5 > 7) {
      etat.compte.gaspilleG += r.q; r.q = 0;
    }
  }
}

// ───────────────────────────────────────────────────────────── les gestes
const DESSERT = /cookie|g[âa]teau|cake|muffin|madeleine|biscuit|compote|confiture|cr[èe]me |smoothie|water|financier|brownie|crumble|clafoutis|panna|mousse au|tarte (aux|au) (pomme|poire|fraise|citron|chocolat)|granola|pancake|cr[êe]pe/i;

/** Choisir une carte comme le ferait le foyer : un vrai repas, pas trop long en semaine, pas déjà mangé cette semaine. */
function choisir(cartes, j, ev) {
  const sem = ![0, 6].includes(new Date(j).getDay());
  const four = ev.some((e) => e.type === "four-en-panne" || e.type === "canicule");
  let raisons = [];
  const ok = cartes.map((c, n) => {
    const p = platParTitre.get(c.titre);
    const pourquoi = [];
    if (DESSERT.test(c.titre) || (p && p.role && p.role !== "plat")) pourquoi.push("pas un repas");
    if (sem && c.minutes > 75) pourquoi.push("trop long un soir de semaine");
    if (etat.recents.includes(c.titre)) pourquoi.push("déjà mangé récemment");
    if (four && p && (p.vaisselle?.id ?? "").match(/plat|moule|four|cocotte/) ) pourquoi.push("demande le four");
    raisons.push(`${c.titre}: ${pourquoi.join(", ") || "ok"}`);
    return { n, ok: !pourquoi.length, pourquoi };
  });
  return { choix: ok.find((x) => x.ok)?.n ?? -1, raisons, ok };
}
const minutes = (t) => { const h = /(\d+)\s*h\s*(\d+)?/.exec(t); if (h) return +h[1] * 60 + +(h[2] ?? 0); const m = /(\d+)\s*min/.exec(t); return m ? +m[1] : 0; };

/** Une passe du fil. Renvoie le nombre de plats posés. */
async function passe(j, nRepas, ev, stats) {
  await aller("cuisine/fil");
  await attendre(".co-h, .co-question, .co-jouable, .co-vide, button:has-text('repas')", 30_000);
  // Une passe finie ou en cours reste ouverte : on la ferme pour en ouvrir une.
  const fin = page.getByRole("button", { name: "Poser un plat de plus" });
  if (await fin.count()) { await tap(fin); await page.waitForTimeout(500); }
  const bouton = page.getByRole("button", { name: `${nRepas} repas`, exact: true });
  if (!(await bouton.count())) {
    // Pas l'écran « combien ? » : une passe en cours. On la poursuit.
    stats.passeReprise = (stats.passeReprise ?? 0) + 1;
  } else { await tap(bouton); }
  let poses = 0, questions = 0, repioches = 0, ignores = 0, tours = 0;
  const vus = new Set();
  while (tours++ < 120) {
    await page.waitForTimeout(350);
    await page.locator(".co-question, .co-jouable, .co-vide, .co-h").first().waitFor({ timeout: 20_000 }).catch(() => {});
    const url = page.url();
    if (await page.locator(".co-h", { hasText: "La passe est finie" }).count()) break;
    if (await page.locator(".co-question").isVisible().catch(() => false)) {
      const q = (await page.locator(".co-question .nom").innerText()).trim();
      const r = reponse(q);
      questions++;
      await tap(page.locator(".co-question").getByRole("button", { name: r, exact: true }));
      await page.waitForFunction((a) => { const e = document.querySelector(".co-question .nom"); return e ? e.textContent.trim() !== a : true; }, q, { timeout: 15_000 }).catch(() => {});
      continue;
    }
    const cartes = page.locator(".co-jouable");
    const n = await cartes.count();
    if (!n) {
      const vide = await texte();
      if (/Plus de cartes/.test(vide)) note(j, "impasse", "« Plus de cartes pour ce créneau » pendant une passe");
      else if (/n’est plus là|n'est plus là/.test(vide)) note(j, "impasse", "« Ce créneau n'est plus là » pendant une passe");
      else note(j, "impasse", "écran du fil sans question ni carte : " + vide.slice(0, 160).replace(/\n/g, " / "));
      const pas = page.getByRole("button", { name: "Pas celui-là" });
      if (await pas.count()) { await tap(pas); ignores++; continue; }
      break;
    }
    const lues = [];
    for (let k = 0; k < n; k++) {
      const c = cartes.nth(k);
      const titre = (await c.locator(".tete .nom").innerText()).trim();
      const meta = await c.locator(".tete .meta").innerText().catch(() => "");
      lues.push({ titre, minutes: minutes(meta), meta, texte: (await c.innerText()).replace(/\n/g, " | ") });
    }
    for (const l of lues) { stats.cartesVues = (stats.cartesVues ?? 0) + 1; if (DESSERT.test(l.titre)) stats.dessertsProposes = (stats.dessertsProposes ?? 0) + 1; if (/finit des paquets entam/.test(l.texte)) stats.entameProposes = (stats.entameProposes ?? 0) + 1; }
    const { choix, raisons } = choisir(lues.filter((l) => !vus.has(l.titre) || true), j, ev);
    if (choix >= 0 && !vus.has(lues[choix].titre)) {
      const t = lues[choix];
      vus.add(t.titre);
      await tap(cartes.nth(choix).getByRole("button", { name: /Je fais ça|Poser|Le faire/ }).first());
      poses++;
      etat.recents = [...etat.recents.slice(-10), t.titre];
      stats.poses = [...(stats.poses ?? []), `${t.titre} (${t.meta.replace(/\n/g, " ")})`];
      if (/réchauff/.test(t.meta + t.texte)) stats.restesPoses = (stats.restesPoses ?? 0) + 1;
      await page.waitForURL((u) => u.toString() !== url, { timeout: 10_000 }).catch(() => {});
      continue;
    }
    if (repioches < 3 && (await page.getByRole("button", { name: /Repiocher/ }).count())) {
      repioches++; await tap(page.getByRole("button", { name: /Repiocher/ })); continue;
    }
    // Rien ne convient : on prend quand même la première carte qui est un repas, sinon on passe.
    const repli = lues.findIndex((l) => !DESSERT.test(l.titre));
    if (repli >= 0) {
      stats.compromis = [...(stats.compromis ?? []), raisons.join(" ; ").slice(0, 400)];
      await tap(cartes.nth(repli).getByRole("button", { name: /Je fais ça/ }).first());
      poses++; etat.recents = [...etat.recents.slice(-10), lues[repli].titre];
      stats.poses = [...(stats.poses ?? []), `${lues[repli].titre} (compromis)`];
      await page.waitForURL((u) => u.toString() !== url, { timeout: 10_000 }).catch(() => {});
      continue;
    }
    ignores++; await tap(page.getByRole("button", { name: "Pas celui-là" }));
  }
  if (tours >= 120) note(j, "boucle", "la passe n'a pas fini en 120 tours");
  Object.assign(stats, { passePoses: (stats.passePoses ?? 0) + poses, questions: (stats.questions ?? 0) + questions, repioches: (stats.repioches ?? 0) + repioches, ignores: (stats.ignores ?? 0) + ignores });
  return poses;
}

/** Les courses : cocher au magasin, rentrer à la maison. */
async function courses(j, ev, stats) {
  await aller("cuisine/courses");
  await attendre(".co-kicker", 20_000);
  await page.waitForTimeout(600);
  const arts = page.locator("button.co-art");
  const n = await arts.count();
  const lignes = [];
  for (let k = 0; k < n; k++) lignes.push({ nom: (await arts.nth(k).locator(".nom").innerText()).trim(), q: (await arts.nth(k).locator(".q").innerText().catch(() => "")).trim(), pour: (await arts.nth(k).locator(".pour").innerText().catch(() => "")).trim(), classe: await arts.nth(k).getAttribute("class") });
  const rupture = ev.some((e) => e.type === "rupture");
  const oubli = ev.some((e) => e.type === "liste-oubliee");
  const manquants = rupture ? new Set(lignes.filter((l) => !/rentr/.test(l.classe)).slice(0, 2).map((l) => l.nom)) : new Set();
  const txt = await texte();
  const aVerifier = /Vous en avez — vérifiez la quantité\n([^\n]*)/.exec(txt)?.[1] ?? "";
  let coches = 0;
  for (let k = 0; k < n; k++) {
    const l = lignes[k];
    if (/coche|rentre/.test(l.classe ?? "")) continue;
    if (manquants.has(l.nom)) continue;
    if (oubli && k % 4 === 3) continue; // de mémoire, on oublie un article sur quatre
    await tap(arts.nth(k)); coches++;
    await page.waitForTimeout(120);
  }
  await tap(page.getByRole("button", { name: "À la maison" }));
  await page.waitForTimeout(400);
  const tout = page.getByRole("button", { name: /Tout rentrer/ });
  if (await tout.count()) { await tap(tout); await page.waitForTimeout(800); }
  for (const l of lignes) if (!manquants.has(l.nom) && !/rentre/.test(l.classe ?? "")) acheter(l.nom, l.q, j);
  // Ce que la liste ne dit pas : on note les lignes qui restent sans rentrer et les orphelins.
  const apres = await texte();
  const orph = /La semaine a changé : (\d+)/.exec(apres)?.[1];
  if (orph) stats.orphelins = +orph;
  if (manquants.size) note(j, "rupture", `non trouvés en rayon : ${[...manquants].join(", ")} — l'app n'a aucun geste pour « pas trouvé », la ligne reste dans la liste`);
  Object.assign(stats, { articles: n, coches, aVerifier: aVerifier.slice(0, 300), plancherLignes: lignes.filter((l) => /plancher|toujours|placard/i.test(l.pour)).length });
  stats.liste = lignes.map((l) => `${l.nom} ${l.q} (${l.pour})`);
  return n;
}

/** Les posés, tels que l'écran les montre. */
async function lirePoses() {
  await aller("cuisine/poses");
  await attendre(".co-barre", 20_000);
  await page.waitForTimeout(500);
  const lots = page.locator(".co-lot");
  const n = await lots.count();
  const out = [];
  for (let k = 0; k < n; k++) out.push({ titre: (await lots.nth(k).locator(".nom").innerText()).trim(), ou: (await lots.nth(k).locator(".ou").first().innerText()).trim(), q: (await lots.nth(k).locator(".q").innerText().catch(() => "")).trim() });
  return out;
}

/** Régler les parts du premier posé — Posés › Changer › « N parts ». */
async function reglerParts(j, voulu, stats) {
  await aller("cuisine/poses"); await attendre(".co-barre");
  await page.waitForTimeout(400);
  const changer = page.locator(".co-lot").first().getByRole("link", { name: "Changer" });
  if (!(await changer.count())) { note(j, "parts", "aucun posé dont régler les parts"); return; }
  await tap(changer);
  const lien = page.getByRole("link", { name: /parts$/ }).first();
  await lien.waitFor({ timeout: 10_000 }).catch(() => {});
  if (!(await lien.count())) { note(j, "parts", "« Changer » n'offre pas le réglage des parts : " + (await texte()).slice(0, 200)); return; }
  const avant = parseFloat((await lien.innerText()).replace(",", "."));
  await tap(lien);
  await page.waitForTimeout(500);
  const plus = page.getByRole("button", { name: voulu > avant ? "plus de parts" : "moins de parts" });
  let k = 0;
  while (k++ < 40) {
    const v = parseFloat(((await page.locator(".co-parts .n, .v, .chiffre").first().innerText().catch(() => "0")) || "0").replace(",", "."));
    if ((voulu > avant && v >= voulu) || (voulu < avant && v <= voulu && v > 0)) break;
    if (!(await plus.count()) || (await plus.isDisabled())) break;
    await tap(plus); await page.waitForTimeout(120);
  }
  const t = await texte();
  stats.parts = { avant, voulu, taps: k, ecran: t.slice(0, 250).replace(/\n/g, " / ") };
}

/** Cuisiner le premier posé, du guide à la sortie. */
async function cuisiner(j, ev, stats, { autrement = false, parts = 2.75 } = {}) {
  const poses = await lirePoses();
  if (!poses.length) return null;
  const p0 = poses[0];
  await tap(page.locator(".co-lot").first().getByRole("link", { name: "Voir la recette" }));
  await attendre(".co-fiche-tete", 20_000);
  const ouvrir = page.getByRole("button", { name: /Ouvrir le guide|Cuisiner ce plat/ });
  if (await ouvrir.count()) await tap(ouvrir);
  await page.waitForTimeout(400);
  let etapes = 0;
  for (let k = 0; k < 60; k++) {
    const sortie = page.getByRole("button", { name: /C’est rangé comme ça|C’est fait$/ });
    if (await page.locator(".co-encart", { hasText: "C’est prêt" }).count()) break;
    const suiv = page.locator(".co-pas .suiv");
    const term = page.getByRole("button", { name: "Terminer" });
    if (await suiv.count()) {
      const lib = await suiv.innerText();
      await tap(suiv); etapes++;
      await page.waitForTimeout(lib.includes("Terminer") ? 500 : 150);
    } else if (await term.count()) { await tap(term); await page.waitForTimeout(500); }
    else { note(j, "guide", "ni « C'est fait » ni « Terminer » : " + (await texte()).slice(0, 200).replace(/\n/g, " / ")); break; }
  }
  // La sortie.
  const sortieTxt = await texte();
  const lots = [];
  const ls = page.locator(".co-corps .co-lot");
  for (let k = 0; k < (await ls.count()); k++) lots.push({ nom: (await ls.nth(k).locator(".nom").innerText()).trim(), garde: (await ls.nth(k).locator(".q").innerText().catch(() => "")).trim() });
  const range = page.getByRole("button", { name: "C’est rangé comme ça" });
  const autre = page.getByRole("button", { name: "J’ai fait autrement" });
  const fait = page.getByRole("button", { name: "C’est fait", exact: true });
  let reponseDonnee = "";
  if (autrement && (await autre.count())) { await tap(autre); reponseDonnee = "autrement"; }
  else if (await range.count()) { await tap(range); reponseDonnee = "rangé"; }
  else if (await fait.count()) { await tap(fait); reponseDonnee = "fait"; }
  else note(j, "sortie", "pas d'écran de sortie : " + sortieTxt.slice(0, 200).replace(/\n/g, " / "));
  await page.waitForURL((u) => !/cuisiner/.test(u.toString()), { timeout: 10_000 }).catch(() => note(j, "sortie", "la fiche ne s'est pas refermée"));
  const plat = platParTitre.get(p0.titre);
  if (plat) consommer(plat, parts);
  // Le monde réel mange aussi les restes que le plat réclame : la bolognaise
  // des pâtes, le poulet des fajitas, n'importe quel reste pour « Reste réchauffé ».
  for (const a of plat?.accepts ?? []) {
    const vivants = etat.restes.filter((r) => !r.jete && r.portions > 0);
    const pris = a.type
      ? vivants.filter((r) => r.types.includes(a.type)).sort((x, y) => (x.ou === "Frigo" ? -1 : 1) - (y.ou === "Frigo" ? -1 : 1))[0]
      : vivants.filter((r) => r.ou === "Frigo")[0] ?? vivants[0];
    if (pris) { pris.portions = 0; pris.mangeLe = j; pris.parPlat = p0.titre; etat.compte.restesManges++; }
    else if (a.requis) note(j, "chaine", `« ${p0.titre} » réclame ${a.type ?? "un reste"} que la maison n'a pas (l'app l'a cru disponible)`);
  }
  // Le monde réel garde ce que la sortie a dit de ranger (ou tout au frigo si « autrement »).
  for (const l of lots) {
    const m = /^(Frigo|Congélo|Congélateur)[^·]*·\s*(.*)$/.exec(l.nom);
    const portions = parseFloat((/([\d,]+)\s*(part|portion)/.exec(l.nom)?.[1] ?? "2").replace(",", "."));
    etat.restes.push({ plat: p0.titre, types: (plat?.emits ?? []).map((e) => e.type), ou: autrement ? "Frigo" : (m?.[1] ?? "Frigo"), portions, le: j, garde: parseInt(l.garde) || (m?.[1] === "Frigo" ? 3 : 90), quoi: l.nom });
  }
  etat.compte.cuits++;
  stats.cuits = [...(stats.cuits ?? []), { titre: p0.titre, etapes, reponse: reponseDonnee, lots: lots.map((l) => `${l.nom} ${l.garde}`) }];
  return p0.titre;
}

/** Le stock tel que l'app le montre : lots (nom, où, quantité, mots). */
async function lireStock() {
  await aller("cuisine/stock");
  await attendre(".co-barre", 20_000);
  await page.getByText("TOUS LES LOTS", { exact: false }).first().waitFor({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const out = [];
    for (const l of document.querySelectorAll(".co-lot")) {
      const nom = l.querySelector(".nom")?.textContent?.trim();
      const ou = [...l.querySelectorAll(".ou")].map((x) => x.textContent.trim()).join(" | ");
      if (!/Frigo|Congélo|Placard/.test(ou) || !l.querySelector("button")) continue;
      out.push({ nom, ou, q: l.querySelector(".q")?.textContent?.trim(), src: [...l.querySelectorAll(".src")].map((x) => x.textContent.trim()).join(" ") });
    }
    return out;
  });
}

/** « Je n'en ai plus » sur le premier lot qui correspond. */
async function plusDe(filtre) {
  await aller("cuisine/stock");
  await attendre(".co-barre", 20_000);
  await page.waitForTimeout(500);
  const lots = page.locator(".co-lot").filter({ has: page.getByRole("button", { name: "Je n’en ai plus" }) });
  const n = await lots.count();
  for (let k = 0; k < n; k++) {
    const t = await lots.nth(k).innerText();
    if (filtre(t)) { await tap(lots.nth(k).getByRole("button", { name: "Je n’en ai plus" })); await page.waitForTimeout(500); return t.split("\n")[0]; }
  }
  return null;
}

// ───────────────────────────────────────────────────────────── une journée
async function journee(idx) {
  const d = new Date(DEBUT); d.setDate(d.getDate() + idx);
  const j = iso(d);
  jourCourant = j;
  const dow = d.getDay();
  const ev = evenements(j);
  const demain = (k) => { const x = new Date(d); x.setDate(x.getDate() + k); return evenements(iso(x)); };
  const stats = { j, dow, ev: ev.map((e) => e.quoi) };
  taps = 0; erreurs.length = 0;
  const t0 = Date.now();

  await ouvrirJour(j);
  const cockpit = await texte();
  stats.cockpit = (/aujourd'hui\.\n\n([\s\S]*?)\nVOS FACETTES/.exec(cockpit)?.[1] ?? "").replace(/\n/g, " / ").slice(0, 250);
  stats.cuisineFacette = (/Cuisine\n([^\n]*RÉPONDUS[^\n]*\n[^\n]*)/.exec(cockpit)?.[1] ?? "").replace(/\n/g, " / ");
  const absent = ev.some((e) => e.type === "absent");

  // Le monde réel vieillit : le frais pourrit, les restes passent leur date.
  pourrirLeFrais(j);
  for (const r of etat.restes) {
    const age = (d - new Date(r.le)) / 864e5;
    if (!r.jete && r.portions > 0 && age > r.garde) { r.jete = j; etat.compte.jetes++; stats.restesPerimes = (stats.restesPerimes ?? 0) + 1; }
  }

  // Les pannes : on vide ce qui a été perdu, lot par lot, dans l'app.
  for (const e of ev.filter((e) => e.type === "panne-congelo" || e.type === "panne-frigo")) {
    const lieu = e.type === "panne-congelo" ? "Congélo" : "Frigo";
    let n = 0; while (n < 40 && (await plusDe((t) => t.includes(lieu)))) n++;
    for (const r of etat.restes) if (!r.jete && r.ou.startsWith(lieu.slice(0, 5))) { r.jete = j; etat.compte.jetes++; }
    if (lieu === "Frigo") for (const r of Object.values(etat.reel)) if (r.frais) { etat.compte.gaspilleG += r.q; r.q = 0; }
    note(j, "panne", `${e.quoi} : ${n} lots retirés un par un (« Je n'en ai plus » ×${n}) — pas de geste « tout ce qui était au ${lieu.toLowerCase()} est perdu »${lieu === "Frigo" ? " ; et rien pour le frais acheté (beurre, crème, légumes) qui n'est pas un lot" : ""}`);
  }
  if (ev.some((e) => e.type === "jete")) {
    const r = etat.restes.find((x) => !x.jete && x.ou === "Frigo" && x.portions > 0);
    if (r) { r.jete = j; const t = await plusDe((x) => r.types.some((ty) => x.includes(ty))); note(j, "jete", `reste de « ${r.plat} » tourné : ${t ? "retiré via Je n'en ai plus" : "introuvable dans l'app"}`); }
  }
  if (ev.some((e) => e.type === "don")) {
    note(j, "don", "courgettes et tomates offertes : aucun écran ne permet d'entrer de la nourriture hors liste de courses — le don n'existe pas pour l'app, rien ne propose de le cuisiner");
    for (const id of ["courgette", "tomate"]) { etat.reel[id] = { q: (etat.reel[id]?.q ?? 0) + 1500, achete: 1500, le: j, frais: true }; }
  }

  if (!absent) {
    // Planifier : le samedi, ou quand les posés sont épuisés, ou avant un événement prévu.
    let poses = await lirePoses();
    stats.posesMatin = poses.length;
    const retourDeVacances = demain(-1).some((e) => e.type === "absent");
    if (retourDeVacances && poses.length) {
      note(j, "retour", `retour d'absence : ${poses.length} plats posés avant de partir sont toujours là (reportés de jour en jour), leurs produits frais ont tourné`, { poses: poses.map((p) => p.titre) });
      await tap(page.getByRole("button", { name: /J’ai fini — tout effacer/ }));
      await tap(page.getByRole("button", { name: /Oui, j’ai fini/ }));
      await page.waitForTimeout(500);
      poses = [];
    }
    const partirBientot = [1, 2].some((k) => demain(k).some((e) => e.type === "absent"));
    const planif = (dow === 6 || poses.length < 1) && !partirBientot;
    const batch = ev.some((e) => e.type === "batch");
    if (planif || batch) {
      const n = batch ? 5 : dow === 6 ? 7 : 3;
      const posesAvant = poses.length;
      await passe(j, n, ev, stats);
      await courses(j, ev, stats);
      stats.planifie = n;
      poses = await lirePoses();
      if (poses.length === posesAvant) note(j, "passe", `passe de ${n} repas sans aucun plat posé`);
    } else if (partirBientot && poses.length < 1) {
      note(j, "absence", "départ dans deux jours : on improvise sans planifier, rien ne permet de dire à l'app qu'on s'absente");
    }

    // Les invités : régler les parts du plat qu'on va servir.
    for (const e of ev.filter((e) => e.type === "invites" || e.type === "deux")) {
      if (!poses.length) { await passe(j, 1, ev, stats); await courses(j, ev, stats); }
      await reglerParts(j, e.parts, stats);
      if (!e.prevu) note(j, "imprevu", `${e.quoi} : parts montées le soir même ; la liste de courses déjà faite ne le sait pas`);
    }

    // Le déjeuner : le week-end on cuisine, en semaine les adultes emportent un reste.
    if ([0, 6].includes(dow) || ev.some((e) => e.type === "invites" && e.repas === "dejeuner")) {
      const malade = ev.some((e) => e.type === "malade");
      if (!malade) {
        const invite = ev.find((e) => e.type === "invites" && e.repas === "dejeuner");
        await page.clock.setFixedTime(new Date(`${j}T12:00:00`));
        const t = await cuisiner(j, ev, stats, { parts: invite?.parts ?? 2.75 });
        if (!t) stats.dejeunerSansPose = true;
      }
    } else {
      const r = etat.restes.find((x) => !x.jete && x.portions > 0 && x.ou === "Frigo");
      if (r) {
        r.portions -= 2; etat.compte.restesManges++;
        stats.gamelle = r.plat;
        if (r.portions <= 0) {
          const t = await plusDe((x) => r.types.some((ty) => x.includes(ty)) && x.includes("Frigo"));
          stats.gamelleRetiree = t ?? "introuvable";
          if (!t) note(j, "reste", `reste de « ${r.plat} » fini à la gamelle, mais l'app n'a pas de lot frigo à son nom (${r.types.join(",")})`);
        } else stats.gamellePartielle = `${r.plat} : il reste ${r.portions} parts — l'app ne sait pas qu'on en a mangé 2`;
      }
    }

    // Le dîner.
    await page.clock.setFixedTime(new Date(`${j}T19:00:00`));
    if (ev.some((e) => e.type === "dehors")) { note(j, "dehors", "dîner dehors à l'improviste : le plat posé de ce soir glisse simplement, rien à dire à l'app"); stats.diner = "dehors"; }
    else if (ev.some((e) => e.type === "malade")) {
      stats.diner = "pâtes, hors app";
      note(j, "malade", "le petit est malade : pâtes au beurre — pas de plat « simple » dans la main, cuisson non journalisée");
    } else {
      const invite = ev.find((e) => (e.type === "invites" && e.repas === "diner") || e.type === "deux");
      const rate = ev.some((e) => e.type === "rate");
      const autrement = rate || hasard() < 0.05;
      let t = await cuisiner(j, ev, stats, { autrement, parts: invite?.parts ?? 2.75 });
      if (!t) {
        // Rien de posé : on demande un repas au fil, et on le fait.
        await passe(j, 1, ev, stats);
        const n = await courses(j, ev, stats);
        if (n) stats.petitesCourses = n;
        t = await cuisiner(j, ev, stats, { parts: invite?.parts ?? 2.75 });
      }
      stats.diner = t ?? "rien";
      if (rate) note(j, "rate", "plat brûlé : « J'ai fait autrement » range quand même des restes au frigo qui n'existent pas");
    }
  } else {
    stats.absent = true;
  }

  // Le soir : ce qui a passé sa date dans le monde réel quitte aussi l'app.
  for (const r of etat.restes.filter((x) => x.jete === j && !x.retireApp)) {
    r.retireApp = true;
    const t = await plusDe((x) => r.types.some((ty) => x.includes(ty)) && x.includes(r.ou.slice(0, 5)));
    stats.jetesApp = [...(stats.jetesApp ?? []), `${r.plat}: ${t ? "retiré" : "déjà absent de l'app"}`];
  }

  // Le dimanche : l'inventaire de l'app contre le monde réel.
  if (dow === 0 || idx === N - 1) {
    const lots = await lireStock();
    const reelsRestes = etat.restes.filter((x) => !x.jete && x.portions > 0);
    stats.inventaire = {
      app: lots.map((l) => `${l.nom} | ${l.ou} | ${l.q} | ${l.src}`),
      reel: reelsRestes.map((r) => `${r.plat} | ${r.ou} | ${r.portions} parts | depuis ${r.le}`),
      frais: Object.entries(etat.reel).filter(([, r]) => r.q > 0).length,
    };
    const st = await texte();
    stats.stockEcran = {
      planchers: (/Le stock d’urgence\n([^\n]*)\n([^\n]*)/.exec(st) ?? []).slice(1).join(" / "),
      gardeManger: (/LE GARDE-MANGER\n([^\n]*)/.exec(st)?.[1] ?? ""),
      plafonds: (/LA CUISINE EST UN LIEU FINI\n([\s\S]*?)Deux plafonds/.exec(st)?.[1] ?? "").replace(/\n/g, " "),
      enAjouter: (/(L’app propose[^\n]*|En garder[^\n]*)/.exec(st)?.[1] ?? ""),
    };
  }
  if (idx % 30 === 0 || ev.length) { await aller("cuisine/stock"); await page.waitForTimeout(800); await capture(`${j}-stock`); await aller("cockpit"); await page.waitForTimeout(600); await capture(`${j}-cockpit`); }

  stats.taps = taps;
  stats.secondes = Math.round((Date.now() - t0) / 1000);
  if (erreurs.length) { stats.erreurs = [...new Set(erreurs)].slice(0, 5); }
  appendFileSync(JOURNAL, JSON.stringify(stats) + "\n");
  console.log(`${j} ${["dim", "lun", "mar", "mer", "jeu", "ven", "sam"][dow]} taps=${taps} ${stats.secondes}s dîner=${stats.diner ?? "-"} ${stats.planifie ? `plan=${stats.planifie} posés=${stats.passePoses} q=${stats.questions} art=${stats.articles}` : ""} ${ev.map((e) => e.type).join(",")}`);
}

try {
  for (; etat.jour < N; etat.jour++) {
    try { await journee(etat.jour); }
    catch (e) {
      note(jourCourant, "crash", String(e).slice(0, 400));
      await capture(`${jourCourant}-crash`);
    }
    sauver();
  }
} finally {
  sauver();
  await ctx.close();
}
