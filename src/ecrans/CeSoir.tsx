// Écran « Ce soir » — T128 (Workspace#66).
//
// LA PAUSE DE 15 H, EN UN ÉCRAN. Trois ou quatre plats pour le dîner de 18 h,
// rangés par ce qu'il faut acheter contre ce qui est là ; un doigt sur l'un
// d'eux le pose en silence sur le dîner de ce soir et ouvre sa mise en place
// (T112). Pas d'horizon, pas de créneau, pas de passe : le foyer ne planifie
// pas, et la question de 15 h n'en demande pas.
//
// LE MÊME BLOC VIT EN TÊTE DE L'OUVERTURE DU FIL. « Combien de repas ? » reste
// — c'est « prévoir plusieurs repas », que Workspace#66 garde en option — mais
// il passe second : la porte de la facette s'ouvre sur ce soir.

import { useMemo, useState } from "react";
import { base, jourISO, poserCeSoir } from "../db";
import { useCatalogue, useJournal, useSavoir, useSemaine } from "../db/hooks";
import { useSortisLaVeille } from "../db/reglages";
import { joue, type Jeu } from "../model/jeu";
import { cuissonsRecentes } from "../model/journal";
import { JOURS_DE_VARIETE, proposerCeSoir, type CarteDuSoir, type PropositionDuSoir } from "../model/pause";
import { chemin, type CleCreneau } from "../nav/routes";
import { aller } from "../nav/useRoute";
import { Corps } from "../ui/Coquille";
import { duree } from "../ui/format";
import { LIBELLE_LANCER } from "../ui/phrases";
import {
  attendSansASortir,
  chapeau,
  classeAchats,
  ceQuiAttend,
  ligneACote,
  ligneAchats,
  ligneASortir,
  ligneHeure,
  raison,
} from "./ceSoir.vue";

/** Combien de cartes « voir plus » déplie. Le reste du catalogue a sa
 *  recherche (le fil) et son index (le répertoire) : ici on choisit un dîner,
 *  on ne feuillette pas. */
const PLUS = 8;

export interface CeSoirVivant {
  jeu: Jeu;
  proposition: PropositionDuSoir;
  /** Le créneau du dîner de ce soir, tel que l'URL de la fiche le nomme. */
  creneau: CleCreneau;
  /** Ce qui est posé sur ce soir, s'il y a quelque chose. */
  pose: string | null;
  /** Le dîner de ce soir a déjà été cuisiné. */
  cuisine: boolean;
  /** Pose le plat sur ce soir, PUIS ouvre sa mise en place. */
  lancer: (plat: string) => Promise<void>;
}

/**
 * La proposition de ce soir, montée sur la base.
 *
 * `null` TANT QUE TOUT N'A PAS RÉPONDU — la semaine, le journal, les
 * planchers. Une proposition calculée sur un journal pas encore lu
 * classerait sur un placard vide, puis se réordonnerait sous le doigt : la
 * « main qu'on sait fausse » de Workspace#45, obtenue par accident.
 */
export function useCeSoir(): CeSoirVivant | null {
  const { catalogue } = useCatalogue();
  const { jeu, cuisines } = useSemaine(catalogue);
  const proposition = useProposition(jeu);

  if (!jeu || !proposition || !cuisines || proposition.soir < 0) return null;
  const jour0 = jeu.jours[0]!;
  const creneau: CleCreneau = { jour: jourISO(jour0.date), repas: "diner" };
  const choix = jeu.choix[proposition.soir] ?? null;

  return {
    jeu,
    proposition,
    creneau,
    pose: joue(choix) ? choix : null,
    cuisine: cuisines.has(`${creneau.jour}|${creneau.repas}`),
    lancer: async (plat: string) => {
      // CE QUE LA CARTE DISAIT LÀ PART AVEC LE PLAT : la liste de courses ne
      // demandera que ce qu'elle disait manquer (`DecisionCreneau.ici`).
      const c = [...proposition.cartes, ...proposition.plus].find((x) => x.plat.id === plat);
      // CE SOIR SE LIT SUR L'HORLOGE AU DOIGT, pas sur la fenêtre en cache
      // (T134) : un onglet resté ouvert trois jours posait sur avant-hier.
      const ceSoir = await poserCeSoir(base, jeu.catalogue, plat, c?.ici);
      aller({ ecran: "cuisiner", creneau: ceSoir });
    },
  };
}

