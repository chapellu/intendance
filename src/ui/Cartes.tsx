// Les deux blocs que le fil et « Poser » partagent — T49.
//
// EXTRAITS DE `Poser.tsx`, PAS RÉÉCRITS. Le fil montre exactement la même
// question et exactement la même carte : les dupliquer aurait garanti qu'elles
// divergent, et la première divergence aurait été silencieuse — deux écrans qui
// proposent le même plat en n'en disant pas la même chose.
//
// Ils ne savent rien du fil ni de « Poser » : on leur donne une carte ou une
// question, et ce qu'il faut faire quand un doigt tombe dessus.

import { useState } from "react";
import { base } from "../db";
import { observerIngredient } from "../db/journal";
import type { Question, Reste } from "../model/questions";
import type { Carte, Ecart } from "../model/scoring";
import { chemin, type CleCreneau } from "../nav/routes";
import { duree } from "./format";
import { Icone } from "./icones";
import { libellePoser } from "./phrases";
import { classeEtat, entreesDeLaCarte, sortiesDeLaCarte } from "../ecrans/poser.vue";
import { sansRecette } from "../ecrans/cuisiner.vue";
import { constatDe, enjeu, raison, REPONSES, titre } from "../ecrans/questions.vue";

/**
 * Une question, posée seule.
 *
 * ELLE DIT CE QU'ELLE COÛTE ET CE QU'ELLE RAPPORTE : la raison (« pas vu depuis
 * le 26/08 »), l'enjeu (« 3 plats l'attendent »), et combien il en reste après
 * celle-ci. Une question dont on voit le prix est une question qu'on peut
 * trouver mauvaise — et c'est le seul gouvernail que T33 se donne, le plafond de
 * ~5 ayant été supprimé.
 */
export function Demande({ question, reste }: { question: Question; reste: number }) {
  const [saisie, setSaisie] = useState("");

  const repondre = (r: Reste) => {
    const { unites } = constatDe(r, saisie.trim() === "" ? null : Number(saisie));
    // Pas de `.then` vers un écran : l'observation change le journal, le hook
    // le relit, et la main se retire d'elle-même. C'est ce que `useLiveQuery`
    // achète — la question suivante, ou les cartes, arrivent sans navigation.
    void observerIngredient(base, question.ingredient, unites, r);
  };

  return (
    <div className="co-question">
      <div className="tete">
        <span className="nom">{titre(question)}</span>
        <span className="meta">{raison(question)}</span>
      </div>

      <div className="co-action">{enjeu(question)}</div>

      <div className="btns">
        {REPONSES.map((r) => (
          <button
            key={r.reste}
            className={r.reste === "oui" ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => repondre(r.reste)}
          >
            {r.libelle}
          </button>
        ))}
      </div>

      {/* LA QUANTITÉ EST FACULTATIVE, sans valeur par défaut : une quantité
          obligatoire ferait peser pour répondre, donc on ne répondrait pas,
          donc l'app cesserait de demander. */}
      <label className="co-note compte">
        ou comptez, si vous voulez être précis :
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          aria-label={`combien de ${question.nom}`}
        />
      </label>

      {reste > 0 ? (
        <div className="co-note" style={{ marginTop: "var(--space-2)" }}>
          {reste === 1 ? "une autre question ensuite" : `${reste} autres questions ensuite`}
        </div>
      ) : null}
    </div>
  );
}

export function Jouable({
  carte,
  creneau,
  jouer,
  ecarts = [],
}: {
  carte: Carte;
  creneau: CleCreneau;
  jouer: (id: string) => void;
  /**
   * Pourquoi la proposition n'a pas montré ce plat — vide pour les cartes de
   * la main, qui n'ont par construction aucun écart (T80).
   */
  ecarts?: readonly Ecart[];
}) {
  const p = carte.plat;
  const entrees = entreesDeLaCarte(carte);
  const sorties = sortiesDeLaCarte(p);
  const muet = sansRecette(p);

  return (
    <div className="co-jouable">
      <div className="tete">
        <span className="nom">{p.titre}</span>
        <span className="meta">
          <span>{duree(carte.minutes)}</span>
          <span>+{carte.marginal} art.</span>
          {/* DANS LA MÊME LIGNE QUE LE TEMPS, et pas en bandeau. C'est une
              propriété du plat au même titre que sa durée, pas un incident :
              le bandeau en ferait un avertissement, et il n'y a rien à
              craindre — les quantités et le temps sont justes, c'est le
              pas-à-pas qui manque. On le lit AVANT de poser, ce qui est le
              seul moment où ça change une décision. */}
          {muet ? <span className="co-muet">{muet.court}</span> : null}
        </span>
      </div>

      {/* L'ÉCART SE LIT AVANT LE COÛT, parce qu'il change ce qu'on fait du
          reste de la carte : savoir que les tomates ont été dites absentes
          rend la ligne « 3 articles de plus au panier » lisible, et l'inverse
          fait relire deux fois. Le ton est celui de `.co-sansrecette` et pas
          celui d'une alerte — ce n'est pas une panne, c'est une raison, et
          elle se répare ou s'assume. */}
      {ecarts.map((e) => (
        <div key={e.cle} className="co-ecart">
          <Icone nom="info" />
          <span>{e.texte}</span>
        </div>
      ))}

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

      {/* LE PARI, DIT À VOIX HAUTE. Retirer ces plats ferait rétrécir les
          propositions à mesure que la confiance vieillit ; substituer en
          silence produirait un plat qu'on ne peut pas contredire. On parie donc,
          et on l'écrit — une estimation doit être visible ET contredisable, ce
          que la ligne est en menant au relevé. */}
      {carte.paris.length ? (
        <div className="co-pari">
          je compte sur : {carte.paris.join(", ")} —{" "}
          <a href={chemin({ ecran: "stock" })}>à vérifier</a>
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
        {/* LE LIBELLÉ VIT DANS `phrases.ts`, avec ses deux raisons : il change
            avec les jours, et quatre parcours e2e le désignent par son nom. */}
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => jouer(p.id)}>
          {libellePoser(ecarts.length > 0)}
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
