// Une année de cuisine menée par l'app, au doigt, dans un vrai navigateur.
//
// usage : PROFILE=<dossier> OUT=<dossier> node sim/annee.mjs [jours]
//
// Le monde réel (ce qu'il y a VRAIMENT dans le frigo) est tenu ici, à côté de
// l'app, pour pouvoir comparer ce qu'elle croit à ce qui est. Tout ce qui
// touche l'app passe par un geste d'écran — aucune écriture en base.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";

let graine = +(process.env.SEED ?? 20261016);
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
// COURSES=6 : un seul jour de courses (le samedi) — le fond seul tient la semaine.
const JOURS_COURSES = (process.env.COURSES ?? "3,6").split(",").map(Number);
// ALEA=2 : un foyer plus agité — invités, soirs dehors, plats ratés, desserts et
// apéros plus souvent (×ALEA sur les probabilités).
const ALEA = +(process.env.ALEA ?? 1);
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
const DEBUT = new Date(`${process.env.DEBUT ?? "2026-10-16"}T00:00:00`);
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
  // ALEA > 1 : des imprévus en plus, tirés par la date (le même jour donne le même tirage).
  if (ALEA > 1 && !e.some((x) => x.type === "absent")) {
    const h = ([...j].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) % 100000) / 100000;
    const k = ALEA - 1;
    if (h < 0.03 * k) e.push({ type: "invites", prevu: false, parts: 5, quoi: "des amis à dîner, à l'improviste", repas: "diner" });
    else if (h < 0.06 * k) e.push({ type: "dehors", prevu: false, quoi: "dîner dehors, au dernier moment" });
    else if (h < 0.08 * k) e.push({ type: "rate", prevu: false, quoi: "plat raté" });
  }
  return e;
}

// ───────────────────────────────────────────────────────────── l'état
const etat = existsSync(ETAT)
  ? JSON.parse(readFileSync(ETAT, "utf8"))
  : { jour: 0, reel: {}, restes: [], recents: [], compte: { cuits: 0, restesManges: 0, jetes: 0, gaspilleG: 0 } };
const sauver = () => writeFileSync(ETAT, JSON.stringify(etat));
const note = (j, type, texte, extra = {}) => { appendFileSync(NOTES, JSON.stringify({ j, type, texte, ...extra }) + "\n"); console.log(`  ⚑ ${type} — ${texte}`); };


// LE REPLI SE MANGE DANS LE VRAI PLACARD. Pâtes ou gnocchis, ~100 g par part :
// s'il n'y en a pas assez, il n'y a rien à manger ce soir — on le compte, on ne
// l'invente pas. L'app n'en sait rien (aucun geste « ce soir, des pâtes »).
function repliMange(j, stats, pourquoi = "repli") {
  const besoin = 250;
  for (const id of ["pates", "gnocchis"]) {
    const r = etat.reel[id];
    if (r && r.q >= besoin) {
      r.q -= besoin;
      stats.diner = `${pourquoi} : ${id === "pates" ? "pâtes" : "gnocchis"} (hors app)`;
      etat.compte.replis = (etat.compte.replis ?? 0) + 1;
      return true;
    }
  }
  stats.diner = `${pourquoi} : RIEN — ni pâtes ni gnocchis au placard`;
  etat.compte.rien = (etat.compte.rien ?? 0) + 1;
  note(j, "rien", `${pourquoi} sans pâtes ni gnocchis dans la cuisine réelle`);
  return false;
}
// ───────────────────────────────────────────────────────────── le navigateur
const ctx = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
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
// T134 — UNE LIGNE « POUR LE FOND » SE COMPTE EN UNITÉS D'ACHAT (« 2 unités »),
// et le grand livre en unités de recette. Sans conversion, deux sachets de
// lentilles valaient 2 g et le premier hachis les vidait. Une unité du fond =
// son poids quand `fond.yaml` le dit (« sachet de 500 g »), son compte (« boîte
// de 6 »), une recette pour une boîte, une brique ou un tube, deux sinon.
const UNITE_RECETTE = new Map(), QTE_RECETTE = new Map();
for (const p of cat.plats) for (const i of p.ingredients) {
  if (i.base || i.assaisonnement) continue;
  const id = cat.rayons.aliases?.[i.id] ?? i.id;
  if (!UNITE_RECETTE.has(id)) UNITE_RECETTE.set(id, i.unit);
  QTE_RECETTE.set(id, Math.max(QTE_RECETTE.get(id) ?? 0, i.qty ?? 0));
}
const UNITE_FOND = new Map((cat.fond?.denrees ?? []).map((d) => [d.ingredient, d.unite ?? ""]));
function parUniteDuFond(id) {
  const u = UNITE_FOND.get(id); if (u === undefined) return null;
  const typ = QTE_RECETTE.get(id) || 1;
  const enMasse = /^(g|ml)$/.test(UNITE_RECETTE.get(id) ?? "");
  const g = /(\d+(?:[.,]\d+)?)\s*(kg|g)\b/.exec(u);
  if (g) { const grammes = parseFloat(g[1].replace(",", ".")) * (g[2] === "kg" ? 1000 : 1); return enMasse ? grammes : Math.max(1, Math.round(grammes / 150)); }
  const n = /de (\d+)\b/.exec(u); if (n) return +n[1];
  return /bo[iî]te|brique|bocal|tube/.test(u) ? typ : 2 * typ;
}

