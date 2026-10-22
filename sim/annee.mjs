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
// PERSONA=moi : le foyer tel qu'il se décrit le 2026-10-16 — pas de semaine
// planifiée, le dîner décidé ET lancé à 15 h (télétravail) pour 18 h, courses
// le mercredi et le samedi, les légumineuses d'abord, les plats aimés reviennent,
// et quand rien ne va : pâtes ou gnocchis, comme avant.
const MOI = process.env.PERSONA === "moi";
// FLUX=passe : la persona du deuxième passage (le fil, une passe d'un repas).
// Par défaut, la pause de 15 h passe par le cockpit et « Ce soir » (T127–T129).
const PASSE = process.env.FLUX === "passe";
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
// JOURS=30 : un essai court, sans toucher à la ligne de commande.
const N = +(process.env.JOURS ?? process.argv[2] ?? 365);
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
const sauver = () => { writeFileSync(ETAT, JSON.stringify(etat)); if (MOI) ecrireConso(); };
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
// T146 — on rallume le téléphone : l'onglet resté ouvert reçoit son
// `visibilitychange`, comme au réel (un `goto` sur la même ancre ne redessine rien).
const aller = async (route) => {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))).catch(() => {});
  await page.goto(`${URL}/#/${route}`); await page.waitForTimeout(250);
};
const attendre = async (sel, t = 15_000) => page.locator(sel).first().waitFor({ timeout: t });
// Ce que l'écran montrait quand une attente a échoué : l'URL et le début du texte.
const diag = async () => { try { return ` [${page.url().replace(/^.*#/, "#")}] ${(await texte()).slice(0, 220).replace(/\n/g, " / ")}`; } catch { return ""; } };
const capture = async (nom) => { try { await page.screenshot({ path: `${OUT}/captures/${nom}.png`, fullPage: false }); } catch {} };

async function ouvrirJour(j, heure = "07:30") {
  await page.clock.setFixedTime(new Date(`${j}T${heure}:00`));
  await aller("cockpit");
  await attendre(".co-barre", 30_000);
}

// ───────────────────────────────────────────────────────────── le monde réel
// T134 — UNE LIGNE « POUR LE FOND » SE COMPTE EN UNITÉS D'ACHAT (« 2 unités »),
// et le grand livre en unités de recette. Sans conversion, deux sachets de
// lentilles valaient 2 g et le premier hachis les vidait. Une unité du fond =
// son poids quand `fond.yaml` le dit (« sachet de 500 g »), son compte (« boîte
// de 6 »), une recette pour une boîte, une brique ou un tube, deux sinon.
const UNITE_RECETTE = new Map(), QTE_RECETTE = new Map();
for (const p of cat.plats) for (const i of p.ingredients) {
  if (i.base || i.assaisonnement) continue;
  const id = cat.rayons.aliases?.[i.id] ?? i.id;
  // T146 — LA MASSE GAGNE : la pomme de terre se dit à la pièce, en grammes
  // ou en kilos selon la recette ; le grand livre la tient en grammes dès
  // qu'une recette la pèse (run 9 : « 153 kg » de pommes de terre par an,
  // des pièces additionnées à des kilos).
  const u = /^kg$/i.test(i.unit ?? "") ? "g" : i.unit;
  if (!UNITE_RECETTE.has(id) || (u === "g" && UNITE_RECETTE.get(id) !== "g")) UNITE_RECETTE.set(id, u);
  QTE_RECETTE.set(id, Math.max(QTE_RECETTE.get(id) ?? 0, i.qty ?? 0));
}
const UNITE_FOND = new Map((cat.fond?.denrees ?? []).map((d) => [d.ingredient, d.unite ?? ""]));
function parUniteDuFond(id) {
  const u = UNITE_FOND.get(id); if (u === undefined) return null;
  const typ = QTE_RECETTE.get(id) || 1;
  const enMasse = /^(g|ml)$/.test(UNITE_RECETTE.get(id) ?? "");
  // « brique de 1 L » : un litre, pas « 1 » — sans quoi la brique de lait valait 1 ml.
  const l = /(\d+(?:[.,]\d+)?)\s*(l|cl)\b/i.exec(u);
  if (l && enMasse) return parseFloat(l[1].replace(",", ".")) * (/^cl$/i.test(l[2]) ? 10 : 1000);
  const g = /(\d+(?:[.,]\d+)?)\s*(kg|g)\b/.exec(u);
  if (g) { const grammes = parseFloat(g[1].replace(",", ".")) * (g[2] === "kg" ? 1000 : 1); return enMasse ? grammes : Math.max(1, Math.round(grammes / 150)); }
  const n = /de (\d+)\b/.exec(u); if (n) return +n[1];
  return /bo[iî]te|brique|bocal|tube/.test(u) ? typ : 2 * typ;
}
function acheter(nom, q, j) {
  const id = idParNom.get(norm(nom)) ?? norm(nom);
  // « 2 boîtes (570 g) » (T140) : le poids entre parenthèses fait foi — lu
  // « 2 », le monde rentrait deux grammes de thon.
  const m = /\(([\d.,]+)\s*(kg|g|l|cl|ml)\)/i.exec(q ?? "") ?? /([\d.,]+)\s*(kg|g|l|cl|ml)?/i.exec(q ?? "");
  let qte = m ? parseFloat(m[1].replace(",", ".")) : 1;
  const u = (m?.[2] ?? "u").toLowerCase();
  if (u === "kg" || u === "l") qte *= 1000; if (u === "cl") qte *= 10;
  if (/unit[ée]/.test(q ?? "") && parUniteDuFond(id) != null) qte *= parUniteDuFond(id);
  const r = etat.reel[id] ?? { q: 0, achete: 0 };
  r.q += qte; r.achete = qte; r.le = j; r.frais = FRAIS.test(rayonDe.get(id) ?? "");
  etat.reel[id] = r;
  // T142 — « peu de produits industriels » : toute ligne achetée qui en est un se compte.
  if (INDUSTRIEL.test(nom)) (etat.industriels ??= []).push({ j, nom, q });
}
const INDUSTRIEL = /biscuit|g[âa]teau|brioche|c[ée]r[ée]ales|bl[ée]dine|biscotte|pain de mie|p[âa]te à tartiner|compote|nugget|cordon|surimi|chips|plat pr[ée]par|soda|cr[èe]me dessert|pizza|knack|petits? pots?|gourde|madeleine|quatre[- ]quarts/i;
/**
 * La consommation par repas, au grand livre (unités de recette) : de quoi
 * dériver le stock à tenir. `partMidi` : la part d'un dîner agrandi qui
 * nourrira demain midi — elle se compte au midi.
 */
