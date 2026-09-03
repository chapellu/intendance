// PROTOTYPE — à jeter. Les deux pièces que les trois variantes partagent.
//
// Elles se partagent parce qu'elles ne sont PAS ce qu'on juge : la carte
// jouable est déjà tranchée (écran « Poser », T11) et les listes par canal
// viennent de #41. Ce qui est en jeu, c'est le rail autour — l'horizon, le
// mouvement, le retour en arrière — et chaque variante le dessine à sa façon,
// sans layout commun.

import { articles, type Calcul } from "../../model/calcul";
import type { Carte } from "../../model/scoring";
import { parRayon } from "../../model/scoring";
import type { Catalogue } from "../../model/types";
import { duree } from "../../ui/format";
import { Icone } from "../../ui/icones";
import { classeEtat, entreesDeLaCarte, sortiesDeLaCarte } from "../poser.vue";
import { CANAL_FRAIS, type Question } from "./rail";

/* ────────────────────────────────────────────────────────── la carte jouable */

export function CarteRail({
  carte,
  poser,
  dense = false,
}: {
  carte: Carte;
  poser: () => void;
  /** B empile un reçu au-dessus de la main : la carte doit y tenir en deux
   *  lignes, pas en huit. */
  dense?: boolean;
}) {
  const p = carte.plat;

  if (dense) {
    return (
      <button className="co-jouable" onClick={poser} style={{ width: "100%", textAlign: "left", cursor: "pointer" }}>
        <div className="tete">
          <span className="nom">{p.titre}</span>
          <span className="meta">
            <span>{duree(carte.minutes)}</span>
            <span>+{carte.marginal} art.</span>
          </span>
        </div>
        {carte.pourquoi[0] ? <div className="co-action">{carte.pourquoi[0]}</div> : null}
      </button>
    );
  }

  return (
    <div className="co-jouable">
      <div className="tete">
        <span className="nom">{p.titre}</span>
        <span className="meta">
          <span>{duree(carte.minutes)}</span>
          <span>+{carte.marginal} art.</span>
        </span>
      </div>

      <div className="co-flux">
        <div className="co-kicker">Consomme</div>
        {entreesDeLaCarte(carte).map((e) => (
          <div key={e.texte} className="l">
            <span className={`co-etat ${classeEtat(e.etat)}`}>{e.etat}</span>
            <span style={{ flex: 1 }}>{e.texte}</span>
          </div>
        ))}
      </div>

      {carte.pourquoi[0] ? <div className="co-action">{carte.pourquoi[0]}</div> : null}

      <div className="co-flux">
        <div className="co-kicker">Produit</div>
        {sortiesDeLaCarte(p).length ? (
          sortiesDeLaCarte(p).map((s) => (
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
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={poser}>
          Poser sur ce créneau
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── une question */

export function QuestionRail({
  q,
  repondre,
  ecarter,
}: {
  q: Question;
  repondre: (v: "oui" | "non" | null) => void;
  ecarter: () => void;
}) {
  return (
    // Le nom D'ABORD, la question après : « il reste du échalotes » est le
    // genre de faute qu'un gabarit produit tout seul, et qu'on ne répare pas en
    // devinant le genre d'un ingrédient. « échalotes — il en reste ? » marche
    // pour les 45 denrées sans exception.
    <div className="card" style={{ marginBottom: "var(--space-2)", padding: "var(--space-2)" }}>
      <div className="co-kicker">
        {q.urgence === "inconnu" ? "je ne sais plus" : "j’estime"} · {q.doute}
      </div>
      <div style={{ fontWeight: 600, margin: "6px 0 2px" }}>{q.nom} — il en reste ?</div>
      <div className="co-note" style={{ marginBottom: 10 }}>
        pour {q.depuis}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => repondre("oui")}>
          oui
        </button>
        <button className="btn btn-secondary" onClick={() => repondre("non")}>
          non
        </button>
        <button className="btn btn-ghost" onClick={() => repondre(null)}>
          je ne sais pas
        </button>
        <button className="btn btn-ghost" onClick={ecarter}>
          plus tard
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── la fin : les listes par canal */

export function Recap({
  catalogue,
  calc,
  poses,
  hors,
  questions,
}: {
  catalogue: Catalogue;
  calc: Calcul;
  poses: { quand: string; titre: string }[];
  hors: number;
  questions: number;
}) {
  const groupes = parRayon(catalogue, calc.panier);
  const frais = groupes.filter(([r]) => CANAL_FRAIS.has(r));
  const reserve = groupes.filter(([r]) => !CANAL_FRAIS.has(r));
  const n = articles(calc.panier).length;

  return (
    <div>
      <div className="co-h">C’est posé</div>
      <p className="co-note">
        {poses.length} repas posé{poses.length > 1 ? "s" : ""} · {n} article{n > 1 ? "s" : ""} ·{" "}
        {hors} créneau{hors > 1 ? "x" : ""} laissé{hors > 1 ? "s" : ""} hors du plan
        {questions ? ` · ${questions} question${questions > 1 ? "s" : ""} répondue${questions > 1 ? "s" : ""}` : ""}
      </p>

      <div className="co-flux" style={{ marginBottom: "var(--space-3)" }}>
        {poses.map((p) => (
          <div key={p.quand} className="l">
            <span className="co-kicker" style={{ minWidth: 110 }}>
              {p.quand}
            </span>
            <span style={{ flex: 1 }}>{p.titre}</span>
          </div>
        ))}
      </div>

      <ListeCanal
        titre="Le frais"
        sous="marché du vendredi · casier Côté Champs · panier vert — non choisi, à manger dans les jours"
        groupes={frais}
      />
      <ListeCanal
        titre="La réserve"
        sous="Carrefour, 88 av. du Chater — sec, boîte, congelé ; ça se planifie"
        groupes={reserve}
      />
    </div>
  );
}

function ListeCanal({
  titre,
  sous,
  groupes,
}: {
  titre: string;
  sous: string;
  groupes: [string, { id: string; nom: string; qty: number; unit: string }[]][];
}) {
  return (
    <div className="card" style={{ marginBottom: "var(--space-2)" }}>
      <div className="co-h" style={{ fontSize: "1rem" }}>
        {titre}
      </div>
      <div className="co-note" style={{ marginBottom: "var(--space-2)" }}>
        {sous}
      </div>
      {groupes.length ? (
        groupes.map(([rayon, arts]) => (
          <div key={rayon} style={{ marginBottom: 6 }}>
            <div className="co-kicker">{rayon}</div>
            <div>{arts.map((a) => a.nom).join(" · ")}</div>
          </div>
        ))
      ) : (
        <div className="co-vide">Rien de ce côté-là.</div>
      )}
    </div>
  );
}
