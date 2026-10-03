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
//
// C'EST DEVENU LA LISTE QUI DURE — 23/09/2026, « only clean recipes when I say
// I'm done ». `db/report.ts` fait qu'elle ne se vide plus toute seule à minuit ;
// cet écran porte les DEUX gestes qui la vident, et ils sont les seuls : le
// « Retirer » d'une ligne, et le « J'ai fini » du bas. Une liste qui ne peut
// plus rien perdre a besoin qu'on puisse la fermer, sans quoi on a échangé une
// perte silencieuse contre un encombrement définitif.

import { useState } from "react";
import { useCatalogue, useSemaine } from "../db/hooks";
import { JOURS_VISIBLES } from "../nav/jours";
import { chemin } from "../nav/routes";
import { Corps } from "../ui/Coquille";
import { duree, fmt } from "../ui/format";
import { phraseDesPoses, vueDesPoses } from "./poses.vue";

export function Poses() {
  const { catalogue } = useCatalogue();
  const { jeu, calc, oublierCreneau, toutOublierLesPoses, cuisines } = useSemaine(catalogue);
  // DEUX TEMPS POUR UN GESTE IRRÉVERSIBLE, et pas un `confirm()` : l'app est
  // installée à l'écran d'accueil d'un iPhone, où la boîte du navigateur
  // s'affiche au nom du site et se lit comme une alerte système. Le second
  // bouton est ici, dans l'écran, à l'endroit exact où le doigt vient de
  // frapper.
  const [demande, setDemande] = useState(false);
  // ON ATTEND LE JOURNAL — T100. Un ensemble vide se lit « rien n'est
  // cuisiné » : afficher la liste avant que la base ait répondu montrerait la
  // ratatouille d'hier soir, puis la ferait disparaître sous le pouce.
  if (!jeu || !calc || !cuisines) return null;
  const vue = vueDesPoses(jeu, calc, cuisines);

  return (
    <Corps>
      <div className="co-kicker">{phraseDesPoses(vue)}</div>
      {/* MUET QUAND TOUT EST CUISINÉ : le kicker vient de le dire, et la
          phrase du dessous — « un plat cuisiné est sorti de la liste » — le
          dit encore. Trois façons d'annoncer le même vide feraient chercher
          trois informations. */}
      {vue.lignes.length || !vue.cuisines ? (
        <div className="co-note" style={{ margin: "var(--space-1) var(--space-1) var(--space-3)" }}>
          {vue.lignes.length
            ? /* LE TEMPS TOTAL EST LA SEULE AGRÉGATION QUI VAILLE ICI. « 2 h de
                 cuisine » est ce qu'on veut savoir en relisant ses choix — le
                 reste (articles, lots) a déjà ses écrans, et les répéter ferait
                 de celui-ci un second cockpit. */
              `${duree(vue.minutes)} de cuisine en tout.`
            : "Le fil pose les repas un par un ; ce qu’il pose s’affichera ici."}
        </div>
      ) : null}

      {/* CE QUI EST SORTI DE LA LISTE, DIT PAR LA LISTE — T100. Un plat cuisiné
          quitte cet écran, et c'est ce qu'on a demandé ; mais une ligne qui
          disparaît sans un mot est la perte silencieuse que T94 venait de
          réparer à l'autre bout. Une phrase, pas une section : ce qui est fait
          n'a plus de geste à offrir, et lui rendre des boutons rouvrirait une
          liste qu'on vient de fermer. */}
      {vue.cuisines ? (
        <div className="co-note" style={{ margin: "0 var(--space-1) var(--space-3)" }}>
          {vue.cuisines > 1
            ? `${vue.cuisines} plats cuisinés sont sortis de la liste.`
            : "Un plat cuisiné est sorti de la liste."}
        </div>
      ) : null}

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
              {/* RETIRER EST LE « J'AI FINI » D'UNE SEULE LIGNE. « Changer »
                  mène à la main et suppose qu'on veut autre chose à la place ;
                  ici on ne veut plus rien, et jusqu'au 23/09 la seule façon de
                  le dire était d'attendre minuit — ce qui n'est plus une façon
                  de le dire. */}
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => void oublierCreneau(s.i)}
              >
                Retirer
              </button>
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

      {/* LE SEUL GESTE QUI EFFACE TOUT, ET IL EST EN BAS. Ce qui est posé
          traverse maintenant les nuits (`db/report.ts`) : la liste ne se ferme
          donc que là où on l'a lue, une fois qu'on a vu ce qu'on s'apprête à
          jeter. Le mettre en tête d'écran le placerait sous le pouce avant la
          liste elle-même. */}
      {vue.lignes.length ? (
        <div style={{ marginTop: "var(--space-6)" }}>
          {demande ? (
            <>
              <div className="co-note" style={{ margin: "0 var(--space-1) var(--space-2)" }}>
                {vue.lignes.length > 1
                  ? `Les ${vue.lignes.length} plats posés s’effacent, avec les parts réglées.`
                  : "Le plat posé s’efface, avec les parts réglées."}{" "}
                Rien n’est gardé ailleurs.
              </div>
              <button
                className="btn btn-primary btn-block"
                onClick={() => {
                  void toutOublierLesPoses();
                  setDemande(false);
                }}
              >
                Oui, j’ai fini
              </button>
              <button
                className="btn btn-ghost btn-block"
                style={{ marginTop: "var(--space-1)" }}
                onClick={() => setDemande(false)}
              >
                Annuler
              </button>
            </>
          ) : (
            <button className="btn btn-ghost btn-block" onClick={() => setDemande(true)}>
              J’ai fini — tout effacer
            </button>
          )}
        </div>
      ) : null}
    </Corps>
  );
}
