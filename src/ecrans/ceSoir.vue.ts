// Ce que la proposition de 15 h DIT — T128 et T129.
//
// Le modèle (`model/pause.ts`) rend des rangs, des lots et des articles ; ici on
// écrit les phrases, une fois, pour les deux écrans qui les montrent : « Ce
// soir » (et l'ouverture du fil, qui l'embarque) et la ligne du cockpit. Une
// phrase écrite deux fois finit par dire deux choses (en-tête de
// `ui/phrases.ts`), et le cockpit qui annonce « rien à acheter » au-dessus d'une
// carte qui dit « il manque : crème » serait exactement ce mensonge-là.

import { FORMATS_FAMILIERS, heureDuDiner, type CarteDuSoir, type LotMange, type PropositionDuSoir } from "../model/pause";
import { duree, hhmm } from "../ui/format";
import { bandeEnMots } from "../ui/phrases";

/** Un type émis, dit en français — même trou de libellé que partout ailleurs
 *  (noté au backlog depuis T15) : les tirets tombent, l'accent ne vient pas. */
export const nomDuType = (type: string): string => type.replace(/-/g, " ");

/** « de lentilles », « d'escalopes » — l'élision que l'œil attend. */
export const de = (nom: string): string => (/^[aeiouyéèêàâîôûœ]/i.test(nom) ? `d’${nom}` : `de ${nom}`);

/** Quand un lot doit être fini, en mots du calendrier. */
const quand = (jours: number): string =>
  jours <= 0 ? "aujourd’hui" : jours === 1 ? "demain" : `d’ici ${jours} jours`;

/**
 * Un lot du dépôt, dit comme on le dirait en ouvrant le frigo.
 *
 * LE CONGÉLATEUR SE DIT EN REPAS, LE FRIGO EN DÉLAI. « 3 repas d'escalopes au
 * congélo » répond à « qu'est-ce qu'il y a » ; « le reste de lentilles est à
 * finir demain » répond à « qu'est-ce qui presse ». Ce sont les deux phrases
 * que le foyer a besoin d'entendre — « si je mets des choses là, je compte sur
 * toi pour t'en souvenir ».
 *
 * AUCUNE PHRASE NE DIT « À JETER ». Les fenêtres sont des ordres de grandeur ;
 * elles ordonnent, elles ne condamnent pas. Ce qui est passé se dit ailleurs, par
 * la tâche de T103, qui ne parle que des restes de frigo.
 */
export function phraseDuLot(l: LotMange): string {
  const nom = nomDuType(l.type);
  if (l.location === "congelo") return `${bandeEnMots(l.band)} ${de(nom)} au congélo`;
  if (l.kind === "reste-plat") return `le reste ${de(nom)} est à finir ${quand(l.joursRestants)}`;
  return `${nom} au frigo, à finir ${quand(l.joursRestants)}`;
}

/** Ce qu'il faut acheter, en une ligne — la ligne qui décide à 15 h. */
export function ligneAchats(c: CarteDuSoir): string {
  const n = c.manque.length;
  if (n === 0) return "Rien à acheter";
  const noms = c.manque.map((a) => a.nom);
  if (n === 1) return `il manque : ${noms[0]}`;
  if (n <= 3) return `il manque : ${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}`;
  return `il manque : ${noms.slice(0, 2).join(", ")} et ${n - 2} autres`;
}

/** La classe de la ligne d'achats, pour que l'œil la lise avant les mots. */
export const classeAchats = (c: CarteDuSoir): "zero" | "un" | "plusieurs" =>
  c.manque.length === 0 ? "zero" : c.manque.length === 1 ? "un" : "plusieurs";

/**
 * Quand le lancer, et ce que ça coûte devant le feu.
 *
 * L'HEURE DE DÉBUT, PAS LA DURÉE. À la pause, « 1 h 10 » oblige à compter ;
 * « à lancer avant 16h50 » est la réponse. Et le temps DEVANT LE FEU, parce
 * qu'une pause dure dix à quinze minutes : un plat de deux heures dont un quart
 * d'heure actif se lance très bien.
 */
