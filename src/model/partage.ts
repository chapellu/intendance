// La liste de courses, lisible par quelqu'un d'autre.
//
// LE TROU QU'ON COMBLE. L'app est locale par construction : Dexie sur
// IndexedDB, aucun serveur, aucun compte. C'est ce qui la rend installable et
// utilisable hors ligne — et c'est aussi ce qui faisait qu'ouvrir
// `intendance.chapellu.fr` sur un second téléphone donnait une base VIDE. Or
// `household.yaml` déclare deux adultes, et une liste de courses que deux
// personnes ne peuvent pas lire est à moitié une liste de courses.
//
// CE QU'ON PARTAGE, ET CE QU'ON NE PARTAGE PAS. Le lien porte les DÉCISIONS —
// quel plat sur quel créneau, avec quelles parts — et rien d'autre. Pas la
// liste elle-même : elle se recalcule à l'arrivée, à partir du même catalogue
// que l'app sert déjà. Transporter le résultat plutôt que ses entrées, c'est se
// garantir qu'il divergera le jour où le catalogue changera — la faute que ce
// dépôt a déjà payée avec le JSON resté à 51 plats.
//
// C'EST UN INSTANTANÉ, ET LE DIRE FAIT PARTIE DE LA FONCTIONNALITÉ. Sans
// serveur, rien ne remonte : si elle coche un article, personne ne le voit. Un
// partage qui laisserait croire au contraire serait pire que pas de partage —
// deux personnes rentreraient du magasin en croyant que l'autre a pris le lait.
// L'écran d'arrivée l'écrit noir sur blanc.
//
// POURQUOI PAS DE COMPRESSION. Une semaine pleine tient en ~400 caractères une
// fois encodée, et les navigateurs acceptent des URL bien plus longues. Ajouter
// une dépendance de compression pour gagner 200 octets serait payer une pièce
// mobile pour un problème qu'on n'a pas.

import type { Choix } from "./jeu";

/** Une décision transportable. La clé est (jour, repas) comme partout ailleurs
 *  — jamais l'index du créneau, qui ne veut rien dire hors de la semaine où il
 *  a été calculé (voir `db/schema.ts`). */
export interface DecisionPartagee {
  jour: string;
  repas: string;
  plat: string;
  parts: number | null;
}

export interface Partage {
  /** La date depuis laquelle la semaine a été construite, en `AAAA-MM-JJ`.
   *  Sans elle, « mardi » à l'arrivée n'est pas le même mardi qu'au départ. */
  depuis: string;
  decisions: DecisionPartagee[];
}

/** Base64 URL-safe. `btoa` produit `+`, `/` et `=`, dont les deux premiers ont
 *  un sens dans une URL et le dernier se fait manger par certains clients de
 *  messagerie. On les remplace, et on les remet à la lecture. */
function encoder(s: string): string {
  const octets = new TextEncoder().encode(s);
  let bin = "";
  for (const o of octets) bin += String.fromCharCode(o);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decoder(s: string): string {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  const octets = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(octets);
}

/** Les décisions d'une semaine, prêtes à voyager. Les créneaux vides et les
 *  repas sautés ne partent pas : ils ne produisent aucune course. */
export function aPartager(
  depuis: string,
  creneaux: readonly { jour: number; repas: string }[],
  jours: readonly { date: Date }[],
  choix: readonly Choix[],
  parts: readonly number[],
  jourISO: (d: Date) => string,
): Partage {
  const decisions: DecisionPartagee[] = [];
  choix.forEach((plat, i) => {
    const c = creneaux[i];
    if (!plat || plat === "SAUTE" || !c) return;
    // `c.jour` est un INDEX dans la semaine, pas une date. On le résout ici, une
    // fois : un index ne veut rien dire hors de la semaine qui l'a calculé, et
    // c'est exactement la faute que `db/schema.ts` documente en tête.
    const j = jours[c.jour];
    if (!j) return;
    decisions.push({
      jour: jourISO(j.date),
      repas: c.repas,
      plat,
      parts: parts[i] ?? null,
    });
  });
  return { depuis, decisions };
}

export const encoderPartage = (p: Partage): string => encoder(JSON.stringify(p));

/**
 * Relit un partage. Rend `null` sur tout ce qui ne se comprend pas.
 *
 * UN LIEN TRONQUÉ NE DOIT PAS PRODUIRE UNE LISTE FAUSSE. Les messageries
 * coupent les URL longues, et un JSON amputé peut rester syntaxiquement
 * plausible. On vérifie donc la forme de chaque décision plutôt que de faire
 * confiance au parse : une liste de courses à moitié lue est une liste dont on
 * ne sait pas ce qui manque.
 */
export function lirePartage(brut: string): Partage | null {
  try {
    const o: unknown = JSON.parse(decoder(brut));
    if (typeof o !== "object" || o === null) return null;
    const p = o as Record<string, unknown>;
    if (typeof p["depuis"] !== "string" || !Array.isArray(p["decisions"])) return null;
    const decisions: DecisionPartagee[] = [];
    for (const d of p["decisions"]) {
      if (typeof d !== "object" || d === null) return null;
      const x = d as Record<string, unknown>;
      if (typeof x["jour"] !== "string" || typeof x["repas"] !== "string") return null;
      if (typeof x["plat"] !== "string" || !x["plat"]) return null;
      const parts = x["parts"];
      if (parts !== null && typeof parts !== "number") return null;
      decisions.push({ jour: x["jour"], repas: x["repas"], plat: x["plat"], parts });
    }
    return { depuis: p["depuis"], decisions };
  } catch {
    return null;
  }
}
