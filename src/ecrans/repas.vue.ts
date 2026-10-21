// Les trois autres repas, en phrases — T142.
//
// UNE LIGNE CHACUN, ET CALME. Le petit-déjeuner et le goûter sont des
// routines : on ne les choisit pas, on dit ce qu'ils prennent aujourd'hui
// (« Goûter : banana bread, congélo, 3 restants »). Le midi dit le reste
// d'hier quand il y en a un, et le déjeuner de Chioca sinon. Aucune de ces
// lignes n'est une tâche : elles ne comptent pas dans « N choses vous
// attendent », et elles n'ont pas de bouton.

import { jourISO } from "../db/schema";
import { bandRepas } from "../model/depot";
import { joue, type Jeu } from "../model/jeu";
import type { CarteDuSoir, PropositionDuSoir } from "../model/pause";
import { nomDuType } from "../model/plancher";
import { RESTE_DE_LA_VEILLE, typesDuGouter, type Fournee, type MidiDeDemain } from "../model/repas";
import type { Route } from "../nav/routes";

/** « + le déjeuner de demain, 3 boîtes » — la ligne de la carte du soir. */
export function phraseDuMidi(m: MidiDeDemain): string | null {
  if (m.etat === "oui") return `+ le déjeuner de demain, ${m.boites} boîte${m.boites > 1 ? "s" : ""}`;
  if (m.etat === "boites-pleines")
    return m.libres
      ? `Boîtes pleines (${m.libres} libre${m.libres > 1 ? "s" : ""}) : ce soir seulement`
      : "Boîtes pleines : ce soir seulement";
  return null;
}

export const ligneMidi = (c: CarteDuSoir): string | null => phraseDuMidi(c.midi);

/** Les parts que « Je lance ça » met de côté pour demain midi, ou rien. */
export const partsPourDemain = (c: CarteDuSoir | undefined): number | undefined =>
  c?.midi.etat === "oui" ? c.midi.parts : undefined;

export interface LigneDuJour {
  cle: "petit-dejeuner" | "dejeuner" | "demain" | "gouter" | "fournee";
  texte: string;
  route?: Route;
}

const plurielGouter = (n: number): string => `${fmt(n)} goûter${n >= 2 ? "s" : ""}`;
const fmt = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");

/** Le nom d'un type de la fournée, sans tirets — « banana bread ». */
const nomDuLot = (type: string): string => nomDuType(type);

/**
 * Les lignes calmes du cockpit : petit-déjeuner, midi, goûter, et la fournée
 * quand la pause en propose une.
 */