/**
 * La proposition seule, pour un écran qui a déjà son `jeu` — le cockpit.
 *
 * `maintenant` EST LU AU CALCUL, PAS AU MONTAGE : la proposition se refait à
 * chaque écriture de la base (une cuisson, une course rentrée), et l'heure
 * qu'elle annonce (« à lancer avant 16h50 ») suit. Elle ne se refait pas toute
 * seule à la minute, et elle n'en a pas besoin : on la lit au moment où l'on
 * ouvre l'écran.
 */
export function useProposition(jeu: Jeu | null): PropositionDuSoir | null {
  const savoir = useSavoir(jeu?.catalogue ?? null, jeu);
  const evts = useJournal();
  // CE QUI A ÉTÉ SORTI HIER SOIR a décongelé cette nuit : le « Fait » du geste
  // de la veille rend le lot cuisinable ce soir.
  const sortis = useSortisLaVeille(jeu ? jourISO(jeu.jours[0]!.date) : null);
  return useMemo(() => {
    if (!jeu || !savoir || !evts || !sortis) return null;
    const maintenant = new Date();
    const recents = cuissonsRecentes(evts, jourISO(maintenant), JOURS_DE_VARIETE);
    const mange = evts.flatMap((e) => (e.sorte === "cuisine" ? [{ plat: e.plat, jour: e.jour }] : []));
    return proposerCeSoir({ jeu, savoir, recents, maintenant, sortis, mange });
  }, [jeu, savoir, evts, sortis]);
}

/** L'écran, par sa route `#/cuisine/ce-soir`. */
export function CeSoir() {
  const vivant = useCeSoir();
  if (!vivant) return null;
  return (
    <Corps>
      <BlocDuSoir vivant={vivant} />
      <a className="btn btn-ghost btn-block" href={chemin({ ecran: "fil" })} style={{ marginTop: "var(--space-4)" }}>
        Prévoir plusieurs repas
      </a>
    </Corps>
  );
}

/**
 * Le bloc « Ce soir » — l'écran entier, ou la tête de l'ouverture du fil.
 *
 * TROIS ÉTATS DU DÎNER, ET CHACUN DIT LE SIEN : déjà cuisiné (rien à
 * proposer), posé (on le lance, ou on change), libre (la proposition).
 */
