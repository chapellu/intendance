// Le réveil de l'onglet — T146.
//
// L'ONGLET RESTE OUVERT LA NUIT. Une PWA qu'on rallume le matin ne redémarre
// pas : elle reprend l'écran de la veille, et rien ne le redessine tant qu'on
// n'y touche pas. Le cockpit montrait donc hier — et sa ligne « Fournée »
// ouvrait le goûter d'hier, « Ce créneau n'est plus là » (l'année simulée,
// run 9 : cinq fournées et deux midis perdus ainsi). Revenir sur l'onglet
// (`visibilitychange`, `focus`, `pageshow`) redessine tout ce qui lit
// l'heure : `useSemaine` repart de `new Date()`, et le report comme les
// routines roulent au changement de jour.

import { useEffect, useState } from "react";

/** La minute courante — l'unité du redessin : deux réveils dans la même
 *  minute ne redessinent qu'une fois (React ignore un état inchangé). */
export const minuteDe = (t: number): number => Math.floor(t / 60_000);

/** Branche `rappel` sur les réveils de l'onglet ; rend de quoi se débrancher.
 *  Un onglet caché ne réveille rien. */
export function ecouterLeReveil(
  doc: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">,
  win: Pick<Window, "addEventListener" | "removeEventListener">,
  rappel: (minute: number) => void,
): () => void {
  const f = () => {
    if (doc.visibilityState !== "hidden") rappel(minuteDe(Date.now()));
  };
  doc.addEventListener("visibilitychange", f);
  win.addEventListener("focus", f);
  win.addEventListener("pageshow", f);
  return () => {
    doc.removeEventListener("visibilitychange", f);
    win.removeEventListener("focus", f);
    win.removeEventListener("pageshow", f);
  };
}

/** Redessine le composant à chaque réveil de l'onglet. */
export function useReveil(): number {
  const [minute, setMinute] = useState(() => minuteDe(Date.now()));
  useEffect(() => ecouterLeReveil(document, window, setMinute), []);
  return minute;
}
