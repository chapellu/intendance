// Écran « Poser un plat » — T11 du backlog.
//
// L'ÉCRAN CENTRAL DE LA DIRECTION. Tout le reste de l'app existe pour que ce
// choix-là soit informé : le cadran dit ce que la semaine coûte à cet instant,
// chaque carte dit ce qu'elle y ajoute, et les deux se lisent sans quitter
// l'écran. C'est la promesse « Le comptoir » — décider avec le prix sous les
// yeux, plutôt que de le découvrir aux courses.
//
// LA MAIN EST UNE MAIN, pas une liste. Quatre cartes tirées avec une garantie
// de variété — une express, une souche, une dérivée — parce qu'un classement
// par score servirait cinq fois la même famille de plats. Elle est déterministe
// en (créneau, repioches) : elle ne bouge pas sous le doigt, et le bouton
// « Repiocher » est la seule chose qui la change.
//
// Port de `apps/proto-shell/comptoir.js` (`ecranPoser`, `carteJouable`).

import { useMemo } from "react";
import { indexDuCreneau } from "../db";
import { useCatalogue, useSavoir, useSemaine } from "../db/hooks";
import { cleRepioche, poserReglage, useNombre } from "../db/reglages";
import type { Calcul } from "../model/calcul";
import { SAUTE, type Jeu } from "../model/jeu";
import { contexte } from "../model/journal";
import { questions } from "../model/questions";
import { main, offre, type Savoir } from "../model/scoring";
import { chemin, type CleCreneau } from "../nav/routes";
import { aller } from "../nav/useRoute";
import { Demande, Jouable } from "../ui/Cartes";
import { Corps } from "../ui/Coquille";
import { fmt } from "../ui/format";
import { chiffresDeLaSemaine } from "./semaine.vue";

export function Poser({ creneau }: { creneau: CleCreneau }) {
  const { catalogue } = useCatalogue();
  const { jeu, calc, poserPlat } = useSemaine(catalogue);
  const savoir = useSavoir(catalogue, jeu);
  const repioches = useNombre(cleRepioche(creneau.jour, creneau.repas));

  // ON ATTEND LE SAVOIR, on ne propose pas sans lui — voir `useSavoir`.
  if (!jeu || !calc || !savoir || repioches === undefined) return null;
  const i = indexDuCreneau(jeu, creneau.jour, creneau.repas);
  if (i < 0) return null;

  return (
    <Contenu
      jeu={jeu}
      calc={calc}
      savoir={savoir}
      i={i}
      creneau={creneau}
      repioches={repioches}
      poserPlat={poserPlat}
    />
  );
}

function Contenu({
  jeu,
  calc,
  savoir,
  i,
  creneau,
  repioches,
  poserPlat,
}: {
  jeu: Jeu;
  calc: Calcul;
  savoir: Savoir;
  i: number;
  creneau: CleCreneau;
  repioches: number;
  poserPlat: (i: number, plat: string | null) => Promise<void>;
}) {
  const c = jeu.creneaux[i]!;
  const jour = jeu.jours[c.jour]!;
  const saute = jeu.choix[i] === SAUTE;

  const chiffres = useMemo(() => chiffresDeLaSemaine(jeu, calc), [jeu, calc]);

  // LE CALCUL LE PLUS CHER DE L'APP : `main` rejoue `calculer` pour chacun des
  // 51 plats candidats, parce que le coût marginal d'une carte ne se lit nulle
  // part ailleurs. D'où la mémoïsation stricte, et d'où T17. `jeu.slot` est
  // muté ici parce que c'est là que le modèle le lit ; le `jeu` appartient à ce
  // hook et à personne d'autre.
  const cartes = useMemo(() => {
    if (saute) return [];
    jeu.slot = i;
    jeu.repioches[i] = repioches;
    return main(jeu, 4, savoir);
  }, [jeu, i, repioches, saute, savoir]);

  // L'ENSEMBLE VIENT DE LA MAIN, L'ORDRE DU VIVIER — d'où le second `offre`,
  // qui coûte le même millième de seconde que le premier (T17) et évite de
  // faire dépendre l'ordre des questions du hasard du tirage.
  const aDemander = useMemo(() => {
    if (saute || !cartes.length) return [];
    const ctx = contexte(jeu.catalogue);
    return questions({
      catalogue: jeu.catalogue,
      ctx,
      rejeu: savoir.rejeu,
      proposes: cartes.map((x) => x.plat),
      candidats: offre(jeu, jeu.choix, i, savoir).map((x) => x.plat),
      repondu: savoir.passe.repondu,
    });
  }, [jeu, i, cartes, savoir, saute]);

  const jouer = (id: string) => {
    void poserPlat(i, id).then(() => aller({ ecran: "semaine" }));
  };

  return (
    <>
      <div className="co-cadran">
        {chiffres.map((x) =>
          x.vers ? (
            <a key={x.cle} href={chemin(x.vers)}>
              <span className="k">
                <span className="co-kicker">{x.cle}</span>
                <span style={{ color: "var(--color-accent-700)", fontWeight: 700 }}>›</span>
              </span>
              <span className="v">{x.valeur}</span>
            </a>
          ) : (
            <div key={x.cle}>
              <span className="co-kicker">{x.cle}</span>
              <div className="v">{x.valeur}</div>
            </div>
          ),
        )}
      </div>

      <Corps>
        <div className="co-note" style={{ marginBottom: "var(--space-2)" }}>
          {jour.nom} {c.label}
          {c.emporte ? " · doit voyager" : ""} — les trois chiffres du haut bougent à mesure que
          vous posez.
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <a className="btn btn-secondary" href={chemin({ ecran: "parts", creneau })}>
            {fmt(jeu.parts[i] ?? jeu.catalogue.foyer.parts)} parts
          </a>
          <button
            className="btn btn-secondary"
            onClick={() => void poserPlat(i, saute ? null : SAUTE)}
          >
            {saute ? "On remange ici" : "Sauter ce repas"}
          </button>
          {/* Repiocher sur un repas sauté ne tirerait rien : le bouton
              disparaît plutôt que de ne rien faire. */}
          {saute ? null : (
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

        {/* LA QUESTION PASSE DEVANT LES CARTES, ET SEULE. Répondre change la
            main qui suit : montrer les deux ensemble, c'est montrer une main
            qu'on sait fausse — l'erreur qui a coûté les variantes B et C du
            rail (Workspace#45). */}
        {saute ? (
          <div className="co-vide">Repas sauté — rien à cuisiner, rien à acheter.</div>
        ) : aDemander[0] ? (
          <Demande question={aDemander[0]} reste={aDemander.length - 1} />
        ) : cartes.length ? (
          cartes.map((carte) => (
            <Jouable key={carte.plat.id} carte={carte} creneau={creneau} jouer={jouer} />
          ))
        ) : (
          <div className="co-vide">Plus de cartes pour ce créneau.</div>
        )}
      </Corps>
    </>
  );
}