export function lignesDuJour(jeu: Jeu, soir: PropositionDuSoir | null): LigneDuJour[] {
  const out: LigneDuJour[] = [];
  const cat = jeu.catalogue;
  const routines = cat.creneaux.routines?.liste ?? [];
  const jour0 = jeu.jours[0];
  const iso = jour0 ? jourISO(jour0.date) : "";

  // ── le petit-déjeuner
  const pdj = routines.find((r) => r.repas === "petit-dejeuner");
  if (pdj) {
    const pain = jeu.stock.filter((l) => pdj.duDepot?.types.includes(l.type));
    const n = pain.reduce((s, l) => s + bandRepas(l.qty_band), 0);
    out.push({
      cle: "petit-dejeuner",
      texte: n
        ? `Petit-déj : porridge, pain maison (${pain.some((l) => l.location === "congelo") ? "congélo, " : ""}${fmt(n)} matin${n >= 2 ? "s" : ""})`
        : "Petit-déj : porridge, yaourt, fruit — plus de pain maison",
    });
  }

  // ── le midi
  const midi = jeu.creneaux.findIndex((c) => c.jour === 0 && c.repas === "dejeuner");
  if (midi >= 0) {
    const pose = jeu.choix[midi] ?? null;
    const de = jeu.deLaVeille?.[midi] ?? null;
    const reste = soir?.attend.find((l) => l.kind === "reste-plat" && l.location === "frigo");
    const creneau = jour0 ? { jour: iso, repas: "dejeuner" } : null;
    if (pose === RESTE_DE_LA_VEILLE && de)
      out.push({ cle: "dejeuner", texte: `Midi : le reste de ${jeu.plats[de]?.titre ?? nomDuType(de)}` });
    else if (joue(pose) && jeu.plats[pose])
      out.push({
        cle: "dejeuner",
        texte: `Midi : ${jeu.plats[pose]!.titre}`,
        ...(creneau ? { route: { ecran: "cuisiner", creneau } as Route } : {}),
      });
    else if (reste) out.push({ cle: "dejeuner", texte: `Midi : le reste au frigo — ${nomDuType(reste.type)}` });
    else if (soir?.dejeuner) {
      const d = soir.dejeuner;
      out.push({
        cle: "dejeuner",
        texte: `Midi : ${d.plat.titre} (Chioca) — ${d.manque ? `${d.manque} article${d.manque > 1 ? "s" : ""} à acheter` : "rien à acheter"}`,
        ...(creneau ? { route: { ecran: "cuisiner", creneau, plat: d.plat.id } as Route } : {}),
      });
    }
  }

  // ── demain midi, quand « Je lance ça » l'a pris au dîner de ce soir
  const demain = jeu.creneaux.findIndex((c) => c.jour === 1 && c.repas === "dejeuner");
  const deDemain = demain >= 0 && jeu.choix[demain] === RESTE_DE_LA_VEILLE ? (jeu.deLaVeille?.[demain] ?? null) : null;
  if (deDemain) {
    const soir = jeu.creneaux.findIndex((c) => c.jour === 0 && c.repas === "diner");
    const parts = soir >= 0 ? (jeu.midi?.[soir] ?? null) : null;
    out.push({
      cle: "demain",
      texte: `Demain midi : le reste de ${jeu.plats[deDemain]?.titre ?? nomDuType(deDemain)}${parts ? `, mis de côté ce soir (${fmt(parts)} parts)` : ""}`,
    });
  }

  // ── le goûter
  const gouter = routines.find((r) => r.repas === "gouter");
  if (gouter) {
    const types = typesDuGouter(cat);
    const lots = jeu.stock.filter((l) => types.has(l.type)).sort((a, b) => a.born.localeCompare(b.born));
    const premier = lots[0];
    if (premier) {
      const memes = lots.filter((l) => l.type === premier.type);
      const n = memes.reduce((s, l) => s + bandRepas(l.qty_band), 0);
      out.push({
        cle: "gouter",
        texte: `Goûter : ${nomDuLot(premier.type)} (${premier.location === "congelo" ? "congélo, " : ""}${fmt(n)} restant${n >= 2 ? "s" : ""}), yaourt, fruit`,
      });
    } else out.push({ cle: "gouter", texte: "Goûter : yaourt et fruit — plus rien de la fournée" });
  }

  // ── la fournée, quand la pause en propose une
  if (soir?.fournee) out.push(ligneDeFournee(soir.fournee, iso));
  return out;
}

const FRUITS: Record<string, string> = { banane: "les bananes", poires: "les poires", pommes: "les pommes" };

/** « Fournée : Banana bread à l'avoine — les bananes sont mûres ». */
export function phraseDeFournee(f: Fournee): string {
  const pourquoi =
    f.raison === "fruits-murs"
      ? `${f.fruits.map((x) => FRUITS[x] ?? x).join(" et ")} sont mûres`
      : f.restants
        ? `plus que ${plurielGouter(f.restants)} au congélo`
        : "plus de goûter au congélo";
  const achat = f.manque.length ? ` · il manque : ${f.manque.join(", ")}` : "";
  return `Fournée : ${f.plat.titre} — ${pourquoi}${achat}`;
}

export const ligneDeFournee = (f: Fournee, jour: string): LigneDuJour => ({
  cle: "fournee",
  texte: phraseDeFournee(f),
  ...(jour ? { route: { ecran: "cuisiner", creneau: { jour, repas: "gouter" }, plat: f.plat.id } as Route } : {}),
});
