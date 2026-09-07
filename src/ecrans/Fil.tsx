// Écran « Le fil » — T49, T50, T51 du backlog (Workspace#45).
//
// LA PASSE DE PLANIFICATION, ET LA PREMIÈRE CHOSE DE L'APP QUI A UN DÉBUT ET UNE
// FIN. Jusqu'ici on posait un plat, puis on retrouvait soi-même le créneau
// suivant dans la grille : la cérémonie existait dans la tête de
// l'utilisateur et nulle part dans le logiciel.
//
// TROIS RÈGLES, ET ELLES VIENNENT TOUTES DU PROTOTYPE (branche `proto/rail-45`,
// trois variantes montées côte à côte dans la coquille réelle) :
//
//   1. L'horizon d'abord, en crans. On répond du pouce, avant de commencer.
//   2. Un pas à la fois, plein écran. Ce n'est pas un solveur de semaine.
//   3. Une question est un pas. Une seule file, jamais deux — parce que
//      répondre change la main qui suit.
//
// Les points de progression en haut sont des BOUTONS : on retourne à *jeudi
// déjeuner*, on ne recule pas « d'un ». C'est pour ça qu'il n'y a pas de bouton
// « précédent » sur cet écran, et que son absence est une décision.

import { useEffect, useMemo, useState } from "react";
import { indexDuCreneau, jourISO } from "../db";
import { useCatalogue, useSavoir, useSemaine } from "../db/hooks";
import { cleRepioche, poserReglage, useNombre, useObjet } from "../db/reglages";
import {
  CLE_FIL, CRANS, cleDuPas, decidesDuFil, itineraire, pasSuivant, premierPas, type Fil as Passe,
} from "../model/fil";
import { SAUTE, type Jeu } from "../model/jeu";
import { contexte } from "../model/journal";
import { questions } from "../model/questions";
import { main, offre, type Savoir } from "../model/scoring";
import { chemin, type CleCreneau } from "../nav/routes";
import { aller } from "../nav/useRoute";
import { Demande, Jouable } from "../ui/Cartes";
import { Corps } from "../ui/Coquille";
import { avancement, libelleCran, pointsDuFil, resteAPoser } from "./fil.vue";

type Poser = (i: number, plat: string | null) => Promise<void>;

export function Fil({ creneau }: { creneau?: CleCreneau }) {
  const { catalogue } = useCatalogue();
  const { jeu, poserPlat } = useSemaine(catalogue);
  const savoir = useSavoir(catalogue, jeu);
  const passe = useObjet<Passe>(CLE_FIL);

  // CE QUE « JE NE PLANIFIE PAS CELUI-LÀ » LAISSE DERRIÈRE LUI : rien en base,
  // et un ensemble ici. T51 est catégorique — ce bouton n'écrit pas, il
  // raccourcit la passe, c'est de la navigation. Donc ça ne survit pas au
  // rechargement, et c'est exact : aucune décision n'a été prise, il n'y a rien
  // à retrouver.
  const [passes, setPasses] = useState<ReadonlySet<string>>(() => new Set());

  if (!jeu || !savoir || passe === undefined) return null;
  if (!passe) return <Ouverture jeu={jeu} />;

  const decides = decidesDuFil(jeu, passe);

  if (!creneau) return <Reprise passe={passe} decides={decides} passes={passes} />;

  const i = indexDuCreneau(jeu, creneau.jour, creneau.repas);
  if (i < 0) return <Reprise passe={passe} decides={decides} passes={passes} />;

  return (
    <Pas
      jeu={jeu}
      savoir={savoir}
      passe={passe}
      decides={decides}
      passes={passes}
      ignorer={(cle) => setPasses(new Set([...passes, cle]))}
      creneau={creneau}
      i={i}
      poserPlat={poserPlat}
    />
  );
}

/* ═══════════════════════════════════════════════════════════ l'ouverture */

/**
 * « Combien de repas ? », en crans.
 *
 * PAS UN CHAMP LIBRE, et c'est la première décision du fil. Un champ demande un
 * clavier, donc une intention chiffrée, donc une décision de plus au moment
 * précis où on voulait juste commencer. Cinq boutons se répondent du pouce.
 */
