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

import { useMemo, useState } from "react";
import { indexDuCreneau } from "../db";
import { useCatalogue, useSemaine } from "../db/hooks";
import { cleRepioche, poserReglage, useNombre } from "../db/reglages";
import type { Calcul } from "../model/calcul";
import { SAUTE, type Jeu } from "../model/jeu";
import { complements, main, type Carte } from "../model/scoring";
import { chemin, type CleCreneau } from "../nav/routes";
import { aller } from "../nav/useRoute";
import { Corps } from "../ui/Coquille";
import { duree, fmt } from "../ui/format";
import { Icone } from "../ui/icones";
import {
  classeEtat, entreesDeLaCarte, marqueMarginal, sortiesDeLaCarte, vueDeLAssiette,
  vueDesComplements,
} from "./poser.vue";
import { chiffresDeLaSemaine } from "./semaine.vue";

export function Poser({ creneau }: { creneau: CleCreneau }) {
  const { catalogue } = useCatalogue();
  const { jeu, calc, poserPlat, accompagnerDe } = useSemaine(catalogue);
  const repioches = useNombre(cleRepioche(creneau.jour, creneau.repas));

  if (!jeu || !calc || repioches === undefined) return null;
  const i = indexDuCreneau(jeu, creneau.jour, creneau.repas);
  if (i < 0) return null;

  return (
    <Contenu
      jeu={jeu}
      calc={calc}
      i={i}
      creneau={creneau}
      repioches={repioches}
      poserPlat={poserPlat}
      accompagnerDe={accompagnerDe}
    />
  );
}

function Contenu({
  jeu,
  calc,
  i,
  creneau,
  repioches,
  poserPlat,
  accompagnerDe,
}: {
  jeu: Jeu;
  calc: Calcul;
  i: number;
  creneau: CleCreneau;
  repioches: number;
  poserPlat: (i: number, plat: string | null) => Promise<void>;
  accompagnerDe: (i: number, plat: string, present: boolean) => Promise<void>;
}) {
  const c = jeu.creneaux[i]!;
  const jour = jeu.jours[c.jour]!;
  const saute = jeu.choix[i] === SAUTE;

  const chiffres = useMemo(() => chiffresDeLaSemaine(jeu, calc), [jeu, calc]);
  const plat = useMemo(() => vueDeLAssiette(jeu, i), [jeu, i]);
  const briques = useMemo(
    () => (plat.vide || saute ? [] : vueDesComplements(complements(jeu, i))),
    [jeu, i, plat.vide, saute],
  );

  // LE CALCUL LE PLUS CHER DE L'APP : `main` rejoue `calculer` pour chacun des
  // 51 plats candidats, parce que le coût marginal d'une carte ne se lit nulle
  // part ailleurs. D'où la mémoïsation stricte, et d'où T17. `jeu.slot` est
  // muté ici parce que c'est là que le modèle le lit ; le `jeu` appartient à ce
  // hook et à personne d'autre.
  const cartes = useMemo(() => {
    if (saute) return [];
    jeu.slot = i;
    jeu.repioches[i] = repioches;
    return main(jeu);
  }, [jeu, i, repioches, saute]);

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

        {/* L'ASSIETTE D'ABORD, LES CARTES ENSUITE. Une fois le plat posé, la
            question n'est plus « lequel ? » mais « qu'est-ce qu'il y a avec ? » —
            c'est l'objectif que l'utilisateur a formulé : « définir un repas
            complet et équilibré… ce sont simplement des briques qu'il faut
            assembler ». Les cartes restent dessous pour changer d'avis. */}
        {saute || plat.vide ? null : (
          <Assiette
            vue={plat}
            briques={briques}
            creneau={creneau}
            ajouter={(id) => void accompagnerDe(i, id, true)}
            retirer={(id) => void accompagnerDe(i, id, false)}
          />
        )}

        {saute ? (
          <div className="co-vide">Repas sauté — rien à cuisiner, rien à acheter.</div>
        ) : cartes.length ? (
          <>
            {plat.vide ? null : (
              <div className="co-kicker" style={{ margin: "var(--space-3) 0 var(--space-1)" }}>
                Changer le plat
              </div>
            )}
            {cartes.map((carte) => (
              <Jouable key={carte.plat.id} carte={carte} creneau={creneau} jouer={jouer} />
            ))}
          </>
        ) : (
          <div className="co-vide">Plus de cartes pour ce créneau.</div>
        )}
      </Corps>
    </>
  );
}

/**
 * CE QU'IL Y A DANS L'ASSIETTE, ET CE QU'ON PEUT Y AJOUTER.
 *
 * LE MANQUE EST ANNONCÉ AVEC SA RÉPARATION, jamais seul. T26 savait déjà écrire
 * « il manque un féculent » sur une carte ; le lire sans rien pouvoir en faire
 * était le reproche suivant, et c'est celui que cette section répare.
 *
 * QUAND L'ASSIETTE SE SUFFIT, LES BRIQUES SE RANGENT derrière un bouton. Les
 * proposer quand même les mettrait sur le chemin de quelqu'un qui a fini —
 * mais les retirer serait décider à sa place qu'un gratin ne veut pas de
 * salade.
 */
