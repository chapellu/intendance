// Écran « Posés » — la courte liste de ce qu'on a choisi.
//
// Né d'un retour du 21/09/2026 : « I've selected 3 recipes but I have nowhere
// to check them. » Il avait raison, et la cause est écrite dans `nav/jours.ts` :
// T88 a éteint l'agenda, qui était le seul écran à nommer les plats posés. Tout
// ce qui restait en comptait sans jamais les dire.
//
// LA GRILLE N'EST PAS RALLUMÉE POUR AUTANT — voir `poses.vue.ts`. Quatorze
// cases dont douze vides, c'est précisément ce dont on a demandé à être
// débarrassé ; trois lignes, c'est ce qu'on demande à relire.

import { useCatalogue, useSemaine } from "../db/hooks";
import { JOURS_VISIBLES } from "../nav/jours";
import { chemin } from "../nav/routes";
import { Corps } from "../ui/Coquille";
import { duree, fmt } from "../ui/format";
import { phraseDesPoses, vueDesPoses } from "./poses.vue";

export function Poses() {
  const { catalogue } = useCatalogue();
  const { jeu, calc } = useSemaine(catalogue);
  if (!jeu || !calc) return null;
  const vue = vueDesPoses(jeu, calc);

  return (
    <Corps>
      <div className="co-kicker">{phraseDesPoses(vue)}</div>
      <div className="co-note" style={{ margin: "var(--space-1) var(--space-1) var(--space-3)" }}>
        {vue.lignes.length
          ? /* LE TEMPS TOTAL EST LA SEULE AGRÉGATION QUI VAILLE ICI. « 2 h de
               cuisine » est ce qu'on veut savoir en relisant ses choix — le
               reste (articles, lots) a déjà ses écrans, et les répéter ferait
               de celui-ci un second cockpit. */
            `${duree(vue.minutes)} de cuisine en tout.`
          : "Le fil pose les repas un par un ; ce qu’il pose s’affichera ici."}
      </div>

      {vue.lignes.map(({ slot: s, jour }) => (
        <div key={s.id} className="co-lot">
          <span style={{ flex: 1 }}>
            <div className="nom">{s.plat!.titre}</div>
            <div className="ou">
              {/* LE LABEL DU CRÉNEAU EN PREMIER, parce que c'est lui qui
                  répondait à la question qu'on n'avait pas pu poser : un
                  dessert posé sur « DESSERT » n'est pas un dîner manqué. */}
              {s.label.toUpperCase()}
              {JOURS_VISIBLES ? ` · ${jour}` : ""}
              {s.partsRegle ? ` · ${fmt(s.parts)} parts` : ""}
              {s.emporte ? " · en gamelle" : ""}
            </div>
            {s.souci ? <div className="ou" style={{ fontWeight: 700 }}>{s.souci}</div> : null}
            <div style={{ display: "flex", gap: "var(--space-1)", marginTop: 4 }}>
              {/* « VOIR LA RECETTE » EST LE GESTE QU'ON VENAIT CHERCHER : on
                  relit ses choix pour savoir ce qu'on a décidé de cuisiner. */}
              <a
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "2px 8px" }}
                href={chemin({ ecran: "cuisiner", creneau: s.creneau })}
              >
                Voir la recette
              </a>
              {/* Et « changer » ferme la boucle du même retour : l'un des trois
                  plats n'était pas celui qu'on croyait avoir pris. */}
              <a
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "2px 8px" }}
                href={chemin({ ecran: "poser", creneau: s.creneau })}
              >
                Changer
              </a>
            </div>
          </span>
          <span>
            {/* Un plat à zéro minute n'est pas gratuit, il est déjà cuisiné :
                c'est une part qu'on réchauffe, et ça se dit. Même phrase que
                dans la grille, et c'est voulu. */}
            <div className="q">{s.minutes === 0 ? "à réchauffer" : duree(s.minutes)}</div>
          </span>
        </div>
      ))}

      <a
        className="btn btn-primary btn-block"
        style={{ marginTop: "var(--space-4)" }}
        href={chemin({ ecran: "fil" })}
      >
        Poser un plat de plus
      </a>
      {vue.restent ? (
        <div className="co-note" style={{ margin: "var(--space-2) var(--space-1) 0" }}>
          {vue.restent > 1 ? `${vue.restent} repas restent` : "1 repas reste"} sans décision. Rien
          ne les réclame&nbsp;: ce que le fil ne couvre pas reste hors du plan.
        </div>
      ) : null}
    </Corps>
  );
}
