// CE QUI EST POSÉ NE VIEILLIT PAS — correctif du 23/09/2026.
//
// LA PLAINTE, MOT POUR MOT, quatrième journée d'usage réel :
//
//   « Can you disable link between days and recipe please. I lost recipes I
//     selected yesterday because under the hood they were linked to yesterday
//     diner. Only clean recipes when I say I'm done. »
//
// ELLE EST EXACTE, ET LA CAUSE EST ÉCRITE DANS DEUX FICHIERS QUI SE
// CONTREDISENT. `db/schema.ts` défend la clé `(jour, repas)` par un argument
// qui était juste : « une décision appartient à mercredi 19 août, dîner »,
// donc persister l'index du créneau ferait déménager le gratin de trois jours
// quand la semaine roule. Puis T88 a éteint l'agenda (`nav/jours.ts`) : plus
// rien ne montre ni ne demande le jour, et poser un plat le pose « sur le pas
// où le fil en est ». La prémisse est tombée ce jour-là. Personne n'a plus
// jamais choisi mercredi ; la date est devenue une COORDONNÉE INTERNE, et une
// coordonnée interne n'a pas le droit de détruire une décision.
//
// CE QUI SE PASSAIT, CHAQUE NUIT. La fenêtre est un rail glissant de sept
// jours qui commence aujourd'hui (`creerJeu`), et `useSemaine` ne lit que cette
// plage. Les plats posés la veille sur le jour 0 tombaient donc sous la borne
// basse à minuit. Ils n'étaient pas effacés — ils sont toujours en base, c'est
// ce que promet `decisionsAvant` — mais aucun écran ne pouvait plus les
// atteindre, ce qui, vu du téléphone, ne se distingue en rien d'une perte.
// Une journée d'avance se payait d'une journée de choix.
//
// ────────────────────────────────────────────────────────────────────────────
// ON REPORTE, ON NE RALLONGE PAS LA FENÊTRE.
//
// L'autre chemin était de faire commencer la semaine au plus vieux jour encore
// posé. Il rallume ce que T88 a éteint : le fil proposerait de poser sur des
// créneaux d'hier, « aujourd'hui » désignerait avant-hier, et la fraîcheur du
// chaînage se compterait depuis une date qu'on aurait rendue présente. On
// déplace donc la DÉCISION vers la fenêtre, plutôt que la fenêtre vers la
// décision — c'est le seul des deux gestes qui laisse les dates dire la vérité.
//
// CE QUI S'EFFACE ICI, ET C'EST TOUT :
//   — un créneau DÉJÀ CUISINÉ. Le journal en porte l'événement ; le report le
//     ressusciterait en « à cuisiner », et la liste de courses le recompterait.
//     Cuisiner EST le « j'ai fini » du plat, dit par le geste plutôt que par un
//     bouton ;
//   — un repas SAUTÉ, et une ligne qui ne porte que des parts. Ni l'un ni
//     l'autre n'est une recette — « on ne mange pas là » un jour révolu ne se
//     reporte pas au mardi suivant.
// Tout le reste attend le geste explicite (`toutOublier`, `oublier`).
//
// CE QUI NE TROUVE PAS DE PLACE N'EST PAS SUPPRIMÉ. Une fenêtre entièrement
// posée ne laisse nulle part où reporter ; la ligne reste alors en base, sous
// son ancien jour, et repassera au prochain report. Perdre en silence est
// précisément ce qu'on répare : on ne va pas le refaire à l'autre bout.

import { convient, SAUTE, sePioche, type Jeu } from "../model/jeu";
import { heureDe } from "../model/heures";
import { cleDuCreneau } from "./semaine";
import { jourISO, type Base, type DecisionCreneau } from "./schema";

export interface Report {
  /** Des décisions d'hier qui ont retrouvé une place aujourd'hui. */
  reportees: number;
  /** Cuisinées, sautées, ou sans plat : elles ont eu lieu ou n'ont rien à dire. */
  closes: number;
  /** Faute de place libre. Toujours en base, jamais perdues. */
  bloquees: number;
}

const RIEN: Report = { reportees: 0, closes: 0, bloquees: 0 };

/** L'ordre du doigt, pas celui de la clé primaire. `cle` est `jour|repas`, donc
 *  Dexie rend « dejeuner » avant « diner » avant « petit-dejeuner » : l'ordre
 *  alphabétique du français, qui n'est pas celui des repas. Deux plats reportés
 *  dans le désordre atterriraient croisés. */