function Ouverture({ jeu }: { jeu: Jeu }) {
  const demarrer = (horizon: number) => {
    const creneaux = itineraire(jeu, horizon);
    if (!creneaux.length) return;
    void poserReglage(CLE_FIL, { horizon, creneaux } satisfies Passe).then(() =>
      aller({ ecran: "fil", creneau: creneaux[0]! }),
    );
  };

  const libres = itineraire(jeu, 99).length;

  return (
    <Corps>
      <div className="co-h">Combien de repas ?</div>
      <p className="co-note">
        Le fil pose les repas un par un, dans l’ordre. Ce qu’il ne couvre pas reste
        hors du plan — sans rien réclamer.
      </p>

      <div className="co-crans">
        {CRANS.map((n) => (
          <button
            key={n}
            className="btn btn-secondary"
            onClick={() => demarrer(n)}
            disabled={libres === 0}
          >
            {libelleCran(n)}
          </button>
        ))}
      </div>

      {/* ON DIT, ON NE GRISE PAS — un bouton grisé n'explique jamais pourquoi.
          Sauf quand il n'y a rien du tout : là il n'y a pas de passe à lancer. */}
      {resteAPoser(libres, Math.max(...CRANS)) ? (
        <p className="co-note" style={{ marginTop: "var(--space-3)" }}>
          {resteAPoser(libres, Math.max(...CRANS))}
        </p>
      ) : null}

      <a
        className="btn btn-ghost btn-block"
        href={chemin({ ecran: "semaine" })}
        style={{ marginTop: "var(--space-3)" }}
      >
        Voir la semaine
      </a>
    </Corps>
  );
}

/* ══════════════════════════════════════════════════════ reprendre, ou finir */

/**
 * Une passe rouverte reprend où elle en était — on ne redemande pas l'horizon.
 *
 * La redirection passe par `replace` : une reprise n'a rien à faire dans
 * l'historique du pouce, sinon le geste de retour d'iOS ramènerait sur une
 * URL qui redirige aussitôt, en boucle.
 */
function Reprise({
  passe,
  decides,
  passes,
}: {
  passe: Passe;
  decides: ReadonlySet<string>;
  passes: ReadonlySet<string>;
}) {
  const suite = premierPas(passe, decides, passes);

  useEffect(() => {
    if (suite) aller({ ecran: "fil", creneau: suite }, true);
  }, [suite]);

  if (suite) return null;
  return <Fin passe={passe} faits={decides.size} />;
}

/**
 * La fin de la passe.
 *
 * T53 EST TOMBÉ, ET CET ÉCRAN EN EST LA CONSÉQUENCE. Il devait fermer le fil sur
 * deux canaux — le frais contre la réserve — mais Workspace#44 a refusé le
 * partage : *« as we have not yet integrated channels keep stuff simple »*, une
 * seule liste dans `rayons.ordre`, comme aujourd'hui. Un canal est un endroit
 * où l'on va, jamais un écran de l'app. Ce qui reste vrai de #44 tient en une
 * phrase, et c'est elle qu'on écrit ici : la cérémonie pose des créneaux, les
 * créneaux font la liste.
 */
function Fin({ passe, faits }: { passe: Passe; faits: number }) {
  return (
    <Corps>
      <div className="co-h">La passe est finie</div>
      <p className="co-note">{avancement(passe.creneaux.length, faits)}.</p>
      <p className="co-note">
        La liste de courses vient de ces repas-là, et de rien d’autre.
      </p>

      <a
        className="btn btn-primary btn-block"
        href={chemin({ ecran: "courses" })}
        style={{ marginTop: "var(--space-3)" }}
      >
        Voir la liste
      </a>
      <a className="btn btn-secondary btn-block" href={chemin({ ecran: "semaine" })}>
        Voir la semaine
      </a>
      <button
        className="btn btn-ghost btn-block"
        onClick={() => void poserReglage(CLE_FIL, null).then(() => aller({ ecran: "fil" }, true))}
      >
        Fermer le fil
      </button>
    </Corps>
  );
}

/* ═════════════════════════════════════════════════════════════════ un pas */