export function BlocDuSoir({ vivant }: { vivant: CeSoirVivant }) {
  const { jeu, proposition, creneau, pose, cuisine, lancer } = vivant;
  const [plus, setPlus] = useState(false);
  // UN DOIGT, UNE ÉCRITURE. Le second tap d'un double-tap tomberait sur le
  // bouton d'une autre carte pendant que la première s'écrit, et poserait un
  // autre plat par-dessus.
  const [enCours, setEnCours] = useState(false);
  const jouer = (id: string) => {
    if (enCours) return;
    setEnCours(true);
    void lancer(id).finally(() => setEnCours(false));
  };

  if (cuisine)
    return (
      <>
        <div className="co-h">Ce soir</div>
        <p className="co-note">Le dîner de ce soir est fait. Rien à lancer.</p>
      </>
    );

  const platPose = pose ? jeu.plats[pose] : undefined;
  const attend = ceQuiAttend(attendSansASortir(proposition));
  const sortir = ligneASortir(proposition);
  const autres = proposition.plus.slice(0, PLUS);

  return (
    <section aria-label="ce soir">
      <div className="co-h">Ce soir, à 18 h</div>
      <p className="co-note" style={{ margin: "var(--space-1) 0 var(--space-3)" }}>
        {chapeau(proposition)}
        {attend ? ` En attente : ${attend}.` : ""}
      </p>
      {/* CE QUI NE DÉCONGÈLE PAS D'ICI 18 H : pas une carte du soir, un geste
          pour demain — le même que le cockpit rappelle. */}
      {sortir ? (
        <p className="co-action" style={{ margin: "0 0 var(--space-3)" }}>
          {sortir}
        </p>
      ) : null}

      {platPose ? (
        <div className="co-soir pose">
          <div className="tete">
            <span className="nom">{platPose.titre}</span>
            <span className="meta">posé</span>
          </div>
          <div className="pied">
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => aller({ ecran: "cuisiner", creneau })}
            >
              Le lancer
            </button>
          </div>
          <div className="co-note" style={{ marginTop: "var(--space-2)" }}>
            Ou changer pour l’un de ceux-ci :
          </div>
        </div>
      ) : null}

      {proposition.cartes.length ? (
        proposition.cartes.map((c) => (
          <CarteSoir key={c.plat.id} c={c} creneau={creneau} jouer={jouer} enCours={enCours} />
        ))
      ) : (
        <div className="co-vide">Aucun dîner ne se fait ce soir avec ce qui est là.</div>
      )}

      {autres.length ? (
        plus ? (
          <>
            <div className="co-kicker" style={{ margin: "var(--space-4) 0 var(--space-2)" }}>
              {proposition.jourDeCourses ? "Les suivants" : "Avec des courses"}
            </div>
            {autres.map((c) => (
              <CarteSoir key={c.plat.id} c={c} creneau={creneau} jouer={jouer} enCours={enCours} />
            ))}
          </>
        ) : (
          <button
            className="btn btn-secondary btn-block"
            style={{ marginTop: "var(--space-3)" }}
            onClick={() => setPlus(true)}
          >
            Voir plus
          </button>
        )
      ) : null}
    </section>
  );
}

/**
 * Une carte du soir — plus courte que celle du fil, et c'est voulu.
 *
 * TROIS LIGNES QUI DÉCIDENT, DANS L'ORDRE DU RANG : ce qu'il faut acheter,
 * quand le lancer, et pourquoi lui. Le « Consomme / Produit » de la carte du
 * fil est la fiche d'un plat qu'on POSE pour plus tard ; ici on le lance dans
 * dix minutes, et la mise en place qui s'ouvre dira tout ce qu'il faut sortir.
 */
function CarteSoir({
  c,
  creneau,
  jouer,
  enCours,
}: {
  c: CarteDuSoir;
  creneau: CleCreneau;
  jouer: (id: string) => void;
  enCours: boolean;
}) {
  const pourquoi = raison(c);
  const aCote = ligneACote(c);
  return (
    <div className="co-soir">
      <div className="tete">
        <span className="nom">{c.plat.titre}</span>
        <span className="meta">{duree(c.parRattrapage ? c.horaire.rattrape : c.horaire.total)}</span>
      </div>
      <div className={`achats ${classeAchats(c)}`}>{ligneAchats(c)}</div>
      <div className="heure">{ligneHeure(c)}</div>
      {aCote ? <div className="heure">{aCote}</div> : null}
      {pourquoi ? <div className="co-action">{pourquoi}</div> : null}
      <div className="pied">
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={enCours} onClick={() => jouer(c.plat.id)}>
          {LIBELLE_LANCER}
        </button>
        {/* LA FICHE DU CANDIDAT, en lecture (T91) : on peut lire avant de lancer. */}
        <a className="btn btn-ghost" href={chemin({ ecran: "cuisiner", creneau, plat: c.plat.id })}>
          Fiche
        </a>
      </div>
    </div>
  );
}