const chronologique = (a: DecisionCreneau, b: DecisionCreneau): number =>
  a.jour === b.jour ? heureDe(a.repas) - heureDe(b.repas) : a.jour < b.jour ? -1 : 1;

/**
 * Ramène dans la fenêtre courante tout ce qui est posé en amont d'elle.
 *
 * `jeu` EST LA FENÊTRE, et c'est pour ça qu'aucune date n'est passée à côté :
 * le squelette que `useSemaine` a construit dit à lui seul où commence
 * aujourd'hui et quelles places existent. Un second paramètre `aujourdhui`
 * pourrait le contredire, et le jour où il le ferait, le report déplacerait des
 * plats hors de l'écran qui les affiche.
 *
 * TOUT EN UNE TRANSACTION. Un report est un déménagement : écrire la nouvelle
 * ligne sans effacer l'ancienne duplique le plat à chaque ouverture, effacer
 * sans écrire est la perte qu'on répare. Un rechargement entre les deux est un
 * cas ordinaire sur un téléphone, pas un cas rare.
 */
export async function reporterLesPoses(base: Base, jeu: Jeu): Promise<Report> {
  const bornes = jeu.jours.map((j) => jourISO(j.date));
  const debut = bornes[0];
  const fin = bornes.at(-1);
  if (!debut || !fin) return { ...RIEN };

  return base.transaction("rw", base.creneaux, base.evenements, async () => {
    const anciennes = await base.creneaux.where("jour").below(debut).toArray();
    // LE CHEMIN CHAUD EST CELUI OÙ IL N'Y A RIEN À FAIRE : on ouvre l'app
    // plusieurs fois par jour, et une seule de ces ouvertures franchit minuit.
    // Deux lectures de plus à chaque fois, pour rien, se paieraient sur le
    // premier rendu — celui qu'on attend déjà.
    if (!anciennes.length) return { ...RIEN };

    const evts = await base.evenements.where("jour").below(debut).toArray();
    const cuits = new Set(
      evts.filter((e) => e.sorte === "cuisine").map((e) => `${e.jour}|${e.repas}`),
    );

    const occupes = new Set(
      (await base.creneaux.where("jour").between(debut, fin, true, true).toArray()).map((d) => d.cle),
    );

    // Les places où un plat se pose, dans l'ordre où on les mangera. `routine`
    // n'en est pas : on ne pioche pas une carte pour son petit-déjeuner.
    const libres = jeu.creneaux
      .map((_, i) => i)
      .filter((i) => sePioche(jeu.creneaux[i]!.nature))
      .filter((i) => {
        const k = cleDuCreneau(jeu, i);
        return k !== null && !occupes.has(k);
      });

    const bilan: Report = { ...RIEN };

    for (const d of [...anciennes].sort(chronologique)) {
      if (d.plat === null || d.plat === SAUTE || cuits.has(d.cle)) {
        await base.creneaux.delete(d.cle);
        bilan.closes++;
        continue;
      }

      // LE MÊME REPAS D'ABORD : un dîner d'hier redevient un dîner, pas le
      // premier créneau venu. `convient()` ne l'exigerait pas — il accepte un
      // plat sur midi comme sur le soir — mais l'app a déjà changé le jour sous
      // le doigt, et changer aussi le repas ferait deux surprises au lieu
      // d'une. Le repli n'existe que pour un repas que la fenêtre ne porte plus
      // (les exceptions de `creneaux.jours`), et là le plat décide.
      const plat = jeu.plats[d.plat] ?? null;
      let n = libres.findIndex((i) => jeu.creneaux[i]!.repas === d.repas);
      if (n < 0 && plat) n = libres.findIndex((i) => convient(jeu, plat, i));
      if (n < 0) {
        bilan.bloquees++;
        continue;
      }

      const i = libres.splice(n, 1)[0]!;
      const cle = cleDuCreneau(jeu, i)!;
      await base.creneaux.put({
        cle,
        jour: cle.split("|")[0]!,
        repas: jeu.creneaux[i]!.repas,
        plat: d.plat,
        // LES PARTS SUIVENT LE PLAT. Elles ont été réglées pour ce dîner-là —
        // « on est six ce soir » — et le dîner n'a pas changé, seule sa
        // coordonnée a bougé. Les remettre à `null` obligerait à retaper un
        // chiffre qu'on n'a jamais annulé.
        parts: d.parts,
        maj: Date.now(),
      });
      await base.creneaux.delete(d.cle);
      bilan.reportees++;
    }

    return bilan;
  });
}