function compter(repas, id, q, partMidi = 0) {
  if (!(q > 0)) return;
  etat.conso ??= { diner: {}, midi: {}, petitDej: {}, gouter: {} };
  const m = q * partMidi;
  if (m) etat.conso.midi[id] = (etat.conso.midi[id] ?? 0) + m;
  etat.conso[repas][id] = (etat.conso[repas][id] ?? 0) + q - m;
}
function consommer(plat, parts, repas = "diner", midi = 0) {
  const f = Math.max(0.5, parts / (plat.portions || 4));
  for (const i of plat.ingredients) {
    if (i.base || toujours.has(i.id)) continue;
    const r = etat.reel[i.id];
    if (!r) continue;
    const pris = Math.min(r.q, enUniteDuLivre(i.id, i.qty ?? 0, i.unit) * Math.min(f, 2));
    r.q -= pris;
    compter(repas, i.id, pris, midi > 0 ? midi / parts : 0);
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
// T136 — LE FRAIS NE POURRIT PAS TOUT EN SEPT JOURS. Une boîte d'œufs tient
// 28 jours, yaourts et fromage râpé fermés trois semaines (`conservation.yaml`,
// familles `fond: true`). À sept jours pour tout le rayon crèmerie, le grand
// livre vidait ces trois denrées sans une cuisson : l'année n° 5 a compté 275
// « manques réels » que l'app ne pouvait pas voir, faute d'un geste à rejouer.
const GARDE_JOURS = new Map();
for (const f of cat.garde ?? []) if (f.fond) for (const id of f.ids) GARDE_JOURS.set(id, f.fenetreJours);
function pourrirLeFrais(j) {
  for (const [id, r] of Object.entries(etat.reel)) {
    if (r.frais && r.q > 0 && (new Date(j) - new Date(r.le)) / 864e5 > (GARDE_JOURS.get(id) ?? 7)) {
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
    if (!MOI && sem && c.minutes > 75) pourquoi.push("trop long un soir de semaine");
    if (MOI && c.minutes > 170) pourquoi.push("pas prêt pour 18 h en lançant à 15 h");
    if (!MOI && etat.recents.includes(c.titre)) pourquoi.push("déjà mangé récemment");
    if (MOI && etat.recents.slice(-3).includes(c.titre)) pourquoi.push("mangé ces trois derniers jours");
    const art = +(/\+(\d+)\s*art/.exec(c.meta ?? "")?.[1] ?? 0);
    if (MOI && ![3, 6].includes(new Date(j).getDay()) && art > 1) pourquoi.push(`${art} articles à acheter un jour sans courses`);
    if (four && p && (p.vaisselle?.id ?? "").match(/plat|moule|four|cocotte/) ) pourquoi.push("demande le four");
    raisons.push(`${c.titre}: ${pourquoi.join(", ") || "ok"}`);
    return { n, ok: !pourquoi.length, pourquoi };
  });
  const legume = (n) => { const p = platParTitre.get(cartes[n].titre); return p && (p.apports?.proteine === "legumineuse" || p.apports?.feculent === "legumineuse"); };
  const prefere = MOI ? (ok.find((x) => x.ok && legume(x.n)) ?? ok.find((x) => x.ok)) : ok.find((x) => x.ok);
  return { choix: prefere?.n ?? -1, raisons, ok };
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
    // LE FOYER RÉEL NE TRANSIGE PAS : sans carte qui tienne, ce sont des pâtes.
    if (MOI) { stats.repliRaisons = raisons.join(" ; ").slice(0, 500); ignores++; await tap(page.getByRole("button", { name: "Pas celui-là" })); break; }
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
// `repas` : à quel repas le grand livre compte les ingrédients ; `midi` : les
// parts d'un dîner agrandi pour demain midi (T142) ; `fournee` : les sachets.
async function cuisiner(j, ev, stats, { autrement = false, parts = 2.75, deja = null, repas = "diner", midi = 0, fournee = false, voulu = null } = {}) {
  let p0;
  if (deja) {
    // T128/T129 : « Je lance ça » a posé le plat ET ouvert sa fiche — on y est.
    p0 = { titre: deja };
    await attendre(".co-fiche-tete", 20_000);
  } else {
    const poses = await lirePoses();
    if (!poses.length) return null;
    // Le posé qu'on est venu cuisiner, pas le premier de la liste : celle-ci
    // porte aussi le « Reste réchauffé » de demain midi (run 9, 09/01).
    const k = voulu ? Math.max(0, poses.findIndex((x) => x.titre === voulu)) : 0;
    p0 = poses[k];
    await tap(page.locator(".co-lot").nth(k).getByRole("link", { name: "Voir la recette" }));
    await attendre(".co-fiche-tete", 20_000);
  }
  const ouvrir = page.getByRole("button", { name: /Ouvrir le guide|Cuisiner ce plat/ });
  if (await ouvrir.count()) await tap(ouvrir);
  await page.waitForTimeout(400);
  // T112 : la mise en place passe avant l'étape 1.
  const parti = page.getByRole("button", { name: /C.est parti/ });
  if (await parti.count()) { stats.miseEnPlace = (stats.miseEnPlace ?? 0) + 1; await tap(parti); await page.waitForTimeout(300); }
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
  for (let k = 0; k < (await ls.count()); k++) lots.push({ nom: (await ls.nth(k).locator(".nom").innerText()).trim(), garde: (await ls.nth(k).locator(".q").innerText().catch(() => "")).trim(), tout: (await ls.nth(k).innerText()).replace(/\n/g, " | ") });
  for (const l of lots) if (/il manque/.test(l.tout)) stats.manques = [...(stats.manques ?? []), l.tout.slice(0, 160)];
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
  if (plat) consommer(plat, parts + midi, repas, midi);
  // Le monde réel mange aussi les restes que le plat réclame : la bolognaise
  // des pâtes, le poulet des fajitas, n'importe quel reste pour « Reste réchauffé ».
  for (const a of plat?.accepts ?? []) {
    const vivants = etat.restes.filter((r) => !r.jete && r.portions > 0);
    const pris = a.type
      ? vivants.filter((r) => r.types.includes(a.type)).sort((x, y) => (x.ou === "Frigo" ? -1 : 1) - (y.ou === "Frigo" ? -1 : 1))[0]
      : vivants.filter((r) => r.ou === "Frigo" && estUnRepas(r))[0] ?? vivants.filter(estUnRepas)[0];
    if (pris) { pris.portions = 0; pris.mangeLe = j; pris.parPlat = p0.titre; etat.compte.restesManges++; }
    else if (a.requis) note(j, "chaine", `« ${p0.titre} » réclame ${a.type ?? "un reste"} que la maison n'a pas (l'app l'a cru disponible)`);
  }
  // Le monde réel garde ce que la sortie a dit de ranger (ou tout au frigo si « autrement »).
  for (const l of lots) {
    const m = /^(Frigo|Congélo|Congélateur)[^·]*·\s*(.*)$/.exec(l.nom);
    let portions = parseFloat((/([\d,]+)\s*(part|portion)/.exec(l.nom)?.[1] ?? "2").replace(",", "."));
    const ou = autrement ? "Frigo" : (m?.[1] ?? "Frigo");
    const boites = boitesDuLot(l.tout, ou);
    const sachet = !boites && /\bsacs?\b/i.test(l.tout);
    // « Frigo · 1 repas » : UNE PART pour l'app (`band`, que `rangerDans`
    // range à deux par boîte et dont le midi retire `partsDuMidi`), un goûter
    // ou un matin pour un lot de la fournée. T142 le lisait « un midi des
    // quatre » (×PARTS_MIDI) : le monde gardait trois fois les restes de
    // l'app, et le midi prévu revenait le surlendemain (run 10, 12/11).
    const nRepas = /(\d+(?:,\d+)?)\s*repas/.exec(l.nom)?.[1];
    if (nRepas) portions = parseFloat(nRepas.replace(",", "."));
    // « Congélo · 350 g » d'un pain : la sortie dit le poids, la recette dit
    // les matins (`band: 3-repas`). Lu « 2 parts », le monde mangeait quatre
    // matins là où l'app en comptait six (run 10).
    else {
      const routineEmit = (plat?.emits ?? []).find((e) => (TYPES_GOUTER.has(e.type) || TYPES_PAIN.has(e.type)) && (e.congelo ? ou !== "Frigo" : ou === "Frigo"));
      const band = parseFloat(routineEmit?.band ?? "");
      if (band > 0) portions = band;
    }
    etat.restes.push({ plat: p0.titre, types: (plat?.emits ?? []).map((e) => e.type), ou, portions, le: j, garde: parseInt(l.garde) || (m?.[1] === "Frigo" ? 3 : 90), quoi: l.nom, tout: l.tout.slice(0, 160), sachet, boites, repas, portions0: portions });
  }
  // T142 — le reste du midi : le lot que la sortie dit « déjeuner de demain »,
  // sinon le plus gros lot du frigo de ce soir. Au moins les parts mises de côté.
  if (midi > 0) {
    const ceSoir = etat.restes.filter((r) => r.le === j && r.plat === p0.titre && !r.jete);
    const r = ceSoir.find((x) => /demain/.test(x.tout ?? "")) ?? ceSoir.filter((x) => x.ou === "Frigo").sort((a, b) => b.portions - a.portions)[0];
    if (r) { r.midi = true; r.portions = Math.max(r.portions, midi); r.portions0 = r.portions; }
    else {
      etat.restes.push({ plat: p0.titre, types: [plat?.id ?? p0.titre], ou: "Frigo", portions: midi, le: j, garde: 2, quoi: "déjeuner de demain (hors sortie)", sachet: false, boites: Math.ceil(midi), midi: true, repas, portions0: midi });
      note(j, "midi", `« ${p0.titre} » agrandi pour demain midi, mais la sortie ne range aucun lot au frigo : ${lots.map((l) => l.tout).join(" ; ").slice(0, 200)}`);
    }
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

/**
 * Ce qu'une panne fait VRAIMENT perdre : les restes du lieu qui étaient encore
 * là — pas jetés, pas mangés (ni à la gamelle ni par un plat), pas passés.
 * Le premier passage comptait aussi les restes déjà mangés : un reste fini
 * à midi « mourait » une seconde fois dans la panne.
 */
function perdusDansLaPanne(d, j, lieu) {
  const l = norm(lieu).slice(0, 5);
  return etat.restes.filter((r) => !r.jete && !r.mangeLe && r.portions > 0
    && norm(r.ou).startsWith(l) && (d - new Date(r.le)) / 864e5 <= r.garde);
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
    for (const r of perdusDansLaPanne(d, j, lieu)) { r.jete = j; r.panne = true; etat.compte.perdusPanne = (etat.compte.perdusPanne ?? 0) + 1; }
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
          const t = await plusDe((x) => r.types.some((ty) => norm(x).includes(norm(ty))) && x.includes("Frigo"));
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

// Le fond de roulement (docs/cuisine/fond-de-roulement.md dans Workspace), posé
// au jour 0 avec ce que l'app sait suivre : les planchers du garde-manger.
const FOND = { "pates": 2, "lentilles seches": 1, "pois chiches": 1, "riz rond": 1, "semoule": 1, "pomme de terre": 1, "concentre tomate": 1, "thon boite": 2, "maquereaux boite": 1, "mais": 1, "oignon": 3, "ail": 1 };
async function poserFond(j) {
  if (cat.fond?.denrees?.length) return poserFondCatalogue(j);
  await aller("cuisine/stock"); await attendre(".co-barre"); await page.waitForTimeout(800);
  const ouvrir = page.getByRole("button", { name: "en ajouter un au placard" });
  if (!(await ouvrir.count())) { note(j, "fond", "pas de bouton pour poser un plancher au placard"); return; }
  await tap(ouvrir); await page.waitForTimeout(500);
  const poses = [], absents = [];
  for (const [nom, niveau] of Object.entries(FOND)) {
    const ligne = page.locator(".co-lot").filter({ has: page.locator(".nom", { hasText: new RegExp(`^${nom}$`, "i") }) }).filter({ has: page.getByRole("button", { name: "En garder 1" }) }).first();
    if (!(await ligne.count())) { absents.push(nom); continue; }
    await tap(ligne.getByRole("button", { name: "En garder 1" })); await page.waitForTimeout(300);
    for (let k = 1; k < niveau; k++) {
      const suivi = page.locator(".co-lot").filter({ has: page.locator(".nom", { hasText: new RegExp(`^${nom}$`, "i") }) }).filter({ hasText: /Ne plus suivre/ }).first();
      await tap(suivi.getByRole("button", { name: "+" })); await page.waitForTimeout(200);
    }
    poses.push(`${nom} ${niveau}`);
  }
  note(j, "fond", `fond de roulement posé au placard : ${poses.join(", ")}${absents.length ? ` — introuvables : ${absents.join(", ")}` : ""} ; hors de portée de l'app : lentilles corail, pois cassés, haricots blancs et rouges, gnocchis, avoine, surgelés, conserves de tomates, lait de coco, œufs, carottes, laitages (T114)`);
}

/**
 * T123/T124 : le fond entier (`catalogue/fond.yaml`, 30 denrées) se pose par
 * les posables du placard — « En garder 1 », puis « + » jusqu'au minimum du
 * catalogue. Le nom affiché est l'id sans tirets.
 */
async function poserFondCatalogue(j) {
  await aller("cuisine/stock"); await attendre(".co-barre"); await page.waitForTimeout(800);
  const ouvrir = page.getByRole("button", { name: "en ajouter un au placard" });
  if (!(await ouvrir.count())) { note(j, "fond", "pas de bouton pour poser un plancher au placard"); return; }
  await tap(ouvrir); await page.waitForTimeout(500);
  const ligneDe = (nom, bouton) => page.locator(".co-lot")
    .filter({ has: page.locator(".nom", { hasText: new RegExp(`^${nom}$`, "i") }) })
    .filter({ has: page.getByRole("button", { name: bouton, exact: true }) }).first();
  const poses = [], absents = [];
  for (const { ingredient, minimum } of cat.fond.denrees) {
    const nom = ingredient.replace(/-/g, " ");
    const ligne = ligneDe(nom, "En garder 1");
    if (!(await ligne.count())) { absents.push(nom); continue; }
    await tap(ligne.getByRole("button", { name: "En garder 1" })); await page.waitForTimeout(250);
    for (let k = 1; k < minimum; k++) {
      const suivi = ligneDe(nom, "Ne plus suivre");
      await suivi.waitFor({ timeout: 5000 }).catch(() => {});
      await tap(suivi.getByRole("button", { name: "+", exact: true })); await page.waitForTimeout(200);
    }
    poses.push(`${nom} ${minimum}`);
  }
  etat.fondPose = poses.length;
  note(j, "fond", `fond de roulement posé au placard (${poses.length}/${cat.fond.denrees.length}) : ${poses.join(", ")}${absents.length ? ` — introuvables : ${absents.join(", ")}` : ""}`);
}

// ───────────────────────────────────────────────────────────── 15 h, « Ce soir » (T127–T129)
const legumineux = (p) => !!(p && (p.apports?.proteine === "legumineuse" || p.apports?.feculent === "legumineuse"));
const SAISONS = cat.saisons?.mois ?? {};
const ALIAS = cat.rayons?.aliases ?? {};
/** Le plat et la saison, comme `saisonDuPlat` : un ingrédient à vraie saison (moins de 12 mois). */
function saisonDe(p, mois) {
  const ids = new Set([...(p?.ingredients ?? []).filter((i) => !i.base), ...(p?.avec ?? [])].map((i) => ALIAS[i.id] ?? i.id));
  let de = 0, hors = 0;
  for (const id of ids) { const m = SAISONS[id]; if (!m || new Set(m).size >= 12) continue; if (m.includes(mois)) de++; else hors++; }
  return hors ? "hors" : de ? "de-saison" : "neutre";
}
/** Mangé ces trois derniers jours — par la date, pas par le rang dans une liste. */
const mangeRecemment = (titre, j) => (etat.manges ?? []).some((m) => m.t === titre && (new Date(j) - new Date(m.j)) / 864e5 <= 3 && m.j !== j);
/** « Rien à acheter » / « il manque : a, b et 3 autres » → les noms et le compte. */
function lireAchats(t) {
  t = (t ?? "").trim();
  if (/^Rien à acheter/.test(t)) return { n: 0, noms: [] };
  const m = /il manque : (.*)$/.exec(t);
  if (!m) return { n: 0, noms: [], illisible: t };
  const autres = /^(.*) et (\d+) autres$/.exec(m[1]);
  if (autres) { const noms = autres[1].split(", "); return { n: noms.length + +autres[2], noms }; }
  const noms = m[1].split(/, | et /);
  return { n: noms.length, noms };
}
/** Les manques réels du jour, pour le diagnostic de fin de journée. */
const MANQUE_REEL = new Map();
/** Les règles du foyer, appliquées à une carte du soir. */
function juger(c, j, ev) {
  const p = platParTitre.get(c.titre);
  const pourquoi = [];
  const four = ev.some((e) => e.type === "four-en-panne" || e.type === "canicule");
  if (DESSERT.test(c.titre) || (p && p.role && p.role !== "plat")) pourquoi.push("pas un repas");
  if (mangeRecemment(c.titre, j)) pourquoi.push("mangé ces trois derniers jours");
  if (![3, 6].includes(new Date(j).getDay()) && c.achats.n > 1) pourquoi.push(`${c.achats.n} articles à acheter un jour sans courses`);
  if (/prêt vers/.test(c.heure)) pourquoi.push("pas prêt pour 18 h en lançant à 15 h");
  if (four && p && (p.vaisselle?.id ?? "").match(/plat|moule|four|cocotte/)) pourquoi.push("demande le four");
  // T134 — LE FOYER NE CUISINE PAS CE QU'IL N'A PAS. Un jour sans courses, au
  // moment de lancer, on ouvre le placard : un ingrédient que le grand livre
  // tient à zéro (et que la carte ne disait pas manquer, donc qu'on n'ira pas
  // chercher) se découvre — noté, et on prend la carte suivante. Un id jamais
  // acheté n'est pas au grand livre : on n'en sait rien, on ne l'invente pas.
  if (!pourquoi.length && p && ![3, 6].includes(new Date(j).getDay())) {
    // La carte dit les noms COURTS (« il manque : lentilles ») : un préfixe suffit.
    const dits = c.achats.noms.map(norm);
    const dit = (i) => dits.some((d) => norm(i.nom).startsWith(d) || norm(i.id).startsWith(d) || d.startsWith(norm(i.id)));
    const vides = p.ingredients.filter((i) => !i.base && !i.assaisonnement && !toujours.has(i.id) && !dit(i)
      && etat.reel[i.id] && etat.reel[i.id].q <= 0);
    if (vides.length) {
      const noms = [...new Set(vides.map((i) => i.id))];
      pourquoi.push(`manque réel : ${noms.join(", ")}`);
      note(j, "manque réel", `${c.titre} : ${noms.join(", ")} à zéro dans la cuisine, alors que la carte disait « ${c.achats.n ? c.achats.noms.join(", ") : "rien à acheter"} »`);
      etat.compte.manquesReels = (etat.compte.manquesReels ?? 0) + 1;
      MANQUE_REEL.set(j, [...new Set([...(MANQUE_REEL.get(j) ?? []), ...noms])]);
    }
  }
  return pourquoi;
}
async function lireCartesDuSoir() {
  return page.evaluate(() => [...document.querySelectorAll(".co-soir:not(.pose)")].map((e) => ({
    titre: e.querySelector(".tete .nom")?.textContent?.trim() ?? "",
    duree: e.querySelector(".tete .meta")?.textContent?.trim() ?? "",
    achatsTxt: e.querySelector(".achats")?.textContent?.trim() ?? "",
    heure: [...e.querySelectorAll(".heure")].map((x) => x.textContent.trim()).join(" | "),
    raison: e.querySelector(".co-action")?.textContent?.trim() ?? "",
    midi: e.querySelector(".midi")?.textContent?.trim() ?? "",
  })));
}
/**
 * La pause de 15 h : le cockpit d'abord (sa ligne nomme le meilleur plat et
 * porte « Je lance ça »), puis « Ce soir » si la tête ne va pas, puis « Voir
 * plus ». Renvoie la carte prise, ou null (repli).
 */
async function pauseDe15h(j, ev, stats, essai = 0) {
  const pris = await pauseDe15hUneFois(j, ev, stats);
  // LA FENÊTRE QUI NE ROULE PAS : l'app restée ouverte sans écriture garde le
  // `jeu` de la veille, et « Je lance ça » ouvre le dîner d'hier (« Ce créneau
  // n'est plus là »). Vu le 2026-11-15, après trois jours sans geste. Le foyer
  // revient à la cuisine et relance : on recharge et on rejoue la pause.
  if (pris && essai === 0 && /n’est plus là|n'est plus là/.test(await texte())) {
    const quoi = (await texte()).split("\n").slice(0, 3).join(" / ").slice(0, 200);
    note(j, "fenetre", `« Je lance ça » (${pris.par} #${pris.pos}) a ouvert un créneau périmé : ${quoi}`);
    stats.creneauPerime = (stats.creneauPerime ?? 0) + 1;
    etat.compte.creneauxPerimes = (etat.compte.creneauxPerimes ?? 0) + 1;
    await page.reload(); await attendre(".co-barre", 30_000);
    delete stats.refus;
    return pauseDe15h(j, ev, stats, 1);
  }
  return pris;
}
async function pauseDe15hUneFois(j, ev, stats) {
  const refus = [];
  await aller("cockpit"); await attendre(".co-barre", 20_000); await page.waitForTimeout(400);
  const tache = page.locator(".co-tache").filter({ has: page.locator(".t", { hasText: /^Ce soir :/ }) }).first();
  if (await tache.count()) {
    const titre = (await tache.locator(".t").innerText()).replace(/^Ce soir :\s*/, "").trim();
    const detail = (await tache.locator(".d").innerText()).trim();
    stats.cockpitSoir = `${titre} — ${detail}`.slice(0, 250);
    if (/^posé/.test(detail)) {
      // Un plat déjà posé (souvent par un « Je lance ça » tombé sur un créneau
      // périmé) : la ligne n'a plus de bouton. Le foyer le cuisine depuis Posés.
      note(j, "pose-ancien", `le cockpit montre « ${titre} — ${detail} » sans « Je lance ça »`);
      return { titre, achats: { n: 0, noms: [] }, heure: detail, raison: "déjà posé", pos: 0, par: "posé", refus };
    }
    const segs = detail.split(" · ");
    const c = { titre, achats: lireAchats(segs[0]), heure: detail, raison: detail };
    const pourquoi = juger(c, j, ev);
    if (!pourquoi.length) {
      const b = tache.getByRole("button", { name: "Je lance ça" });
      for (let k = 0; k < 30 && (await b.isDisabled().catch(() => true)); k++) await page.waitForTimeout(100);
      const url = page.url();
      await tap(b);
      await page.waitForURL((u) => u.toString() !== url && /cuisiner/.test(u.toString()), { timeout: 10_000 }).catch(() => note(j, "lancer", "« Je lance ça » du cockpit n'a pas ouvert la fiche"));
      return { ...c, pos: 1, par: "cockpit", refus };
    }
    refus.push({ pos: 1, titre, par: "cockpit", pourquoi });
  } else stats.cockpitSoir = "pas de ligne « Ce soir : … » au cockpit";
  // « Ce soir », l'écran — deux taps depuis le cockpit.
  if (await tache.count()) await tap(tache.locator("a").first()); else await aller("cuisine/ce-soir");
  await page.locator("section[aria-label='ce soir'], .co-note").first().waitFor({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
  if (!/ce-soir/.test(page.url())) { stats.ceSoirUrl = page.url().split("#")[1]; await aller("cuisine/ce-soir"); await page.waitForTimeout(500); }
  let cartes = await lireCartesDuSoir();
  stats.nCartes = cartes.length;
  let plusOuvert = false;
  for (let tour = 0; tour < 2; tour++) {
    for (let k = 0; k < cartes.length; k++) {
      const l = cartes[k];
      if (refus.some((r) => r.titre === l.titre)) continue;
      const c = { ...l, achats: lireAchats(l.achatsTxt) };
      const pourquoi = juger(c, j, ev);
      if (pourquoi.length) { refus.push({ pos: k + 1, titre: l.titre, par: plusOuvert && k >= stats.nCartes ? "voir-plus" : "ce-soir", pourquoi }); continue; }
      const url = page.url();
      await tap(page.locator(".co-soir:not(.pose)").nth(k).getByRole("button", { name: "Je lance ça" }));
      await page.waitForURL((u) => u.toString() !== url && /cuisiner/.test(u.toString()), { timeout: 10_000 }).catch(() => note(j, "lancer", "« Je lance ça » de « Ce soir » n'a pas ouvert la fiche"));
      return { ...c, pos: k + 1, par: k >= stats.nCartes ? "voir-plus" : "ce-soir", refus };
    }
    const plus = page.getByRole("button", { name: "Voir plus" });
    if (plusOuvert || !(await plus.count())) break;
    await tap(plus); plusOuvert = true; await page.waitForTimeout(300);
    cartes = await lireCartesDuSoir();
    stats.voirPlus = cartes.length - stats.nCartes;
  }
  stats.refus = refus;
  return null;
}

// ───────────────────────────────────────────────────────────── les trois autres repas (T142)
// Le foyer mange quatre fois par jour à la maison, et le grand livre le sait :
// le petit-déjeuner et le goûter des deux enfants (que l'app rejoue toute
// seule, comme routines), le midi des quatre (≈ 3 parts adultes), le dîner.
// Ce que l'app ne voit pas — le sandwich, le fruit qui manque — se compte ici.
const PARTS_MIDI = cat.foyer.mangeurs.reduce((n, m) => (m.parts > 0 ? n + Math.max(m.parts, 0.5) : n), 0);
const BOITES = cat.foyer.contenants.filter((c) => c.portions > 0 && !c.consommable && c.espaces.includes("frigo")).reduce((n, c) => n + c.nombre, 0);
const POIDS_PIECE = { pommes: 150, poires: 150, banane: 120 };
const ALIAS_LIVRE = cat.rayons?.aliases ?? {};
const routine = (r) => cat.plats.find((p) => p.id === cat.creneaux.routines?.[r]?.recette);
const TYPES_GOUTER = new Set(cat.creneaux.routines?.gouter?.du_depot?.types ?? []);
const TYPES_PAIN = new Set(cat.creneaux.routines?.["petit-dejeuner"]?.du_depot?.types ?? []);
/** Une quantité de recette, dans l'unité du grand livre pour cet id. */
function enUniteDuLivre(id, q, unit) {
  id = ALIAS_LIVRE[id] ?? id;
  if (/^kg$/i.test(unit ?? "")) { q *= 1000; unit = "g"; }
  const lu = UNITE_RECETTE.get(id) ?? unit;
  if (lu === unit) return q;
  const p = POIDS_PIECE[id] ?? 150;
  if (/pi[èe]ce/.test(unit) && lu === "g") return q * p;
  if (unit === "g" && /pi[èe]ce/.test(lu)) return q / p;
  if (unit === "cl" && lu === "ml") return q * 10;
  return q;
}
/** Prendre au grand livre ; rend false si la cuisine n'en a pas assez. */
function prendre(repas, id, q, unit) {
  const besoin = enUniteDuLivre(id, q, unit);
  const r = etat.reel[id];
  const dispo = r?.q ?? 0;
  const pris = Math.min(dispo, besoin);
  if (r) r.q -= pris;
  compter(repas, id, pris);
  return dispo >= besoin * 0.999;
}
const aAssez = (id, q, unit) => (etat.reel[id]?.q ?? 0) >= enUniteDuLivre(id, q, unit) * 0.999;
/** Les boîtes qu'un lot de sortie occupe : ce qu'elle dit, sinon une par part au frigo. */
// « 1 × boîtes IKEA 0,8 L » occupe une boîte ; « il manque 1 × boîtes… :
// sacs congélation ? » n'en occupe aucune (le lot part en sac).
function boitesDuLot(tout, ou) {
  const t = (tout ?? "").replace(/il manque \d+\s*×\s*bo[iî]tes[^|]*/gi, "");
  const n = /(\d+)\s*×\s*bo[iî]tes?/i.exec(t);
  if (n) return +n[1];
  if (/\bsacs?\b/i.test(t)) return 0;
  // « il manque 2 × boîtes… : sacs congélation ? » sans boîte attribuée : le
  // lot part en sac — il n'en occupe aucune (run 10 : « -1 libres »).
  if (/il manque \d+\s*×\s*bo[iî]tes/i.test(tout ?? "")) return 0;
  return ou === "Frigo" ? 1 : 0;
}
const vivants = () => etat.restes.filter((r) => !r.jete && r.portions > 0);
// Un reste entamé libère ses boîtes au prorata : deux parts mangées sur quatre
// rangées en deux boîtes, c'est une boîte lavée (le monde réel, run 9 : « -1 libres »).
const boitesOccupees = () => vivants().reduce((n, r) => n + (r.boites ? Math.ceil(r.boites * Math.min(1, r.portions / (r.portions0 || r.portions)) - 1e-9) : 0), 0);
const estUnRepas = (r) => { const p = platParTitre.get(r.plat); return !DESSERT.test(r.plat) && !(r.types ?? []).some((t) => TYPES_GOUTER.has(t) || TYPES_PAIN.has(t)) && (!p || (p.role ?? "plat") === "plat"); };
function manqueRepas(j, type, quoi, stats) {
  etat.compte[type === "petit-dej" ? "manquesPetitDej" : "manquesGouter"] = (etat.compte[type === "petit-dej" ? "manquesPetitDej" : "manquesGouter"] ?? 0) + 1;
  stats[type === "petit-dej" ? "manquePetitDej" : "manqueGouter"] = quoi;
  note(j, type, `manque réel : ${quoi.join(", ")}`);
}
/** Les lignes calmes du cockpit (`.co-repas`) : texte et lien, par clé. */
async function lireRepas() {
  await page.locator(".co-repas").first().waitFor({ timeout: 5000 }).catch(() => {});
  return page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".co-repas [data-repas]")].map((e) => [e.dataset.repas, { texte: e.textContent.trim(), lien: !!e.querySelector("a") }])));
}
/** Le grand livre a-t-il tout ce que le plat demande (hors bases et placard) ? */
const ceQuiManque = (p) => {
  const m = [...new Set(p.ingredients.filter((i) => !i.base && !i.assaisonnement && !toujours.has(i.id) && !((etat.reel[i.id]?.q ?? 0) > 0)).map((i) => i.id))];
  // La compote se fait de pommes OU de poires (T144) : un des deux suffit.
  const compote = ["pommes", "poires"];
  if (compote.every((f) => p.ingredients.some((i) => i.id === f)) && compote.some((f) => (etat.reel[f]?.q ?? 0) > 0)) return m.filter((x) => !compote.includes(x));
  return m;
};

/** Le petit-déjeuner des enfants : la recette du foyer, plus une tranche de pain maison. */
function petitDejeuner(j, stats) {
  const p = routine("petit-dejeuner");
  if (!p) return;
  const manque = [];
  for (const i of p.ingredients) {
    if (i.base || toujours.has(i.id)) continue;
    if (i.id === "banane") {
      // Le fruit du porridge : une banane, sinon une pomme.
      if (!prendre("petitDej", "banane", 1, "pièce") && !prendre("petitDej", "pommes", 1, "pièce")) manque.push("fruit");
      continue;
    }
    if (!prendre("petitDej", i.id, i.qty ?? 0, i.unit)) manque.push(i.id);
  }
  const pain = vivants().filter((r) => r.types?.some((t) => TYPES_PAIN.has(t))).sort((a, b) => a.le.localeCompare(b.le))[0];
  if (pain) { pain.portions -= 1; if (pain.portions <= 0) pain.mangeLe = j; stats.pain = true; }
  else { etat.compte.matinsSansPain = (etat.compte.matinsSansPain ?? 0) + 1; stats.pain = false; }
  if (manque.length) manqueRepas(j, "petit-dej", manque, stats);
}

/** Le goûter des enfants : une part de la fournée (congélo d'abord), yaourt, fruit, lait. */
function gouter(j, stats) {
  const p = routine("gouter");
  const manque = [];
  const lot = vivants().filter((r) => r.types?.some((t) => TYPES_GOUTER.has(t))).sort((a, b) => (a.ou === "Frigo" ? -1 : 1) - (b.ou === "Frigo" ? -1 : 1) || a.le.localeCompare(b.le))[0];
  if (lot) { lot.portions -= 1; if (lot.portions <= 0) lot.mangeLe = j; stats.gouter = lot.plat; etat.compte.goutersFournee = (etat.compte.goutersFournee ?? 0) + 1; }
  else { stats.gouter = "fruit et yaourt"; manque.push("rien de la fournée"); }
  for (const i of p?.ingredients ?? []) {
    if (i.base || toujours.has(i.id)) continue;
    if (!prendre("gouter", i.id, i.qty ?? 0, i.unit)) manque.push(i.id);
  }
  if (manque.length) manqueRepas(j, "gouter", manque, stats);
}

/**
 * Le midi des quatre : le reste du dîner mis de côté hier, sinon un reste du
 * frigo, sinon la ligne « Midi : … (Chioca) » du cockpit quand la cuisine a
 * tout, cuisinée par son lien ; sinon sandwich, hors app.
 */
async function dejeuner(j, ev, stats) {
  await page.clock.setFixedTime(new Date(`${j}T11:30:00`));
  await aller("cockpit"); await attendre(".co-barre", 20_000);
  const lignes = await lireRepas();
  stats.cockpitMidi = lignes.dejeuner?.texte ?? null;
  const source = (s) => { stats.midiSource = s; etat.compte.midi ??= {}; etat.compte.midi[s] = (etat.compte.midi[s] ?? 0) + 1; };
  const prevu = vivants().filter((r) => r.midi && r.ou === "Frigo").sort((a, b) => a.le.localeCompare(b.le))[0];
  if (prevu) {
    const pris = Math.min(prevu.portions, PARTS_MIDI);
    prevu.portions -= pris; if (prevu.portions <= 0) prevu.mangeLe = j;
    // Son midi est passé : ce qui reste est un reste ordinaire, plus « le midi prévu ».
    prevu.midi = false;
    etat.compte.restesManges++; stats.midi = `reste prévu : ${prevu.plat} (${pris} parts)`;
    if (!/reste/.test(lignes.dejeuner?.texte ?? "")) note(j, "midi", `le reste prévu (« ${prevu.plat} ») est au frigo, mais le cockpit dit « ${lignes.dejeuner?.texte ?? "rien"} »`);
    return source("reste-prevu");
  }
  const r = vivants().filter((x) => x.ou === "Frigo" && estUnRepas(x)).sort((a, b) => a.le.localeCompare(b.le))[0];
  if (r) {
    const pris = Math.min(r.portions, PARTS_MIDI);
    r.portions -= pris; etat.compte.restesManges++; stats.midi = `reste : ${r.plat} (${pris} parts)`;
    if (r.portions <= 0) { r.mangeLe = j; const t = await plusDe((x) => r.types.some((ty) => norm(x).includes(norm(ty))) && x.includes("Frigo")); stats.resteRetire = !!t; }
    return source("reste");
  }
  const l = lignes.dejeuner;
  const m = l?.lien ? /^Midi : (.*?)(?: \(Chioca\))?(?: — (.*))?$/.exec(l.texte) : null;
  const p = m && platParTitre.get(m[1].trim());
  if (p) {
    const manque = /rien à acheter/.test(m[2] ?? "") || !/Chioca/.test(l.texte) ? ceQuiManque(p) : ["(la ligne dit : " + m[2] + ")"];
    if (!manque.length) {
      const url = page.url();
      await tap(page.locator(".co-repas [data-repas='dejeuner'] a"));
      await page.waitForURL((u) => u.toString() !== url, { timeout: 10_000 }).catch(() => {});
      const t = await cuisiner(j, ev, stats, { parts: PARTS_MIDI, deja: p.titre, repas: "midi" }).catch(async (e) => { note(j, "midi", `cuisiner « ${p.titre} » depuis la ligne du midi : ${String(e).slice(0, 90)}${await diag()}`); return null; });
      if (t) { stats.midi = `Chioca : ${t}`; return source("chioca"); }
    } else { stats.midiRefus = `${p.titre} — manque réel : ${manque.join(", ")}`; etat.compte.chiocaSansStock = (etat.compte.chiocaSansStock ?? 0) + 1; }
  } else if (m) note(j, "midi", `la ligne du midi nomme « ${m[1]} », introuvable au catalogue`);
  stats.midi = "sandwich, hors app";
  return source("sandwich");
}

/**
 * T146 — LE RELEVÉ DU CATALOGUE EST UN FAIT DU MONDE. L'app part de lui (son
 * amorce), et celui du 21/10 regagne ses zones à sa date (T143) : 1 kg de
 * spaghetti et deux demi-paquets, du riz, des pommes de terre que le monde du
 * harnais n'avait jamais eus — « pâtes à zéro » quand la carte disait « rien à
 * acheter » (run 9). Le premier jour, le monde prend tout le relevé ; à la date
 * d'une zone, ce qu'elle porte redevient la vérité. Le demi-paquet sans poids
 * vaut un demi-paquet du fond, comme dans l'app.
 */
function adopterLeReleve(j, premier) {
  const g = cat.gardeManger;
  if (!g?.denrees) return;
  const zones = new Set((g.zones ?? []).filter((z) => premier || (z.releve ?? g.releve) === j).map((z) => z.id));
  if (!zones.size) return;
  const q = {};
  for (const d of g.denrees) {
    if (!zones.has(d.zone)) continue;
    const id = d.ingredient;
    const paquet = d.parUnite ? enUniteDuLivre(id, d.parUnite.amount, d.parUnite.unit) : (parUniteDuFond(id) ?? (QTE_RECETTE.get(ALIAS_LIVRE[id] ?? id) || 1) * 2);
    const n = d.etat === "entame" && !d.parUnite ? Math.max(0.5, d.unites - 0.5) : d.unites;
    q[id] = (q[id] ?? 0) + n * paquet;
  }
  for (const [id, v] of Object.entries(q)) etat.reel[id] = { q: v, achete: v, le: j, frais: FRAIS.test(rayonDe.get(id) ?? "") };
  if (!premier) note(j, "releve", `le relevé du catalogue regagne ${zones.size} zones : ${Object.keys(q).length} denrées remises à ce qu'il dit`);
}

/** La fournée de 15 h, quand le cockpit la propose et que la cuisine a tout. */
async function fourneeDe15h(j, ev, stats) {
  await aller("cockpit"); await attendre(".co-barre", 20_000);
  const l = (await lireRepas()).fournee;
  if (!l) return null;
  stats.fourneeProposee = l.texte.slice(0, 160);
  etat.compte.fourneesProposees = (etat.compte.fourneesProposees ?? 0) + 1;
  const m = /^Fournée : (.*?) — (.*?)(?: · il manque : (.*))?$/.exec(l.texte);
  const p = m && platParTitre.get(m[1].trim());
  if (!p || !l.lien) { note(j, "fournee", `ligne illisible ou sans lien : ${l.texte}`); return null; }
  // Un jour de courses, ce que la ligne dit manquer est passé par la liste du
  // matin ; un autre jour, on ne lance pas une fournée pour aller au magasin.
  let manque = ceQuiManque(p);
  // Un jour de courses, le foyer lit la ligne et prend au magasin ce qu'elle
  // dit manquer (et ce que le placard réel n'a pas) — HORS de la liste : la
  // liste de l'app ne porte pas la fournée.
  if (manque.length && [3, 6].includes(new Date(j).getDay())) {
    for (const id of manque) {
      const i = p.ingredients.find((x) => x.id === id);
      const r = etat.reel[id] ?? { q: 0, achete: 0 };
      const q = Math.max(parUniteDuFond(id) ?? 0, (i?.qty ?? 1) * 2);
      r.q += q; r.achete = q; r.le = j; r.frais = FRAIS.test(rayonDe.get(id) ?? ""); etat.reel[id] = r;
    }
    stats.achatsHorsApp = [...(stats.achatsHorsApp ?? []), ...manque];
    stats.fourneeAchats = manque;
    etat.compte.fourneeAchatsHorsApp = (etat.compte.fourneeAchatsHorsApp ?? 0) + manque.length;
    manque = ceQuiManque(p);
  }
  if (manque.length) {
    stats.fourneeRefus = `manque réel : ${manque.join(", ")}${m[3] ? ` (la ligne disait : ${m[3]})` : ""}`;
    etat.compte.fourneesSansStock = (etat.compte.fourneesSansStock ?? 0) + 1;
    return null;
  }
  const url = page.url();
  await tap(page.locator(".co-repas [data-repas='fournee'] a"));
  await page.waitForURL((u) => u.toString() !== url, { timeout: 10_000 }).catch(() => {});
  const t = await cuisiner(j, ev, stats, { parts: p.portions || 4, deja: p.titre, repas: "gouter", fournee: true });
  if (t) { etat.compte.fournees = (etat.compte.fournees ?? 0) + 1; stats.fournee = t; }
  return t;
}

/**
 * Le frais de la semaine (`fond.yaml`, `hebdo: true`), le samedi : la liste de
 * l'app d'abord (elle est passée le matin) ; ce qu'il manque encore pour sept
 * jours de routines s'achète quand même — hors app, et compté.
 */
function fraisDeLaSemaine(j, stats) {
  const besoin = {};
  for (const r of ["petit-dejeuner", "gouter"]) for (const i of routine(r)?.ingredients ?? []) {
    if (i.base || toujours.has(i.id)) continue;
    besoin[i.id] = (besoin[i.id] ?? 0) + enUniteDuLivre(i.id, i.qty ?? 0, i.unit) * 7;
  }
  const hors = [];
  for (const d of cat.fond?.denrees ?? []) {
    if (!d.hebdo) continue;
    const id = d.ingredient, w = besoin[id] ?? 0, u = parUniteDuFond(id) || 1;
    const r = etat.reel[id] ?? { q: 0, achete: 0 };
    if (r.q >= w) continue;
    const n = Math.ceil((w - r.q) / u);
    r.q += n * u; r.achete = n * u; r.le = j; r.frais = true; etat.reel[id] = r;
    hors.push(`${id} ×${n}`);
  }
  stats.hebdo = hors.length ? `hors liste : ${hors.join(", ")}` : "la liste suffisait";
  if (hors.length) { etat.compte.hebdoHorsListe = (etat.compte.hebdoHorsListe ?? 0) + hors.length; stats.achatsHorsApp = [...(stats.achatsHorsApp ?? []), ...hors]; }
}

/** La consommation de l'année par repas, pour dériver le stock à tenir. */
function ecrireConso() {
  const c = etat.conso ?? {};
  const ids = new Set(Object.values(c).flatMap((x) => Object.keys(x)));
  const par = {};
  for (const id of [...ids].sort()) {
    const l = { unite: UNITE_RECETTE.get(id) ?? "?" };
    let tot = 0;
    for (const [rep, x] of Object.entries(c)) { const v = Math.round((x[id] ?? 0) * 10) / 10; if (v) { l[rep] = v; tot += v; } }
    l.total = Math.round(tot * 10) / 10;
    par[id] = l;
  }
  writeFileSync(`${OUT}/conso.json`, JSON.stringify({ jours: etat.jour, ingredients: par }, null, 1));
}

// ───────────────────────────────────────────────────────────── une journée, comme chez moi
async function journee2(idx) {
  const d = new Date(DEBUT); d.setDate(d.getDate() + idx);
  const j = iso(d);
  jourCourant = j;
  const dow = d.getDay();
  const ev = evenements(j);
  const stats = { j, dow, ev: ev.map((e) => e.quoi), persona: "moi" };
  taps = 0; erreurs.length = 0;
  const t0 = Date.now();
  await ouvrirJour(j);
  const cockpit = await texte();
  stats.cockpit = (/aujourd'hui\.\n\n([\s\S]*?)\nVOS FACETTES/.exec(cockpit)?.[1] ?? "").replace(/\n/g, " / ").slice(0, 250);
  const absent = ev.some((e) => e.type === "absent");

  pourrirLeFrais(j);
  for (const r of etat.restes) {
    const age = (d - new Date(r.le)) / 864e5;
    if (!r.jete && r.portions > 0 && age > r.garde) { r.jete = j; etat.compte.jetes++; stats.restesPerimes = (stats.restesPerimes ?? 0) + 1; }
  }
  // T103 : ce qui a passé sa date se jette depuis le cockpit, d'un seul geste.
  const jete = page.getByRole("button", { name: /C.est jeté/ });
  if (!absent && (await jete.count())) { stats.cestJete = (/(\d+|Un) restes? ont? passé/.exec(cockpit)?.[1] ?? "?"); await tap(jete); await page.waitForTimeout(500); }

  for (const e of ev.filter((e) => e.type === "panne-congelo" || e.type === "panne-frigo")) {
    const lieu = e.type === "panne-congelo" ? "congélo" : "frigo";
    await aller("cuisine/stock"); await attendre(".co-barre");
    await page.waitForTimeout(500);
    const filtre = page.locator("button", { hasText: lieu === "frigo" ? /^Frigo/ : /^Congélo/ }).first();
    await tap(filtre); await page.waitForTimeout(400);
    const perdu = page.getByRole("button", { name: new RegExp(`Tout ce qui était au ${lieu} est perdu`) });
    if (await perdu.count()) {
      await tap(perdu); await page.waitForTimeout(300);
      const oui = page.getByRole("button", { name: /Oui|Confirmer|perdu/ }).last();
      await tap(oui); await page.waitForTimeout(600);
      note(j, "panne", `${e.quoi} : « Tout ce qui était au ${lieu} est perdu » (T105), un geste et une confirmation`);
    } else note(j, "panne", `${e.quoi} : le geste T105 est introuvable`);
    const perdus = perdusDansLaPanne(d, j, lieu);
    for (const r of perdus) { r.jete = j; r.panne = true; etat.compte.perdusPanne = (etat.compte.perdusPanne ?? 0) + 1; }
    stats.pertesPanne = perdus.map((r) => `${r.plat} | ${r.ou} | ${r.portions} parts | depuis ${r.le}`);
  }
  if (ev.some((e) => e.type === "don")) {
    note(j, "don", "courgettes et tomates offertes : toujours aucune porte d'entrée hors liste (T114)");
    for (const id of ["courgette", "tomate"]) etat.reel[id] = { q: (etat.reel[id]?.q ?? 0) + 1500, achete: 1500, le: j, frais: true };
  }

  if (idx === 0) await poserFond(j);
  adopterLeReleve(j, idx === 0);
  // Les jours de courses, les courses du matin, avant toute décision. LE FOND NE SE
  // RECHARGE QUE PAR LA LISTE DE L'APP (T134) : aucun réassort côté harnais.
  if (!absent && [3, 6].includes(dow)) { await page.clock.setFixedTime(new Date(`${j}T10:00:00`)); await courses(j, ev, stats); stats.coursesDuMatin = stats.articles; }
  // T142 — le frais de la semaine, le samedi, en plus du rythme des courses.
  if (!absent && dow === 6) fraisDeLaSemaine(j, stats);

  if (absent) { stats.absent = true; }
  else {
    // T142 — le petit-déjeuner des enfants, avant tout le reste.
    petitDejeuner(j, stats);
    // Le midi des quatre (T142) : le reste prévu, un reste, Chioca, ou sandwich.
    await dejeuner(j, ev, stats);

    // 15 h : la pause. La fournée d'abord si l'app la propose, puis le dîner.
    await page.clock.setFixedTime(new Date(`${j}T15:00:00`));
    await fourneeDe15h(j, ev, stats).catch(async (e) => note(j, "fournee", `crash : ${String(e).slice(0, 90)}${await diag()}`));
    const dehors = ev.some((e) => e.type === "dehors"), malade = ev.some((e) => e.type === "malade");
    if (dehors) stats.diner = "dehors";
    else if (malade) stats.diner = "pâtes (malade)";
    else if (!PASSE) {
      // T127–T129 : la pause de 15 h passe par le cockpit et « Ce soir ».
      const pris = await pauseDe15h(j, ev, stats);
      if (stats.refus === undefined && pris) stats.refus = pris.refus;
      if (!pris) {
        stats.diner = "repli : pâtes ou gnocchis";
        etat.compte.replis = (etat.compte.replis ?? 0) + 1;
      } else {
        const p = platParTitre.get(pris.titre);
        const courseDay = [3, 6].includes(dow);
        Object.assign(stats, { carte: { pos: pris.pos, par: pris.par, achats: pris.achats.n, manque: pris.achats.noms, raison: pris.raison.slice(0, 160), heure: pris.heure.slice(0, 120) } });
        stats.legume = legumineux(p);
        stats.format = p?.format ?? null;
        stats.saison = saisonDe(p, d.getMonth() + 1);
        stats.lotAttendu = /finit|mange/.test(pris.raison) ? (/congélo/.test(pris.raison) ? "congélo" : /frigo|reste/.test(pris.raison) ? "frigo" : /placard|se perd/.test(pris.raison) ? "placard" : "autre") : null;
        const invites = ev.filter((e) => (e.type === "invites" && e.repas === "diner") || e.type === "deux");
        let detour = false;
        if (pris.achats.n > 0 && courseDay) {
          // Jour de courses : ce que le plat demande passe par la liste, comme avant.
          await courses(j, ev, stats); stats.courses15h = stats.articles; detour = true;
        } else if (pris.achats.n > 0) {
          // Un jour sans courses : l'article manquant s'achète au coin de la rue,
          // HORS de l'app — elle ne le saura pas.
          for (const nom of pris.achats.noms) {
            const i = (p?.ingredients ?? []).find((x) => norm(x.nom) === norm(nom) || norm(x.id) === norm(nom)) ;
            const id = i?.id ?? idParNom.get(norm(nom)) ?? norm(nom);
            const r = etat.reel[id] ?? { q: 0, achete: 0 };
            const q = Math.max(1, (i?.qty ?? 1) * 1.5);
            r.q += q; r.achete = q; r.le = j; r.frais = FRAIS.test(rayonDe.get(id) ?? ""); etat.reel[id] = r;
          }
          stats.achatsHorsApp = pris.achats.noms;
        }
        for (const e of invites) { await reglerParts(j, e.parts, stats); detour = true; }
        const invite = ev.find((e) => (e.type === "invites") || e.type === "deux");
        // T142 — la carte dit si demain midi se prend ce soir, et dans combien de boîtes.
        const phrase = `${pris.midi ?? ""} ${pris.heure ?? ""} ${pris.raison ?? ""}`;
        let midi = 0;
        if (/déjeuner de demain/.test(phrase)) {
          midi = PARTS_MIDI;
          const voulu = +(/déjeuner de demain, (\d+)/.exec(phrase)?.[1] ?? Math.ceil(midi));
          const libres = BOITES - boitesOccupees();
          stats.midiPrevu = `oui, ${voulu} boîtes (${libres} libres au réel)`;
          if (libres < voulu) { note(j, "boites", `la carte prend demain midi en ${voulu} boîtes, la cuisine n'en a que ${libres} de libres`); etat.compte.boitesReellesPleines = (etat.compte.boitesReellesPleines ?? 0) + 1; }
        } else if (/Boîtes pleines/.test(phrase)) {
          stats.midiPrevu = "boîtes pleines";
          etat.compte.midiBoitesPleines = (etat.compte.midiBoitesPleines ?? 0) + 1;
          note(j, "boites", `pas de midi demain : « ${/Boîtes pleines.*?seulement/.exec(phrase)[0]} » (${BOITES - boitesOccupees()} libres au réel)`);
        } else stats.midiPrevu = "non";
        const t = await cuisiner(j, ev, stats, { autrement: ev.some((e) => e.type === "rate") || hasard() < 0.05, parts: invite?.parts ?? 2.5, deja: detour || pris.par === "posé" ? null : pris.titre, midi, voulu: pris.titre });
        stats.diner = t ?? "rien";
        if (t) { etat.recents = [...etat.recents.slice(-10), t]; etat.manges = [...(etat.manges ?? []).slice(-20), { t, j }]; }
      }
    }
    else {
      let poses = await lirePoses();
      if (!poses.length) { await passe(j, 1, ev, stats); poses = await lirePoses(); }
      if (!poses.length) {
        stats.diner = "repli : pâtes ou gnocchis";
        etat.compte.replis = (etat.compte.replis ?? 0) + 1;
      } else {
        if ([3, 6].includes(dow) || true) await courses(j, ev, stats);
        for (const e of ev.filter((e) => (e.type === "invites" && e.repas === "diner") || e.type === "deux")) await reglerParts(j, e.parts, stats);
        const invite = ev.find((e) => (e.type === "invites") || e.type === "deux");
        const t = await cuisiner(j, ev, stats, { autrement: ev.some((e) => e.type === "rate") || hasard() < 0.05, parts: invite?.parts ?? 2.5 });
        stats.diner = t ?? "rien";
        const p = t && platParTitre.get(t);
        stats.legume = !!(p && (p.apports?.proteine === "legumineuse" || p.apports?.feculent === "legumineuse"));
        if (t) etat.recents = [...etat.recents.slice(-10), t];
      }
    }
  }

  // T142 — le goûter des enfants, à 16 h 30 (la fournée de 15 h y est déjà).
  if (!absent) gouter(j, stats);

  if (dow === 0 || idx === N - 1) {
    const lots = await lireStock();
    stats.inventaire = {
      app: lots.map((l) => `${l.nom} | ${l.ou} | ${l.q} | ${l.src}`),
      reel: etat.restes.filter((x) => !x.jete && x.portions > 0).map((r) => `${r.plat} | ${r.ou} | ${r.portions} parts | depuis ${r.le}`),
    };
    const st = await texte();
    stats.stockEcran = {
      planchers: (/Le stock d’urgence\n([^\n]*)\n([^\n]*)/.exec(st) ?? []).slice(1).join(" / "),
      plafonds: (/LA CUISINE EST UN LIEU FINI\n([\s\S]*?)Deux plafonds/.exec(st)?.[1] ?? "").replace(/\n/g, " "),
    };
  }
  if (idx % 30 === 0 || ev.length) { await aller("cuisine/stock"); await page.waitForTimeout(800); await capture(`${j}-stock`); await aller("cockpit"); await page.waitForTimeout(600); await capture(`${j}-cockpit`); }
  // Un manque réel : ce que l'écran Stock de l'app croit en avoir, pour
  // dire d'où vient l'écart (quantité, unité, relevé).
  stats.manqueReel = MANQUE_REEL.get(j);
  if (stats.manqueReel?.length) {
    await aller("cuisine/stock"); await page.waitForTimeout(800);
    const lignes = (await texte()).split("\n");
    stats.manqueReelApp = stats.manqueReel.map((id) => {
      const mot = norm(id).split(" ")[0].slice(0, 5);
      return `${id} (réel ${Math.round((etat.reel[id]?.q ?? 0) * 10) / 10}) : ${lignes.filter((l) => norm(l).includes(mot)).slice(0, 3).join(" / ").slice(0, 160) || "absent de l'écran"}`;
    });
    await aller("cockpit");
  }
  stats.taps = taps; stats.secondes = Math.round((Date.now() - t0) / 1000);
  if (erreurs.length) stats.erreurs = [...new Set(erreurs)].slice(0, 5);
  appendFileSync(JOURNAL, JSON.stringify(stats) + "\n");
  console.log(`${j} ${["dim", "lun", "mar", "mer", "jeu", "ven", "sam"][dow]} taps=${taps} ${stats.secondes}s midi=${stats.midiSource ?? "-"}${stats.fournee ? ` fournée=${stats.fournee}` : ""} dîner=${stats.diner ?? "-"}${stats.carte ? ` [${stats.carte.par} #${stats.carte.pos}, ${stats.carte.achats} art.]` : ""}${stats.legume ? " (légumineuses)" : ""} q=${stats.questions ?? 0} art=${stats.articles ?? 0} refus=${(stats.refus ?? []).length} ${ev.map((e) => e.type).join(",")}`);
}


try {
  for (; etat.jour < N; etat.jour++) {
    try { await (MOI ? journee2 : journee)(etat.jour); }
    catch (e) {
      note(jourCourant, "crash", String(e).slice(0, 400));
      if (/has been closed/.test(String(e))) break; // le navigateur est parti : inutile de brûler l'année
      await capture(`${jourCourant}-crash`);
    }
    sauver();
  }
} finally {
  sauver();
  await ctx.close();
}
