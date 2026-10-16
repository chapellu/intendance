// Écran « Le répertoire » — T81.
//
// Les 138 plats, d'un coup d'œil, sans rien planifier. Ce que chaque ligne dit
// et l'ordre dans lequel elles viennent sont décidés dans `repertoire.vue.ts` ;
// cet écran ne fait que les poser et ouvrir la fiche de lecture de T91.
//
// UNE LIGNE EST UN LIEN, PAS UN BOUTON. Une vraie ancre, comme les onglets :
// elle pousse une entrée dans l'histoire, et c'est ce dont « ‹ Revenir » a
// besoin — `sortir()` revient en arrière, donc ici. Le pouce peut aussi la
// garder appuyée pour copier l'adresse d'une recette.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCatalogue, useSemaine } from "../db/hooks";
import { chemin } from "../nav/routes";
import { duree, fmt } from "../ui/format";
import { creneauDeLecture, vueDuRepertoire, type LigneRepertoire } from "./repertoire.vue";
import type { Jeu } from "../model/jeu";

/**
 * CE QU'ON REGARDAIT SURVIT À L'ALLER-RETOUR VERS LA FICHE, ET RIEN DE PLUS.
 *
 * La fiche sort de la coquille, donc cet écran se démonte quand on l'ouvre :
 * sans cette mémoire, « ‹ Revenir » ramènerait en haut d'une liste de 138 avec
 * le champ vidé — et le geste qu'on fait le plus ici, lire trois fiches de
 * suite, recommencerait trois fois la recherche. Une variable de module et pas
 * un réglage en base : c'est un REGARD, pas une décision (même partage que
 * l'en-tête de `Cuisiner.tsx`), et rouvrir l'app demain doit rouvrir le
 * répertoire en entier.
 */
const regard = { requete: "", defilement: 0 };

export function Repertoire() {
  const { catalogue } = useCatalogue();
  const { jeu } = useSemaine(catalogue);
  const [requete, setRequete] = useState(regard.requete);
  const corps = useRef<HTMLDivElement>(null);

  const vue = useMemo(
    () => (catalogue ? vueDuRepertoire(catalogue.plats, requete) : null),
    [catalogue, requete],
  );

  // Le défilement se rend AVANT la peinture, sinon on voit le haut de la liste
  // un instant, puis un saut.
  useLayoutEffect(() => {
    if (vue && corps.current) corps.current.scrollTop = regard.defilement;
    // Une seule fois par montage, une fois la liste là : la rejouer à chaque
    // frappe ramènerait le doigt à une position que la liste n'a plus.
  }, [!!vue]);

  if (!vue || !jeu) return null;

  const changer = (q: string) => {
    regard.requete = q;
    // Une autre frappe, une autre liste : la position d'avant ne désigne plus
    // rien.
    regard.defilement = 0;
    setRequete(q);
  };

  return (
    // `.co-corps` À LA MAIN, ET PAS `<Corps>` : c'est la seule zone qui
    // défile, et il faut sa référence pour y revenir. Même classe, même rôle.
    <div
      className="co-corps"
      ref={corps}
      onScroll={(e) => (regard.defilement = e.currentTarget.scrollTop)}
    >
      <div className="co-kicker">
        {vue.montres === vue.total ? `${vue.total} plats` : `${vue.montres} sur ${vue.total} plats`}
      </div>
      <div className="co-note" style={{ margin: "var(--space-1) var(--space-1) var(--space-3)" }}>
        Tout ce que la cuisine sait faire. On lit, on ne pose rien&nbsp;: une fiche s’ouvre en
        résumé.
      </div>

      {/* LE CHAMP DE T80, À L'IDENTIQUE — même classe, même libellé pour les
          lecteurs d'écran, même « Effacer ». Ce qu'il fait diffère, et c'est
          dit dans `vueDuRepertoire` : il amincit la liste, il ne la trie pas. */}
      <div className="co-chercher">
        <input
          type="search"
          value={requete}
          onChange={(e) => changer(e.target.value)}
          placeholder="Chercher un plat…"
          aria-label="chercher un plat par son nom"
        />
        {requete ? (
          <button className="btn btn-ghost" onClick={() => changer("")}>
            Effacer
          </button>
        ) : null}
      </div>

      {vue.groupes.length ? null : (
        <div className="co-vide">Aucun plat ne porte ce nom.</div>
      )}

      {vue.groupes.map((g) => (
        <section key={g.cle} className="co-rep-groupe" aria-label={g.nom}>
          <div className="co-kicker">
            {g.nom} · {g.lignes.length}
          </div>
          {g.lignes.map((l) => (
            <Ligne key={l.plat.id} l={l} jeu={jeu} />
          ))}
        </section>
      ))}
    </div>
  );
}

function Ligne({ l, jeu }: { l: LigneRepertoire; jeu: Jeu }) {
  const creneau = creneauDeLecture(jeu, l.plat.id);
  const contenu = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div className="nom">{l.plat.titre}</div>
        <div className="ou">
          {fmt(l.portions)} part{l.portions > 1 ? "s" : ""}{l.ustensile ? ` · ${l.ustensile}` : ""}
          {l.sansRecette ? (
            <>
              {" · "}
              <span className="co-muet">{l.sansRecette}</span>
            </>
          ) : null}
        </div>
        {l.apports ? <div className="ou">{l.apports}</div> : null}
        {/* CE QUI SE CHAÎNE, DANS LES DEUX SENS. C'est ce que le répertoire
            sait dire et qu'aucun livre ne dit : la bolognaise DONNE la sauce
            que les lasagnes PRENNENT. « (ou sans) » quand le plat se fait aussi
            sans elle — `requis: false`. */}
        {l.donne.length ? <div className="ou">donne : {l.donne.join(", ")}</div> : null}
        {l.prend.length ? (
          <div className="ou">
            prend : {l.prend.map((x) => (x.requis ? x.texte : `${x.texte} (ou sans)`)).join(", ")}
          </div>
        ) : null}
      </span>
      <span className="temps">
        <div className="q">{duree(l.temps.total)}</div>
        {/* CE QUI DEMANDE QUELQU'UN DEVANT. Le total d'une recette qui mijote
            se lit comme un refus ; sa part active est souvent un quart. Muet
            quand c'est tout le temps — la ligne du dessus l'a déjà dit. */}
        {l.temps.actif !== null ? <div className="actif">{duree(l.temps.actif)} actives</div> : null}
      </span>
    </>
  );

  // Sans créneau qui ne porte PAS ce plat, pas de lien : mieux vaut une ligne
  // qu'on lit qu'une ligne qui ouvrirait le guide. Voir `creneauDeLecture`.
  return creneau ? (
    <a className="co-lot co-rep" href={chemin({ ecran: "cuisiner", creneau, plat: l.plat.id })}>
      {contenu}
    </a>
  ) : (
    <div className="co-lot co-rep">{contenu}</div>
  );
}