export function ligneHeure(c: CarteDuSoir): string {
  const devant = `${duree(c.horaire.actif)} devant le feu`;
  if (!c.tient) return `prêt vers ${hhmm(c.pret)} · ${devant}`;
  const total = c.parRattrapage ? c.horaire.rattrape : c.horaire.total;
  const avant = `à lancer avant ${hhmm(heureDuDiner() - total)}`;
  return c.parRattrapage ? `${avant}, trempage rattrapé · ${devant}` : `${avant} · ${devant}`;
}

const FORMAT_EN_MOTS: Record<string, string> = { quiche: "une quiche", soupe: "une soupe", gratin: "un gratin" };

/**
 * UNE raison, la première vraie — la règle de la carte du fil (« les empiler
 * transformerait un argument en plaidoirie »). L'ordre est celui du rang.
 */
export function raison(c: CarteDuSoir): string | null {
  if (c.presse) return "placard" in c.presse ? `sauve ${nomDuType(c.presse.placard)}, qui se perd` : `finit ${phraseDuLot(c.presse)}`;
  if (c.attend) return `mange ${phraseDuLot(c.attend)}`;
  if (c.recent) return "déjà mangé ces trois derniers jours";
  const a = c.plat.apports;
  if (a.proteine === "legumineuse" || a.feculent === "legumineuse") return "aux légumineuses";
  if (c.plat.format && FORMATS_FAMILIERS.has(c.plat.format)) return `${FORMAT_EN_MOTS[c.plat.format]}, comme d’habitude`;
  return null;
}

/** L'accompagnement qui n'est pas là, dit sans compter (voir `ici.ceQuiManque`). */
export const ligneACote = (c: CarteDuSoir): string =>
  c.aCote.length ? `à côté : ${c.aCote.map((a) => a.nom).join(", ")} — ou ce que vous avez` : "";

/** La phrase sous le titre de « Ce soir ». */
export function chapeau(p: PropositionDuSoir): string {
  return p.jourDeCourses
    ? "Jour de courses : ce qui demande des achats est permis."
    : "Ce qui se fait avec ce qui est là, d’abord.";
}

/**
 * Ce qui attend, en une ligne — deux lots au plus, le plus pressé d'abord.
 *
 * DEUX, PARCE QUE LA LIGNE TIENT SUR UN TÉLÉPHONE ; l'inventaire porte le reste.
 */
export function ceQuiAttend(lots: readonly LotMange[]): string {
  return lots.slice(0, 2).map(phraseDuLot).join(" · ");
}

/**
 * La ligne « Ce soir » du cockpit, quand rien n'est posé — T129.
 *
 * ELLE NOMME LE PLAT, ET CE QUI ATTEND. « Rien n'est posé — Poser un plat » a
 * été la tâche de tête 364 jours sur 364 de l'année simulée, sans jamais
 * mentionner les trois portions d'escalopes au congélateur. Une tâche qui dit
 * la même chose tous les jours apprend à ne plus lire le cockpit (T16) ; celle-
 * ci dit ce soir, et ce qu'il y a.
 *
 * `null` quand la proposition est vide — le cockpit retombe alors sur sa phrase
 * d'avant, qui reste vraie.
 */
export function ligneDuCockpit(p: PropositionDuSoir): { titre: string; detail: string } | null {
  const c = p.cartes[0];
  if (!c) return null;
  // CE QUE LA CARTE DIT DÉJÀ NE SE RÉPÈTE PAS : si le plat finit le lot en tête
  // de ce qui attend, la raison le dit, et la queue de ligne passe au suivant.
  const dit = c.presse && "type" in c.presse ? c.presse.type : c.attend?.type;
  const attend = ceQuiAttend(p.attend.filter((l) => l.type !== dit));
  const pourquoi = raison(c);
  return {
    titre: `Ce soir : ${c.plat.titre}`,
    detail: [ligneAchats(c), ligneHeure(c), pourquoi, attend].filter(Boolean).join(" · "),
  };
}