// LES UNITÉS DU MONDE RÉEL. Le placard tient chaque denrée dans UNE unité (la
// première que le corpus emploie) ; une recette qui la dit autrement se
// convertit : « 300 g de poireau » ne vide pas un stock compté en pièces.
const POIDS_PIECE = { courge: 1000, concombre: 300, avocat: 200, "salade-verte": 300, pomelo: 400, anchois: 4, cornichons: 8, radis: 15, "radis-long": 250, ail: 6, "ail-noir": 40, "champignons-paris": 20, pruneaux: 10, "sardines-boite": 25, sardines: 60, saumon: 130, "saucisse-fumee": 250, saucisses: 100, dinde: 3500, "chevre-demi-sec": 60, "petits-suisses": 60, "pate-feuilletee": 230, "pate-brisee": 230, "feuilles-brick": 17, biscottes: 8, "pain-levain": 40, coppa: 15, seitan: 30, betterave: 20, "poudre-a-lever": 11, "levure-boulangere": 25, "bouillon-legumes": 10, "bouillon-volaille": 10, "sucre-vanille": 7.5, "gousse-vanille": 3, cebette: 20, "tomates-roma": 80, fenouil: 250, "chou-frise": 800, "chou-chinois": 800, "chou-romanesco": 600, "ail-des-ours": 2, oseille: 2, orties: 2, "navet-primeur": 80, "navets-roses": 80, topinambours: 60, "patate-douce": 300, patidou: 500, gingembre: 30, "piment-frais": 10, tortillas: 40, "pains-burger": 60, "galettes-sarrasin": 50, "galettes-riz": 10, crevettes: 15, "poisson-entier": 400, canette: 1800, poireau: 200, oignon: 120, "oignon-rouge": 120, carottes: 100, pommes: 150, poires: 150, banane: 120, "pomme-de-terre": 150, potimarron: 1200, courgettes: 200, tomates: 120, citron: 100, oeufs: 55, echalote: 30, navets: 120, panais: 150, brocoli: 400, "chou-fleur": 800, "yaourt-nature": 125, basilic: 1, menthe: 1, persil: 1, "olives-noires": 4, jambon: 40, "jambon-cru": 17, poulet: 1500, "tomates-cerises": 15, champignons: 20, noix: 5 };
function versBase(id, qty, unit) {
  const base = UNITE_RECETTE.get(id) ?? unit;
  if (!unit || unit === base) return qty;
  const masse = { g: 1, kg: 1000, ml: 1, cl: 10, l: 1000 };
  if (masse[unit] && masse[base]) return qty * masse[unit] / masse[base];
  const pp = POIDS_PIECE[id] ?? 150;
  const compte = /^(pièce|pot|unité|botte|tête|gousse)$/;
  if (unit === "gousse" && base === "tête") return qty / 10;
  if (unit === "tête" && base === "gousse") return qty * 10;
  if (masse[unit] && compte.test(base)) return qty * masse[unit] / pp;
  if (compte.test(unit) && masse[base]) return qty * pp / masse[base];
  return qty; // pot ↔ pièce, brin, c. à s. : à l'unité près
}
function enGrammes(id, q) {
  const base = UNITE_RECETTE.get(id) ?? "";
  const masse = { g: 1, kg: 1000, ml: 1, cl: 10, l: 1000 };
  if (masse[base]) return q * masse[base];
  if (base === "gousse") return q * 6;
  if (base === "tête") return q * 60;
  return q * (POIDS_PIECE[id] ?? 100);
}
/** Ce que dit une ligne d'achat (« 9 packs de 4 », « 1 filet de 1 kg », « 400 g »), en unité du placard réel. */
function quantiteAchat(id, txt) {
  const cond = /^\s*([\d.,]+)\s+[^\d]+?\s+de\s+([\d.,]+)\s*(kg|g|l|cl|ml)?\b/i.exec(txt);
  const m = /([\d.,]+)\s*(kg|g|l|cl|ml)?\b/i.exec(txt);
  const n0 = m ? parseFloat(m[1].replace(",", ".")) : 1;
  if (cond) {
    const n = parseFloat(cond[1].replace(",", ".")), x = parseFloat(cond[2].replace(",", "."));
    const uc = (cond[3] ?? "").toLowerCase();
    return uc ? versBase(id, n * x, uc) : n * x;
  }
  if (/unit[ée]/.test(txt) && parUniteDuFond(id) != null) return n0 * parUniteDuFond(id);
  if (/t[êe]te/.test(txt)) return versBase(id, n0, "tête");
  const u = (m?.[2] ?? "").toLowerCase();
  return u ? versBase(id, n0, u) : versBase(id, n0, "pièce");
}
/** Une unité d'achat du fond (« pack de 4 »), en unité du placard réel. */
const UNITE_ACHAT = new Map((cat.fond?.denrees ?? []).map((d) => [cat.rayons.aliases?.[d.ingredient] ?? d.ingredient, d.unite ?? "pièce"]));
// « 1 kg en vrac », « 500 g en vrac » : l'unité porte déjà sa quantité.
const unDuFond = (id) => { const u = UNITE_ACHAT.get(id) ?? "pièce"; return quantiteAchat(id, /^\d/.test(u) ? u : `1 ${u}`) || 1; };
// LE PRIX — un relevé de magasin, HORS DU DÉPÔT (`PRIX=…/references.json`) :
// les montants du foyer ne vivent pas dans git. Absent, rien ne se chiffre.
const PRIX = process.env.PRIX && existsSync(process.env.PRIX) ? JSON.parse(readFileSync(process.env.PRIX, "utf8")).articles ?? {} : {};
function prixUnitaire(id) {
  const a = PRIX[id] ?? PRIX[cat.rayons.aliases?.[id] ?? ""]; if (!a?.prix) return null;
  const c = (a.conditionnement ?? "").replace(",", ".");
  let base;
  const mul = /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)\b/i.exec(c);
  const m = /(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)\b/i.exec(c);
  if (mul) base = versBase(id, +mul[1] * +mul[2], mul[3].toLowerCase());
  else if (m) base = versBase(id, +m[1], m[2].toLowerCase());
  else if (/^kg$/i.test(c.trim())) base = versBase(id, 1000, "g");
  else if (/botte/i.test(c)) base = versBase(id, /basilic|persil|ciboulette|menthe|coriandre|herbe/.test(id) ? 30 : 500, "g");
  else if (/(\d+)\s*(cubes|sachets|pièces|feuilles|tranches)|de (\d+)\b|[×x]\s*(\d+)\b/i.test(c)) { const n = /(\d+)\s*(?:cubes|sachets|pièces|feuilles|tranches)|de (\d+)\b|[×x]\s*(\d+)\b/i.exec(c); base = versBase(id, +(n[1] ?? n[2] ?? n[3]), "pièce"); }
  else base = versBase(id, 1, "pièce");
  return base > 0 ? a.prix / base : null;
}
function payer(id, qte) {
  const pu = prixUnitaire(id);
  const c = etat.compte;
  if (pu == null) { c.sansPrix = { ...(c.sansPrix ?? {}), [id]: 1 }; return; }
  c.depense = Math.round(((c.depense ?? 0) + pu * qte) * 100) / 100;
  c.depenseParId = { ...(c.depenseParId ?? {}), [id]: Math.round((((c.depenseParId ?? {})[id] ?? 0) + pu * qte) * 100) / 100 };
}
function acheter(nom, q, j) {
  const id = idParNom.get(norm(nom)) ?? norm(nom);
  const qte = quantiteAchat(id, q ?? "");
  payer(id, qte);
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
    r.q = Math.max(0, r.q - versBase(i.id, i.qty ?? 0, i.unit) * Math.min(f, 2));
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
for (const f of cat.garde ?? []) for (const id of f.ids) GARDE_JOURS.set(id, f.fenetreJours);
function pourrirLeFrais(j) {
  for (const [id, r] of Object.entries(etat.reel)) {
    if (r.frais && r.q > 0 && (new Date(j) - new Date(r.le)) / 864e5 > (GARDE_JOURS.get(id) ?? 7)) {
      const g = enGrammes(id, r.q);
      etat.compte.gaspilleG += g; r.q = 0;
      etat.compte.jetesParId = { ...(etat.compte.jetesParId ?? {}), [id]: Math.round(((etat.compte.jetesParId ?? {})[id] ?? 0) + g) };
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
    if (MOI && !JOURS_COURSES.includes(new Date(j).getDay()) && art > 1) pourquoi.push(`${art} articles à acheter un jour sans courses`);
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
  // « .co-kicker » n'existe que s'il y a un rayon à afficher : un jour sans
  // rien à acheter, le harnais plantait (16 jours de l'année n° 12).
  await attendre(".st-tete", 20_000);
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
  // Depuis 7e1b7b2, plus de mode « À la maison » : toucher met dans le sac,
  // « Ranger au stock » fait tout entrer d'un coup.
  const ranger = page.getByRole("button", { name: /Ranger au stock/ });
  if (await ranger.count()) { await tap(ranger); await page.waitForTimeout(800); }
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
/** Les lots de l'app (IndexedDB) : id → {type, band, location}. Pour savoir
 *  lequel une cuisson a pris, et le prendre au monde réel aussi. */
const stockApp = () => page.evaluate(() => new Promise((ok) => { const r = indexedDB.open("intendance"); r.onsuccess = () => { const q = r.result.transaction("stock").objectStore("stock").getAll(); q.onsuccess = () => { r.result.close(); ok(Object.fromEntries(q.result.map((l) => [l.id, { type: l.type, band: l.band, location: l.location, kind: l.kind }]))); }; q.onerror = () => ok({}); }; r.onerror = () => ok({}); })).catch(() => ({}));
const BANDN = (b) => +(/^([\d.]+)/.exec(b ?? "")?.[1] ?? 0);
/** Ce qu'une cuisson a pris aux restes de l'app : [{type, location}] (lots finis ou réduits). */
function prisParLApp(avant, apres) {
  const out = [];
  for (const [id, l] of Object.entries(avant)) {
    if (l.kind !== "reste-plat" && l.kind !== "base") continue;
    const b = apres[id];
    if (!b || BANDN(b.band) < BANDN(l.band) - 1e-9) out.push({ type: l.type, location: l.location });
  }
  return out;
}

async function cuisiner(j, ev, stats, { autrement = false, parts = 2.75, deja = null } = {}) {
  let p0;
  const avantApp = await stockApp();
  if (deja) {
    // T128/T129 : « Je lance ça » a posé le plat ET ouvert sa fiche — on y est.
    p0 = { titre: deja };
    await attendre(".co-fiche-tete", 20_000);
  } else {
    const poses = await lirePoses();
    if (!poses.length) return null;
    p0 = poses[0];
    await tap(page.locator(".co-lot").first().getByRole("link", { name: "Voir la recette" }));
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
  if (autrement && (await autre.count())) {
    // « J'ai fait autrement » : où est parti chaque reste, puis « Noter », puis « Terminer ».
    // Le foyer qui a raté son plat n'en garde rien ; celui qui a improvisé met au frigo.
    await tap(autre); reponseDonnee = "autrement"; await page.waitForTimeout(300);
    const groupes = page.getByRole("radiogroup");
    const ng = await groupes.count();
    const rate = ev.some((e) => e.type === "rate");
    for (let k = 0; k < ng; k++) await tap(groupes.nth(k).getByRole("radio", { name: rate ? "Pas gardé" : "Au frigo" }));
    const noter = page.getByRole("button", { name: "Noter" });
    if (await noter.count()) { await tap(noter); await page.waitForTimeout(400); }
    const fin = page.getByRole("button", { name: "Terminer" });
    if (await fin.count()) await tap(fin);
    else note(j, "sortie", "« J'ai fait autrement » : pas de « Terminer » après « Noter »");
    if (rate) lots.length = 0;
  }
  else if (await range.count()) { await tap(range); reponseDonnee = "rangé"; }
  else if (await fait.count()) { await tap(fait); reponseDonnee = "fait"; }
  else note(j, "sortie", "pas d'écran de sortie : " + sortieTxt.slice(0, 200).replace(/\n/g, " / "));
  if (/Déjà noté/.test(await texte().catch(() => ""))) { note(j, "deja-note", `« ${p0.titre} » : « Déjà noté pour ce repas », rien n'est sorti du stock`); etat.compte.dejaNotes = (etat.compte.dejaNotes ?? 0) + 1; }
  await page.waitForURL((u) => !/cuisiner/.test(u.toString()), { timeout: 10_000 }).catch(() => note(j, "sortie", "la fiche ne s'est pas refermée"));
  const plat = platParTitre.get(p0.titre);
  if (plat) consommer(plat, parts);
  // Le monde réel mange aussi les restes que le plat réclame : la bolognaise
  // des pâtes, le poulet des fajitas, n'importe quel reste pour « Reste réchauffé ».
  // CE QUE L'APP A PRIS, LE MONDE RÉEL LE PREND : le lot que la cuisson a fini
  // dans l'app (lu avant/après), le plus ancien de ce type au même endroit.
  const prisApp = prisParLApp(avantApp, await stockApp());
  for (const a of plat?.accepts ?? []) {
    const vivants = etat.restes.filter((r) => !r.jete && r.portions > 0);
    const lu = prisApp.shift();
    const parApp = lu && vivants.filter((r) => r.types.includes(lu.type)).sort((x, y) => Number((y.ou === "Frigo") === (lu.location === "frigo")) - Number((x.ou === "Frigo") === (lu.location === "frigo")) || x.le.localeCompare(y.le))[0];
    const pris = parApp ? parApp : a.type
      ? vivants.filter((r) => r.types.includes(a.type)).sort((x, y) => (x.ou === "Frigo" ? -1 : 1) - (y.ou === "Frigo" ? -1 : 1))[0]
      : vivants.filter((r) => r.ou === "Frigo")[0] ?? vivants[0];
    if (pris) { pris.portions = 0; pris.mangeLe = j; pris.parPlat = p0.titre; etat.compte.restesManges++; }
    else if (a.requis) note(j, "chaine", `« ${p0.titre} » réclame ${a.type ?? "un reste"} que la maison n'a pas (l'app l'a cru disponible)`);
  }
  // Le monde réel garde ce que la sortie a dit de ranger (ou tout au frigo si « autrement »).
  for (const l of lots) {
    const m = /^(Frigo|Congélo|Congélateur)[^·]*·\s*(.*)$/.exec(l.nom);
    // « 3 parts », ou « 1 repas » : un repas de l'app est celui du foyer (le midi
    // des quatre en prend un : `partsDuMidi`). Le harnais lisait « 2 parts » par
    // défaut, et le midi des quatre finissait chaque jour sur une omelette.
    const nParts = /([\d,.]+)\s*(part|portion)/.exec(l.nom), nRepas = /([\d,.]+)\s*repas/.exec(l.nom);
    const portions = nParts ? parseFloat(nParts[1].replace(",", ".")) : nRepas ? parseFloat(nRepas[1].replace(",", ".")) * MIDI_PARTS : 2;
    // Le lot EST un des emits du plat : on le retrouve par son nom lisible, pour
    // savoir si c'est un reste à manger ou une BASE (pois chiches cuits, bouillon)
    // qu'un autre plat attend — le midi ne mange pas une base.
    const emits = plat?.emits ?? [];
    const e = emits.find((x) => norm(l.nom).includes(lisible(x.type)));
    etat.restes.push({ plat: p0.titre, types: e ? [e.type] : emits.map((x) => x.type), kind: e?.kind ?? (emits.every((x) => x.kind === "base") ? "base" : "reste-plat"), ou: autrement ? "Frigo" : (m?.[1] ?? "Frigo"), portions, le: j, garde: parseInt(l.garde) || (m?.[1] === "Frigo" ? 3 : 90), quoi: l.nom });
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
  // Depuis T141 les lots vivent dans le panneau d'une zone, qu'on ouvre en
  // touchant le frigo ou le congélateur sur le plan ; le bouton d'un reste dit
  // « Fini » (il disait « Je n'en ai plus »).
  await aller("cuisine/stock");
  const plan = page.getByRole("group", { name: /Plan de la cuisine/ });
  await plan.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
  for (const zone of [/^Frigo/, /^Congélo/]) {
    const bouton = plan.getByRole("button").filter({ hasText: zone });
    if (!(await bouton.count())) continue;
    // Le panneau de la zone peut être déjà ouvert : le toucher le refermerait.
    const ouvert = (await page.locator(".st-panneau .nom").first().innerText().catch(() => "")).trim();
    if (!zone.test(ouvert)) { await tap(bouton.first()); await page.waitForTimeout(400); }
    const lots = page.locator(".st-panneau .co-lot").filter({ has: page.getByRole("button", { name: /^Fini$|Je n.en ai plus/ }) });
    const n = await lots.count();
    for (let k = 0; k < n; k++) {
      const t = await lots.nth(k).innerText();
      if (filtre(t)) {
        await tap(lots.nth(k).getByRole("button", { name: /^Fini$|Je n.en ai plus/ }).first());
        await page.waitForTimeout(500);
        return t.split("\n")[0];
      }
    }
  }
  return null;
}

/** Un lot nomme ce qu'il est par son nom lisible (T193), plus par son type. */
const lisible = (ty) => norm(cat.typesLisibles?.[ty] ?? ty.replace(/-/g, " "));
const estDu = (r) => (x) => r.types.some((ty) => norm(x).includes(lisible(ty)));

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
  if (idx === 0) await poserFond(j);
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
    if (r) { r.jete = j; const t = await plusDe(estDu(r)); note(j, "jete", `reste de « ${r.plat} » tourné : ${t ? "retiré via Je n'en ai plus" : "introuvable dans l'app"}`); }
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
          const t = await plusDe((x) => estDu(r)(x) && x.includes("Frigo"));
          stats.gamelleRetiree = t ?? "introuvable";
          if (!t) note(j, "reste", `reste de « ${r.plat} » fini à la gamelle, mais l'app n'a pas de lot frigo à son nom (${r.types.join(",")})`);
        } else stats.gamellePartielle = `${r.plat} : il reste ${r.portions} parts — l'app ne sait pas qu'on en a mangé 2`;
      }
    }

    // Le dîner.
    await page.clock.setFixedTime(new Date(`${j}T19:00:00`));
    if (ev.some((e) => e.type === "dehors")) { note(j, "dehors", "dîner dehors à l'improviste : le plat posé de ce soir glisse simplement, rien à dire à l'app"); stats.diner = "dehors"; }
    else if (ev.some((e) => e.type === "malade")) {
      repliMange(j, stats, "malade");
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
    const t = await plusDe((x) => estDu(r)(x) && x.includes(r.ou.slice(0, 5)));
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
  // Les planchers du placard vivent dans « Réglages du stock », replié par défaut.
  const reglages = page.getByRole("button", { name: /Réglages du stock/ });
  if ((await reglages.count()) && (await reglages.getAttribute("aria-expanded")) === "false") { await tap(reglages); await page.waitForTimeout(500); }
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
  // Les planchers du placard vivent dans « Réglages du stock », replié par défaut.
  const reglages = page.getByRole("button", { name: /Réglages du stock/ });
  if ((await reglages.count()) && (await reglages.getAttribute("aria-expanded")) === "false") { await tap(reglages); await page.waitForTimeout(500); }
  const ouvrir = page.getByRole("button", { name: "en ajouter un au placard" });
  if (!(await ouvrir.count())) { note(j, "fond", "pas de bouton pour poser un plancher au placard"); return; }
  await tap(ouvrir); await page.waitForTimeout(500);
  // Le nom affiché porte accents et ligatures (« œufs », « tomates pelées ») :
  // on retrouve le texte exact de l'écran par le nom normalisé.
  const affiches = new Map();
  for (const t of await page.locator(".co-lot .nom").allInnerTexts()) affiches.set(norm(t.replace(/œ/g, "oe")), t.trim());
  const echap = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ligneDe = (nom, bouton) => page.locator(".co-lot")
    .filter({ has: page.locator(".nom", { hasText: new RegExp(`^${echap(affiches.get(norm(nom)) ?? nom)}$`, "i") }) })
    .filter({ has: page.getByRole("button", { name: bouton, exact: true }) }).first();
  const poses = [], absents = [];
  // T158 — le geste du foyer : « Suivre ces N essentiels », d'un doigt.
  const tous = page.getByRole("button", { name: /^Suivre (ces|les) \d+/ });
  if (await tous.count()) {
    const n = +(/\d+/.exec(await tous.first().innerText())?.[0] ?? 0);
    await tap(tous.first()); await page.waitForTimeout(1200);
    // Ce que l'app suit désormais, lu à l'écran : c'est cela, et seulement cela,
    // que le foyer a déclaré avoir (« En garder N » = j'en ai).
    const suivis = new Set((await page.locator(".co-lot").filter({ has: page.getByRole("button", { name: "Ne plus suivre" }) }).locator(".nom").allInnerTexts()).map((t) => norm(t.replace(/œ/g, "oe"))));
    for (const { ingredient, minimum } of cat.fond.denrees) {
      const id = cat.rayons.aliases?.[ingredient] ?? ingredient;
      if (!suivis.has(norm(nomDe(id).replace(/œ/g, "oe"))) && !suivis.has(norm(id))) continue;
      const q = minimum * unDuFond(id);
      payer(id, q);
      etat.reel[id] = { q: (etat.reel[id]?.q ?? 0) + q, achete: q, le: j, frais: FRAIS.test(rayonDe.get(id) ?? "") };
      poses.push(`${ingredient} ${minimum}`);
    }
    etat.fondPose = n;
    // Le fond de départ se chiffre à part : c'est un capital, pas la dépense de l'année.
    etat.compte.fondInitial = etat.compte.depense ?? 0; etat.compte.depense = 0; etat.compte.depenseParId = {};
    // L'apéro n'est pas au fond : le foyer pose lui-même ses deux bocaux,
    // « En garder 1 » sur la ligne de chacun (le même geste que l'e2e T41).
    await tap(page.getByRole("button", { name: "en ajouter un au placard" })).catch(() => {});
    await page.waitForTimeout(500);
    for (const id of APERO) {
      const nom = nomDe(id);
      const ligne = page.locator(".co-lot").filter({ hasText: new RegExp(`^${nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i") }).filter({ has: page.getByRole("button", { name: "En garder 1" }) }).first();
      if (!(await ligne.count())) { note(j, "apero", `pas de « En garder 1 » pour ${nom}`); continue; }
      await tap(ligne.getByRole("button", { name: "En garder 1" })); await page.waitForTimeout(300);
      const q = unDuFond(id) || 1;
      etat.reel[id] = { q, achete: q, le: j, frais: false };
      poses.push(`${id} 1 (apéro)`);
    }
    note(j, "fond", `« Suivre ces ${n} essentiels » : ${n} planchers posés d'un doigt ; le placard réel part plein (${poses.length} denrées suivies : ${poses.join(", ")})`);
    return;
  }
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
    // « En garder N » dit « j'en ai, garde-m'en au moins N » : le placard réel
    // part plein, à son plancher — comme une cuisine de restaurant au par.
    const id = cat.rayons.aliases?.[ingredient] ?? ingredient;
    const q = minimum * (parUniteDuFond(id) ?? 1);
    etat.reel[id] = { q: (etat.reel[id]?.q ?? 0) + q, achete: q, le: j, frais: FRAIS.test(rayonDe.get(id) ?? "") };
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
// « Reste réchauffé » n'est pas un plat : c'est un reste différent chaque fois.
// Le refuser « parce qu'on en a mangé avant-hier » remplissait le congélateur.
const mangeRecemment = (titre, j) => titre !== "Reste réchauffé" && (etat.manges ?? []).some((m) => m.t === titre && (new Date(j) - new Date(m.j)) / 864e5 <= 3 && m.j !== j);
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
/** Les règles du foyer, appliquées à une carte du soir. */
function juger(c, j, ev) {
  const p = platParTitre.get(c.titre);
  const pourquoi = [];
  const four = ev.some((e) => e.type === "four-en-panne" || e.type === "canicule");
  if (DESSERT.test(c.titre) || (p && p.role && p.role !== "plat")) pourquoi.push("pas un repas");
  if (mangeRecemment(c.titre, j)) pourquoi.push("mangé ces trois derniers jours");
  if (!JOURS_COURSES.includes(new Date(j).getDay()) && c.achats.n > 1) pourquoi.push(`${c.achats.n} articles à acheter un jour sans courses`);
  if (/prêt vers/.test(c.heure)) pourquoi.push("pas prêt pour 18 h en lançant à 15 h");
  if (four && p && (p.vaisselle?.id ?? "").match(/plat|moule|four|cocotte/)) pourquoi.push("demande le four");
  // T134 — LE FOYER NE CUISINE PAS CE QU'IL N'A PAS. Un jour sans courses, au
  // moment de lancer, on ouvre le placard : un ingrédient que le grand livre
  // tient à zéro (et que la carte ne disait pas manquer, donc qu'on n'ira pas
  // chercher) se découvre — noté, et on prend la carte suivante. Un id jamais
  // acheté n'est pas au grand livre : on n'en sait rien, on ne l'invente pas.
  if (!pourquoi.length && p && !JOURS_COURSES.includes(new Date(j).getDay())) {
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

// ───────────────────────────────────────────────────────────── une journée, comme chez moi

// ───────────────────────────────────────────────────────────── les cinq repas du jour
// TOUS LES MOMENTS OÙ L'ON MANGE, pour les quatre (deux adultes, le grand, le
// petit). Le monde réel mange ; l'app, elle, compte ses routines (T142) — on
// regarde si les deux tiennent ensemble. Ce que le foyer mange ici ne passe par
// l'app que quand elle offre un geste (une fournée, un midi à cuisiner).
const platParId = new Map(cat.plats.map((p) => [p.id, p]));
const ROUT = cat.creneaux?.routines ?? {};
const PDJ = platParId.get(ROUT["petit-dejeuner"]?.recette), GOUT = platParId.get(ROUT.gouter?.recette);
const TYPES_PAIN = new Set(ROUT["petit-dejeuner"]?.du_depot?.types ?? []);
const TYPES_GOUTER = new Set(ROUT.gouter?.du_depot?.types ?? []);
const BAND = (b) => +(/^(\d+)/.exec(b ?? "")?.[1] ?? 1);
const MIDI_PARTS = (cat.foyer?.mangeurs ?? []).reduce((n, m) => (m.parts > 0 ? n + Math.max(m.parts, 0.5) : n), 0) || 3;
const APERO = (cat.gardeManger?.denrees ?? []).filter((d) => d.usage === "apero").map((d) => cat.rayons.aliases?.[d.ingredient] ?? d.ingredient);
const manqueDuJour = (stats, repas, id) => { stats.manquesRepas = [...(stats.manquesRepas ?? []), `${repas}:${id}`]; etat.compte.manquesRepas = (etat.compte.manquesRepas ?? 0) + 1; };
/** Prend q d'un id dans la cuisine réelle ; faux si elle n'en a pas assez. */
function prendre(id, q) {
  const r = etat.reel[id];
  if (!r || r.q + 1e-9 < q) { if (r) r.q = Math.max(0, r.q - q); return false; }
  r.q -= q; return true;
}
/** Mange une recette dans le réel (remplaçants compris) ; rend les ids qui ont manqué. */
function mangerRecette(plat, f = 1) {
  const manque = [];
  for (const i of plat?.ingredients ?? []) {
    if (i.base || i.assaisonnement || toujours.has(i.id) || !(i.qty > 0)) continue;
    const alts = [i.id, ...(i.remplacants ?? []).map((r) => r.id)];
    const ok = alts.find((id) => (etat.reel[id]?.q ?? 0) >= versBase(id, i.qty * f, i.unit));
    if (ok) { prendre(ok, versBase(ok, i.qty * f, i.unit)); continue; }
    if (!i.facultatif) manque.push(i.id);
  }
  return manque;
}
/** Une ration d'un lot réel de ces types (le plus ancien d'abord). */
function ration(types, n = 1) {
  const l = etat.restes.filter((r) => !r.jete && r.portions > 0 && r.types.some((t) => types.has(t))).sort((a, b) => a.le.localeCompare(b.le))[0];
  if (!l) return null;
  l.portions -= n; if (l.portions <= 0) l.mangeLe = jourCourant;
  return l.plat;
}
function petitDejeuner(j, stats) {
  const m = mangerRecette(PDJ, 1);
  for (const id of m) manqueDuJour(stats, "pdj", id);
  const pain = ration(TYPES_PAIN);
  // Sans pain maison, les adultes prennent un porridge : 80 g de flocons.
  if (!pain && !prendre("flocons-avoine", 80)) manqueDuJour(stats, "pdj", "flocons-avoine (adultes)");
  stats.repas = { ...stats.repas, pdj: m.length ? `manque ${m.join(",")}` : pain ? "complet" : "sans pain maison" };
}
function gouter(j, stats) {
  const m = mangerRecette(GOUT, 1);
  for (const id of m) manqueDuJour(stats, "gouter", id);
  const f = ration(TYPES_GOUTER);
  stats.repas = { ...stats.repas, gouter: m.length ? `manque ${m.join(",")}` : f ? `fournée (${f})` : "yaourt et fruit seuls" };
}
function dessert(j, stats) {
  if (hasard() > Math.min(0.95, 0.6 * ALEA)) { stats.repas = { ...stats.repas, dessert: "pas de dessert" }; return; }
  // Trois desserts (les adultes et le grand) : un yaourt, ou un fruit.
  const choix = hasard() < 0.5 ? ["yaourt-nature"] : ["pommes", "poires", "banane"];
  const id = choix.find((x) => (etat.reel[x]?.q ?? 0) >= 3);
  if (id) { prendre(id, 3); stats.repas = { ...stats.repas, dessert: id }; }
  else { manqueDuJour(stats, "dessert", choix[0]); stats.repas = { ...stats.repas, dessert: `manque ${choix[0]}` }; }
}
// L'APÉRO DES LIVRES : pizza « 8 parts en apéro », houmous, rillettes, crackers,
// madeleines salées, cakes, terrines… Cuisiné par « Recettes » et le guide, comme
// le foyer le ferait ; sinon un bocal, sinon rien.
const APERO_RE = /houmous|tartinade|tapenade|rillette|cracker|gressin|pizza|focaccia|fougasse|madeleines? (à l'huile|sal)|barbajuan|calzone|chips|falafel|accras|blinis|dip |terrine|pâté épatant|cake salé|mug-cake salé/i;
const PLATS_APERO = cat.plats.filter((p) => APERO_RE.test(p.titre) && !/céleri/i.test(JSON.stringify(p.ingredients)) && p.ingredients.length > 0);
function faisable(p) {
  // Une base exigée (pois chiches cuits, pâte) doit être au vrai frigo.
  const bases = (p.accepts ?? []).filter((a) => a.requis && a.type).every((a) => etat.restes.some((r) => !r.jete && r.portions > 0 && r.types.includes(a.type)));
  return bases && p.ingredients.every((i) => i.base || i.assaisonnement || i.facultatif || toujours.has(i.id) || !(i.qty > 0)
    || [i.id, ...(i.remplacants ?? []).map((r) => r.id)].some((id) => (etat.reel[id]?.q ?? 0) >= versBase(id, i.qty, i.unit)));
}
async function apero(j, ev, stats) {
  const invites = ev.some((e) => e.type === "invites");
  const dow = new Date(j).getDay();
  if (!(invites || (dow === 5 && hasard() < 0.35 * ALEA) || (dow === 6 && hasard() < 0.25 * ALEA))) return;
  etat.compte.aperos = (etat.compte.aperos ?? 0) + 1;
  // Un reste d'apéro au frigo d'abord (la moitié de la pizza de samedi).
  const reste = etat.restes.find((r) => !r.jete && r.portions > 0 && r.ou === "Frigo" && r.apero);
  if (reste) { reste.portions = 0; reste.mangeLe = j; stats.repas = { ...stats.repas, apero: `reste : ${reste.plat}` }; return; }
  const candidats = PLATS_APERO.filter(faisable);
  if (candidats.length && (invites || hasard() < 0.7)) {
    const p = candidats[Math.floor(hasard() * candidats.length)];
    await page.clock.setFixedTime(new Date(`${j}T17:30:00`));
    await aller("cuisine/repertoire"); await page.waitForTimeout(400);
    const champ = page.getByLabel("chercher un plat par son nom");
    if (await champ.count()) {
      await champ.fill(p.titre); await page.waitForTimeout(500);
      const lien = page.locator("a.co-rep").filter({ hasText: p.titre.slice(0, 30) }).first();
      if (await lien.count()) {
        const href = await lien.getAttribute("href");
        stats.aperoCreneau = href; // le créneau que « Recettes » vise : la cuisson s'y journalise
        if (href && !href.includes(`${j}/`)) note(j, "apero-creneau", `« ${p.titre} » cuisiné ce soir depuis Recettes, journalisé sur ${href.split("/").slice(-3, -1).join(" ")}`);
        await tap(lien);
        const fait = await cuisiner(j, ev, stats, { parts: p.portions, deja: p.titre }).catch((e) => { note(j, "apero", `cuisson échouée : ${String(e).slice(0, 120)}`); return null; });
        if (fait) {
          for (const r of etat.restes.filter((x) => x.plat === fait && x.le === j)) r.apero = true;
          // L'apéro mange la moitié de la fournée ; le reste attend au frigo.
          stats.repas = { ...stats.repas, apero: `cuisiné : ${fait}` }; etat.compte.aperosCuisines = (etat.compte.aperosCuisines ?? 0) + 1; return;
        }
      }
    }
  }
  const pris = [];
  for (const id of APERO) {
    const r = etat.reel[id]; if (!r || r.q <= 0) continue;
    r.q = Math.max(0, r.q - (invites ? r.achete || 1 : (r.achete || 1) / 3)); pris.push(id);
    if (r.q <= 0) { const t = await plusDe((x) => norm(x).includes(norm(nomDe(id)))); if (!t) note(j, "apero", `${id} fini au réel, pas de ligne « Fini » au stock`); }
  }
  if (!pris.length) manqueDuJour(stats, "apero", candidats.length ? "rien de prêt" : "rien de faisable");
  stats.repas = { ...stats.repas, apero: pris.length ? `bocal : ${pris.join(",")}` : "rien pour l'apéro" };
}
const nomDe = (id) => cat.rayons.noms?.[id] ?? id.replace(/-/g, " ");
/** Midi : un reste pour les quatre (3 parts), sinon une omelette-tartines hors app. */
async function dejeuner(j, ev, stats, weekend) {
  // Le week-end, le cockpit peut proposer un midi à cuisiner avec le stock.
  // Le week-end on cuisine le midi ; en semaine aussi quand le frigo n'a pas de
  // reste (télétravail) — si le cockpit propose un midi « rien à acheter ».
  const resteAuFrigo = etat.restes.some((x) => !x.jete && x.portions > 0 && x.ou === "Frigo" && x.kind !== "base" && !x.types.some((t) => TYPES_PAIN.has(t) || TYPES_GOUTER.has(t)));
  if (weekend || !resteAuFrigo) {
    await page.clock.setFixedTime(new Date(`${j}T11:30:00`));
    await aller("cockpit"); await attendre(".co-barre", 20_000); await page.waitForTimeout(300);
    const lien = page.locator("a", { hasText: /^Midi : .* — rien à acheter/ }).first();
    if (await lien.count()) {
      const t = (await lien.innerText()).replace(/^Midi : /, "").replace(/ \(Chioca\)/, "").replace(/ — .*$/, "").trim();
      await tap(lien);
      const fait = await cuisiner(j, ev, stats, { parts: MIDI_PARTS, deja: t }).catch((e) => { note(j, "midi", `cuisson du midi échouée : ${String(e).slice(0, 120)}`); return null; });
      if (fait) { stats.repas = { ...stats.repas, midi: `cuisiné : ${fait}` }; etat.compte.midisCuisines = (etat.compte.midisCuisines ?? 0) + 1; return; }
    }
  }
  let reste = MIDI_PARTS; const pris = [];
  for (const r of etat.restes.filter((x) => !x.jete && x.portions > 0 && x.ou === "Frigo" && x.kind !== "base" && !x.types.some((t) => TYPES_PAIN.has(t) || TYPES_GOUTER.has(t)))) {
    if (reste <= 0) break;
    const k = Math.min(r.portions, reste); r.portions -= k; reste -= k; pris.push(r.plat);
    if (r.portions <= 0) { r.mangeLe = j; etat.compte.restesManges++; }
  }
  if (reste <= 0.01) { stats.repas = { ...stats.repas, midi: `reste : ${pris.join(" + ")}` }; stats.midi = stats.repas.midi; return; }
  // Le complément : une omelette et des tartines, hors app (T116).
  const oeufs = prendre("oeufs", 4);
  if (!oeufs) manqueDuJour(stats, "midi", "oeufs");
  const pain = ration(TYPES_PAIN);
  stats.repas = { ...stats.repas, midi: `${pris.length ? `reste (${pris.join(" + ")}) + ` : ""}${oeufs ? "omelette" : "rien de chaud"}${pain ? ", pain maison" : ""}` };
  stats.midi = stats.repas.midi;
  if (!pris.length) etat.compte.midisHorsApp = (etat.compte.midisHorsApp ?? 0) + 1;
}
/** 21 h : le geste du cockpit, « Sortir … du congélo » — le foyer le fait, et
 *  le monde réel passe le bloc au frigo pour demain. */
async function sortirDuCongelo(j, stats) {
  await page.clock.setFixedTime(new Date(`${j}T21:00:00`));
  await aller("cockpit"); await attendre(".co-barre", 20_000).catch(() => {}); await page.waitForTimeout(400);
  const t = page.locator(".co-tache", { hasText: /Sortir .* du congélo/ }).first();
  if (!(await t.count())) return;
  const fait = t.getByRole("button", { name: "Fait" });
  if (!(await fait.count())) return;
  await tap(fait); await page.waitForTimeout(300);
  const cles = await page.evaluate((jour) => new Promise((ok) => { const r = indexedDB.open("intendance"); r.onsuccess = () => { const q = r.result.transaction("reglages").objectStore("reglages").getAllKeys(); q.onsuccess = () => { r.result.close(); ok(q.result.filter((k) => String(k).startsWith(`geste|${jour}|`))); }; q.onerror = () => ok([]); }; r.onerror = () => ok([]); }), j).catch(() => []);
  for (const k of cles) {
    const type = String(k).split("|")[2];
    const l = etat.restes.filter((r) => !r.jete && r.portions > 0 && r.ou === "Congélo" && r.types.includes(type)).sort((a, b) => a.le.localeCompare(b.le))[0];
    if (l) { l.ou = "Frigo"; l.sortiLe = j; l.garde = Math.round((new Date(j) - new Date(l.le)) / 864e5) + 2; etat.compte.sortis = (etat.compte.sortis ?? 0) + 1; stats.sorti = type; }
  }
}

/** 14 h 30 : la fournée que « Ce soir » propose — le mercredi, le week-end, ou quand le pain manque. */
async function fournee(j, stats) {
  await page.clock.setFixedTime(new Date(`${j}T14:30:00`));
  await aller("cuisine/ce-soir"); await page.waitForTimeout(700);
  const lien = page.locator("p.co-action a", { hasText: /^Fournée/ }).first();
  if (!(await lien.count())) return;
  const txt = (await lien.innerText()).trim();
  const dow = new Date(j).getDay();
  if (!([0, 3, 6].includes(dow) || /pain/i.test(txt))) { stats.fourneeVue = txt; return; }
  const titre = txt.replace(/^Fournée\s*:\s*/, "").replace(/\s+—.*$/, "").trim();
  await tap(lien);
  const fait = await cuisiner(j, [], stats, { parts: platParTitre.get(titre)?.portions ?? 4, deja: titre }).catch((e) => { note(j, "fournee", `fournée échouée : ${String(e).slice(0, 120)}`); return null; });
  if (fait) {
    etat.compte.fournees = (etat.compte.fournees ?? 0) + 1; stats.fournee = fait;
    // Une fournée se range en sachets de rations (`band`), pas en « 2 parts ».
    const p = platParTitre.get(fait);
    const lots = etat.restes.filter((r) => r.plat === fait && r.le === j);
    lots.forEach((r, k) => { const e = p?.emits?.[Math.min(k, (p.emits.length || 1) - 1)]; if (e) { r.portions = BAND(e.band); r.garde = e.congelo ? 90 : e.gardeFrigo ?? 3; r.ou = e.congelo ? "Congélo" : "Frigo"; } });
  } else note(j, "fournee", `« ${txt} » n'a pas abouti`);
}

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
    const perdu = page.getByRole("button", { name: new RegExp(`Tout jeter au ${lieu}|Tout ce qui était au ${lieu} est perdu`) });
    if (await perdu.count()) {
      await tap(perdu); await page.waitForTimeout(300);
      const oui = page.getByRole("button", { name: /^Oui, retirer|Oui|Confirmer|perdu/ }).last();
      await tap(oui); await page.waitForTimeout(600);
      note(j, "panne", `${e.quoi} : « Tout ce qui était au ${lieu} est perdu » (T105), un geste et une confirmation`);
    } else note(j, "panne", `${e.quoi} : le geste T105 est introuvable`);
    const perdus = perdusDansLaPanne(d, j, lieu);
    for (const r of perdus) { r.jete = j; r.panne = true; etat.compte.perdusPanne = (etat.compte.perdusPanne ?? 0) + 1; }
    stats.pertesPanne = perdus.map((r) => `${r.plat} | ${r.ou} | ${r.portions} parts | depuis ${r.le}`);
  }
  if (ev.some((e) => e.type === "don")) {
    note(j, "don", "courgettes et tomates offertes : toujours aucune porte d'entrée hors liste (T114)");
    // 1,5 kg de chaque, dans l'unité du placard réel (des pièces, pas 1500 courgettes).
    for (const id of ["courgettes", "tomates"]) { const q = versBase(id, 1500, "g"); etat.reel[id] = { q: (etat.reel[id]?.q ?? 0) + q, achete: q, le: j, frais: true }; }
  }

  if (idx === 0) await poserFond(j);
  // Les jours de courses, les courses du matin, avant toute décision. LE FOND NE SE
  // RECHARGE QUE PAR LA LISTE DE L'APP (T134) : aucun réassort côté harnais.
  if (!absent && JOURS_COURSES.includes(dow)) { await page.clock.setFixedTime(new Date(`${j}T10:00:00`)); await courses(j, ev, stats); stats.coursesDuMatin = stats.articles; stats.listeMatin = stats.liste; }

  if (absent) { stats.absent = true; }
  else {
    // Les repas du jour, pour les quatre — dans le monde réel.
    stats.repas = {};
    petitDejeuner(j, stats);
    await dejeuner(j, ev, stats, [0, 6].includes(dow));
    await fournee(j, stats);
    gouter(j, stats);

    // 15 h : la pause. Décider, et lancer.
    await page.clock.setFixedTime(new Date(`${j}T15:00:00`));
    const dehors = ev.some((e) => e.type === "dehors"), malade = ev.some((e) => e.type === "malade");
    if (dehors) stats.diner = "dehors";
    else if (malade) repliMange(j, stats, "malade");
    else if (!PASSE) {
      // T127–T129 : la pause de 15 h passe par le cockpit et « Ce soir ».
      const pris = await pauseDe15h(j, ev, stats);
      if (stats.refus === undefined && pris) stats.refus = pris.refus;
      if (!pris) {
        repliMange(j, stats);
      } else {
        const p = platParTitre.get(pris.titre);
        const courseDay = JOURS_COURSES.includes(dow);
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
            r.q += q; r.achete = q; r.le = j; r.frais = FRAIS.test(rayonDe.get(id) ?? ""); etat.reel[id] = r; payer(id, q);
          }
          stats.achatsHorsApp = pris.achats.noms;
        }
        for (const e of invites) { await reglerParts(j, e.parts, stats); detour = true; }
        const invite = ev.find((e) => (e.type === "invites") || e.type === "deux");
        const t = await cuisiner(j, ev, stats, { autrement: ev.some((e) => e.type === "rate") || hasard() < 0.05, parts: invite?.parts ?? 2.5, deja: detour || pris.par === "posé" ? null : pris.titre });
        stats.diner = t ?? "rien";
        if (t) { etat.recents = [...etat.recents.slice(-10), t]; etat.manges = [...(etat.manges ?? []).slice(-20), { t, j }]; }
      }
    }
    else {
      let poses = await lirePoses();
      if (!poses.length) { await passe(j, 1, ev, stats); poses = await lirePoses(); }
      if (!poses.length) {
        repliMange(j, stats);
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

  if (!absent) {
    // Le soir, après le dîner : un dessert, parfois un apéro avant.
    await page.clock.setFixedTime(new Date(`${j}T20:15:00`));
    dessert(j, stats);
    await apero(j, ev, stats);
    await sortirDuCongelo(j, stats).catch((e) => note(j, "sortir", String(e).slice(0, 120)));
  }

  // T198 — le congélateur, chaque soir : combien de lots y vivent vraiment.
  stats.congelo = etat.restes.filter((r) => !r.jete && r.portions > 0 && r.ou === "Congélo").length;

  // Chaque dimanche : le journal de l'app (rejoué ensuite par sim/croyance.ts)
  // et la cuisine réelle, côte à côte.
  if (dow === 0 || idx === N - 1) {
    try {
      const evts = await page.evaluate(() => new Promise((ok, ko) => { const r = indexedDB.open("intendance"); r.onsuccess = () => { const q = r.result.transaction("evenements").objectStore("evenements").getAll(); q.onsuccess = () => { r.result.close(); ok(q.result); }; q.onerror = () => ko(q.error); }; r.onerror = () => ko(r.error); }));
      mkdirSync(`${OUT}/journal`, { recursive: true });
      writeFileSync(`${OUT}/journal/${j}.json`, JSON.stringify({ jour: j, evts, reel: Object.fromEntries(Object.entries(etat.reel).map(([id, r]) => [id, Math.round(r.q * 10) / 10])), reelFond: Object.fromEntries([...UNITE_ACHAT.keys()].map((id) => [id, Math.round(((etat.reel[id]?.q ?? 0) / unDuFond(id)) * 100) / 100])) }));
    } catch (e) { note(j, "journal", `export impossible : ${String(e).slice(0, 120)}`); }
  }

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
  stats.taps = taps; stats.secondes = Math.round((Date.now() - t0) / 1000);
  if (erreurs.length) stats.erreurs = [...new Set(erreurs)].slice(0, 5);
  appendFileSync(JOURNAL, JSON.stringify(stats) + "\n");
  console.log(`${j} ${["dim", "lun", "mar", "mer", "jeu", "ven", "sam"][dow]} taps=${taps} ${stats.secondes}s dîner=${stats.diner ?? "-"}${stats.carte ? ` [${stats.carte.par} #${stats.carte.pos}, ${stats.carte.achats} art.]` : ""}${stats.legume ? " (légumineuses)" : ""} q=${stats.questions ?? 0} art=${stats.articles ?? 0} refus=${(stats.refus ?? []).length} ${ev.map((e) => e.type).join(",")}${stats.repas ? `\n    ${Object.entries(stats.repas).map(([k, v]) => `${k}=${v}`).join(" · ")}` : ""}`);
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