function Pas({
  jeu,
  savoir,
  passe,
  decides,
  passes,
  ignorer,
  creneau,
  i,
  poserPlat,
}: {
  jeu: Jeu;
  savoir: Savoir;
  passe: Passe;
  decides: ReadonlySet<string>;
  passes: ReadonlySet<string>;
  ignorer: (cle: string) => void;
  creneau: CleCreneau;
  i: number;
  poserPlat: Poser;
}) {
  const repioches = useNombre(cleRepioche(creneau.jour, creneau.repas));
  const c = jeu.creneaux[i]!;
  const jour = jeu.jours[c.jour]!;

  const cartes = useMemo(() => {
    if (repioches === undefined) return [];
    jeu.slot = i;
    jeu.repioches[i] = repioches;
    return main(jeu, undefined, savoir);
  }, [jeu, i, repioches, savoir]);

  // L'ensemble vient de la main, l'ordre du vivier — voir `model/questions.ts`.
  const aDemander = useMemo(() => {
    if (!cartes.length) return [];
    return questions({
      catalogue: jeu.catalogue,
      ctx: contexte(jeu.catalogue),
      rejeu: savoir.rejeu,
      proposes: cartes.map((x) => x.plat),
      candidats: offre(jeu, jeu.choix, i, savoir).map((x) => x.plat),
      repondu: savoir.passe.repondu,
    });
  }, [jeu, i, cartes, savoir]);

  // Le modèle connaît des dates, l'écran veut des mots — « jeu. déjeuner » et
  // non « 2026-09-10 dejeuner ». La table se construit une fois par semaine,
  // pas une fois par point.
  const noms = useMemo(() => {
    const m = new Map<string, { jour: string; repas: string }>();
    for (const x of jeu.creneaux) {
      const j = jeu.jours[x.jour];
      if (j) m.set(cleDuPas({ jour: jourISO(j.date), repas: x.repas }), { jour: j.nom, repas: x.label });
    }
    return m;
  }, [jeu]);

  const points = useMemo(
    () =>
      pointsDuFil({
        creneaux: passe.creneaux,
        nommer: (x) => noms.get(cleDuPas(x)) ?? { jour: x.jour, repas: x.repas },
        decides,
        courant: creneau,
        questions: aDemander,
      }),
    [passe, noms, decides, creneau, aDemander],
  );

  const suivant = () => {
    const s = pasSuivant(passe, decides, passes, creneau);
    aller(s ? { ecran: "fil", creneau: s } : { ecran: "fil" });
  };

  const poser = (plat: string | null) => {
    void poserPlat(i, plat).then(suivant);
  };

  if (repioches === undefined) return null;

  return (
    <Corps>
      <Points points={points} />

      <div className="co-note" style={{ marginBottom: "var(--space-2)" }}>
        {jour.nom} {c.label}
        {c.emporte ? " · doit voyager" : ""} — {avancement(passe.creneaux.length, decides.size)}
      </div>

      {/* LA QUESTION PREND L'ÉCRAN, LA MAIN ATTEND DERRIÈRE — T50. C'est la
          règle qui a fait gagner la variante A : afficher les cartes pendant
          qu'on demande, c'est afficher une main qu'on sait fausse. */}
      {aDemander[0] ? (
        <Demande question={aDemander[0]} reste={aDemander.length - 1} />
      ) : cartes.length ? (
        cartes.map((carte) => (
          <Jouable key={carte.plat.id} carte={carte} creneau={creneau} jouer={poser} />
        ))
      ) : (
        <div className="co-vide">Plus de cartes pour ce créneau.</div>
      )}

      <div className="co-pied-fil">
        <button className="btn btn-secondary" onClick={() => poser(SAUTE)}>
          On ne mange pas là
        </button>
        {/* CELUI-CI N'ÉCRIT RIEN, et c'est tout l'objet de T51. « Je ne
            planifie pas ce repas » n'est pas un troisième état du modèle :
            c'est une décision qu'on n'a pas prise, et on passe. */}
        <button
          className="btn btn-ghost"
          onClick={() => {
            ignorer(cleDuPas(creneau));
            suivant();
          }}
        >
          Pas celui-là
        </button>
        {aDemander.length ? null : (
          <button
            className="btn btn-ghost"
            onClick={() =>
              void poserReglage(cleRepioche(creneau.jour, creneau.repas), repioches + 1)
            }
          >
            Repiocher ⟳
          </button>
        )}
      </div>
    </Corps>
  );
}

/** Les points de progression. Des boutons vers une destination NOMMÉE — pas une
 *  jauge, pas un « précédent ». */
function Points({ points }: { points: ReturnType<typeof pointsDuFil> }) {
  return (
    <nav className="co-points" aria-label="Progression du fil">
      {points.map((p) =>
        p.creneau ? (
          <a
            key={p.cle}
            className={`pt ${p.etat}`}
            href={chemin({ ecran: "fil", creneau: p.creneau })}
            aria-current={p.etat === "courant" ? "step" : undefined}
          >
            {p.label}
          </a>
        ) : (
          <span key={p.cle} className={`pt question ${p.etat}`}>
            {p.label} ?
          </span>
        ),
      )}
    </nav>
  );
}