function Assiette({
  vue,
  briques,
  creneau,
  ajouter,
  retirer,
}: {
  vue: ReturnType<typeof vueDeLAssiette>;
  briques: ReturnType<typeof vueDesComplements>;
  creneau: CleCreneau;
  ajouter: (id: string) => void;
  retirer: (id: string) => void;
}) {
  const [force, setForce] = useState(false);
  const proposer = !vue.complete || force;

  return (
    <div className="co-assiette">
      <div className="co-kicker">Dans l’assiette</div>
      {vue.plats.map((p) => (
        <div key={p.id} className="l">
          <span style={{ flex: 1 }}>
            {p.titre}
            {p.principal ? "" : " — accompagnement"}
          </span>
          <a className="btn btn-ghost" href={chemin({ ecran: "cuisiner", creneau, plat: p.id })}>
            Fiche
          </a>
          {/* Le plat principal ne se retire pas ici : il se REMPLACE, par une
              carte. « Vider le créneau » est un autre geste, et il vit sur la
              semaine. */}
          {p.principal ? null : (
            <button className="btn btn-ghost" onClick={() => retirer(p.id)}>
              Retirer
            </button>
          )}
        </div>
      ))}

      <div className={vue.complete ? "verdict complet" : "verdict"}>
        {vue.complete ? "Repas complet." : `⚠ ${vue.dit}.`}
      </div>

      {proposer ? (
        briques.length ? (
          briques.map((b) => (
            <div key={b.id} className="brique">
              <span style={{ flex: 1 }}>
                <span className="nom">{b.titre}</span>
                <div className="pour">
                  {[b.pourquoi, b.minutes ? duree(b.minutes) : "", b.restera ? `puis ${b.restera}` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {/* Le hors-saison se dit ici aussi : une brique est un plat, et
                    des carottes râpées en février se paient comme le reste. */}
                {b.horsSaison.length ? (
                  <div className="pour">⚠ pas de saison&nbsp;: {b.horsSaison.join(", ")}</div>
                ) : null}
              </span>
              <button className="btn btn-secondary" onClick={() => ajouter(b.id)}>
                Ajouter
              </button>
            </div>
          ))
        ) : (
          <div className="co-note">Rien à ajouter&nbsp;: tout est déjà dans l’assiette.</div>
        )
      ) : (
        <button className="btn btn-ghost" onClick={() => setForce(true)}>
          Ajouter quand même
        </button>
      )}
    </div>
  );
}

function Jouable({
  carte,
  creneau,
  jouer,
}: {
  carte: Carte;
  creneau: CleCreneau;
  jouer: (id: string) => void;
}) {
  const p = carte.plat;
  const entrees = entreesDeLaCarte(carte);
  const sorties = sortiesDeLaCarte(p);

  return (
    <div className="co-jouable">
      <div className="tete">
        <span className="nom">{p.titre}</span>
        <span className="meta">
          <span>{duree(carte.minutes)}</span>
          <span>{marqueMarginal(carte.marginal)}</span>
        </span>
      </div>

      <div className="co-flux">
        <div className="co-kicker">Consomme</div>
        {entrees.map((e) => (
          <div key={e.texte} className="l">
            <span className={`co-etat ${classeEtat(e.etat)}`}>{e.etat}</span>
            <span style={{ flex: 1 }}>{e.texte}</span>
          </div>
        ))}
      </div>

      {/* UNE SEULE RAISON, la première. Le scoring en produit plusieurs ; les
          empiler transformerait un argument en plaidoirie, et on cesse de
          croire un plat qui se défend trop. */}
      {carte.pourquoi[0] ? <div className="co-action">{carte.pourquoi[0]}</div> : null}

      {/* CE QUI MANQUE POUR EN FAIRE UN REPAS, dit sur la carte et pas seulement
          dans le score. C'est la remarque qui a ouvert le chantier : « bolognaise
          ou pâte à pizza c'est sympa mais il manque la moitié ». Le score les
          fait descendre ; cette ligne dit POURQUOI, et ce qu'il faudrait ajouter
          dans l'assiette. */}
      {carte.ditLeManque ? (
        <div className="co-note" style={{ margin: "var(--space-1) 0 0" }}>
          ⚠ {carte.ditLeManque}
        </div>
      ) : null}

      {/* LE HORS-SAISON SE DIT À PART, ET TOUJOURS. C'est la seule ligne qui
          n'argumente pas POUR le plat mais CONTRE lui : la noyer dans la file
          des raisons la ferait disparaître dès qu'un meilleur argument existe,
          alors que « des tomates en février » reste vrai même quand le plat
          comble une protéine manquante.
          Le silence ne veut pas dire « tout est de saison » : la source ignore
          les fruits et la courgette, et ce qu'elle ignore n'est jamais reproché. */}
      {carte.horsSaison.length ? (
        <div className="co-note" style={{ margin: "var(--space-1) 0 0" }}>
          ⚠ pas de saison&nbsp;: {carte.horsSaison.join(", ")}
        </div>
      ) : null}

      <div className="co-flux">
        <div className="co-kicker">Produit</div>
        {sorties.length ? (
          sorties.map((s) => (
            <div key={s.texte} className="l">
              <Icone nom={s.icone} />
              <span style={{ flex: 1 }}>{s.texte}</span>
            </div>
          ))
        ) : (
          <div className="l" style={{ color: "var(--color-neutral-700)" }}>
            Rien — tout est mangé le soir même.
          </div>
        )}
      </div>

      <div className="pied">
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => jouer(p.id)}>
          Poser sur ce créneau
        </button>
        {/* LA FICHE DU CANDIDAT, pas celle du créneau : on lit la recette
            avant de choisir, et le créneau porte peut-être encore autre chose. */}
        <a className="btn btn-ghost" href={chemin({ ecran: "cuisiner", creneau, plat: p.id })}>
          Fiche
        </a>
      </div>
    </div>
  );
}
