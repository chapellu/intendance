// « + Ajouter » — dire à l'app ce qu'on vient de ranger.
//
// Un bouton, un panneau qui monte du bas : on cherche, on compte, on ajoute.
// C'est le geste qui manquait : deux plaquettes de beurre achetées en passant
// n'avaient aucun chemin vers le stock, sauf à relever tout le frigo.

import { useEffect, useMemo, useState } from "react";
import { ajouterAuStock, annulerAjout, base } from "../db";
import { useJournal, usePlacard } from "../db/hooks";
import { poidsConnu } from "../db/journal";
import { ingredientsConnus } from "../ecrans/stock.vue";
import { placesDuReleve } from "../model/journal";
import type { Catalogue } from "../model/types";
import { nomLisible, pourChercher } from "./noms";

export interface Suggestion {
  id: string;
  /** Combien en proposer d'office — la quantité de la liste, quand elle compte. */
  unites?: number;
}

interface Ajout {
  evenement: number;
  cles: string[];
  texte: string;
}

export function AjouterAuStock({
  catalogue,
  panier,
  suggestions = [],
  titreSuggestions = "Sur la liste de courses",
  ouvrirSur,
  nomDepart,
  onFerme,
  libelle = "+ Ajouter",
  className = "btn btn-primary",
}: {
  catalogue: Catalogue;
  /** Les clés de la liste en cours : ce qu'on ajoute y passe « rangé ». */
  panier?: ReadonlyMap<string, unknown>;
  suggestions?: readonly Suggestion[];
  titreSuggestions?: string;
  /** Ouvre directement le panneau sur cet ingrédient (« J'en ai »). */
  ouvrirSur?: string | null;
  /** Le nom de la ligne de recette qui a ouvert le panneau : « farine T110 »
   *  se reconnaît mieux que l'id d'achat qu'elle porte. */
  nomDepart?: string | undefined;
  onFerme?: () => void;
  libelle?: string;
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [dernier, setDernier] = useState<Ajout | null>(null);

  useEffect(() => {
    if (ouvrirSur) setOuvert(true);
  }, [ouvrirSur]);

  useEffect(() => {
    if (!dernier) return;
    const t = setTimeout(() => setDernier(null), 6000);
    return () => clearTimeout(t);
  }, [dernier]);

  const fermer = () => {
    setOuvert(false);
    onFerme?.();
  };

  return (
    <>
      {ouvrirSur === undefined ? (
        <button className={className} onClick={() => setOuvert(true)}>
          {libelle}
        </button>
      ) : null}
      {ouvert ? (
        <Feuille
          catalogue={catalogue}
          panier={panier}
          suggestions={suggestions}
          titreSuggestions={titreSuggestions}
          depart={ouvrirSur ?? null}
          nomDepart={nomDepart}
          onFerme={fermer}
          onAjoute={(a) => {
            setDernier(a);
            fermer();
          }}
        />
      ) : null}
      {dernier ? (
        <div className="aj-toast" role="status">
          <span>{dernier.texte}</span>
          <button
            className="btn btn-ghost"
            onClick={() => {
              void annulerAjout(base, dernier);
              setDernier(null);
            }}
          >
            Annuler
          </button>
        </div>
      ) : null}
    </>
  );
}

function Feuille({
  catalogue,
  panier,
  suggestions,
  titreSuggestions,
  depart,
  nomDepart,
  onFerme,
  onAjoute,
}: {
  catalogue: Catalogue;
  panier: ReadonlyMap<string, unknown> | undefined;
  suggestions: readonly Suggestion[];
  titreSuggestions: string;
  depart: string | null;
  nomDepart?: string | undefined;
  onFerme: () => void;
  onAjoute: (a: Ajout) => void;
}) {
  const journal = useJournal();
  const placard = usePlacard(catalogue);
  const [cherche, setCherche] = useState("");
  const [choisi, setChoisi] = useState<string | null>(depart);
  const nom = (id: string) => (id === depart && nomDepart ? nomDepart : nomLisible(catalogue, id));
  const [n, setN] = useState(() => suggestions.find((s) => s.id === depart)?.unites ?? 1);

  // T180 — RANGÉ OÙ ? La place que le relevé donne à l'ingrédient est proposée
  // d'office : des tomates pelées vont sur l'étagère où sont les autres, sans un
  // tap de plus. Sans place connue, rien n'est choisi, et la course attend sous
  // « Rentrés, à ranger » comme avant.
  const zones = catalogue.gardeManger.zones;
  const places = useMemo(() => placesDuReleve(catalogue), [catalogue]);
  const placeDe = (id: string | null): string | null =>
    id ? (places.get(catalogue.rayons.aliases[id] ?? id)?.[0] ?? null) : null;
  const [zone, setZone] = useState<string | null>(() => placeDe(depart));

  const connus = useMemo(
    () => ingredientsConnus(catalogue).map((c) => ({ id: c.id, nom: nomLisible(catalogue, c.id) })),
    [catalogue],
  );

  // Ce qu'on a rentré dernièrement : les rachats habituels, à un doigt.
  const recents = useMemo(() => {
    if (!journal) return [];
    const vus: string[] = [];
    for (let i = journal.length - 1; i >= 0 && vus.length < 8; i--) {
      const e = journal[i]!;
      if (e.sorte !== "entree") continue;
      for (const l of e.lignes) if (!vus.includes(l.ingredient)) vus.push(l.ingredient);
    }
    return vus.slice(0, 8);
  }, [journal]);

  const q = pourChercher(cherche);
  const trouves = q.length < 1 ? [] : connus.filter((c) => pourChercher(c.nom).includes(q)).slice(0, 8);

  const choisir = (id: string) => {
    setChoisi(id);
    setN(suggestions.find((s) => s.id === id)?.unites ?? 1);
    setZone(placeDe(id));
  };

  const ajouter = async () => {
    if (!choisi || !journal) return;
    const cles = panier ? [...panier.keys()].filter((k) => k.startsWith(`${choisi}|`)) : [];
    const r = await ajouterAuStock(
      base,
      { ingredient: choisi, unites: n, parUnite: poidsConnu(catalogue, journal, choisi), zone },
      cles,
    );
    const ou = zones.find((z) => z.id === zone)?.label;
    onAjoute({ ...r, texte: `${nom(choisi)} × ${n} ajouté au stock${ou ? ` — ${ou}` : ""}` });
  };

  const deja = choisi ? (placard?.parIngredient.get(choisi)?.unites ?? 0) : 0;
  const poids = choisi && journal ? poidsConnu(catalogue, journal, choisi) : null;

  const puces = (titre: string, ids: readonly string[]) =>
    ids.length ? (
      <>
        <div className="co-kicker" style={{ margin: "var(--space-3) 0 var(--space-1)" }}>
          {titre}
        </div>
        <div className="aj-puces">
          {ids.map((id) => (
            <button key={id} className="aj-puce" onClick={() => choisir(id)}>
              {nomLisible(catalogue, id)}
            </button>
          ))}
        </div>
      </>
    ) : null;

  return (
    <div className="aj-fond" onClick={onFerme}>
      <div
        className="aj-feuille"
        role="dialog"
        aria-modal="true"
        aria-label="Ajouter au stock"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aj-tete">
          <div className="aj-titre">{choisi ? nom(choisi) : "Ajouter au stock"}</div>
          <button className="btn btn-ghost" onClick={onFerme} aria-label="Fermer">
            Fermer
          </button>
        </div>

        {choisi ? (
          <>
            <div className="co-note">
              {deja > 0 ? `Vous en avez déjà ${deja}.` : "Vous n’en avez pas en ce moment."}
              {poids ? ` Compté par ${poids.amount} ${poids.unit}.` : ""}
            </div>
            <div className="aj-compte">
              <button className="aj-rond" aria-label="un de moins" onClick={() => setN(Math.max(1, n - 1))}>
                −
              </button>
              <span className="aj-n" aria-live="polite">
                {n}
              </span>
              <button className="aj-rond" aria-label="un de plus" onClick={() => setN(n + 1)}>
                +
              </button>
            </div>
            <div className="co-note" style={{ textAlign: "center" }}>
              paquets, boîtes ou pièces
            </div>
            {zones.length ? (
              <>
                <div className="co-kicker" style={{ margin: "var(--space-3) 0 var(--space-1)" }}>
                  Rangé où ?
                </div>
                <div className="aj-puces" role="radiogroup" aria-label="Rangé où ?">
                  {[...zones.map((z) => ({ id: z.id as string | null, label: z.label })), { id: null, label: "Pas encore rangé" }].map(
                    (z) => (
                      <button
                        key={z.id ?? "-"}
                        role="radio"
                        aria-checked={zone === z.id}
                        className={`aj-puce${zone === z.id ? " on" : ""}`}
                        onClick={() => setZone(z.id)}
                      >
                        {z.label}
                      </button>
                    ),
                  )}
                </div>
              </>
            ) : null}
            <button className="btn btn-primary btn-block aj-go" onClick={() => void ajouter()}>
              Ajouter {n} au stock
            </button>
            {depart === null ? (
              <button className="btn btn-ghost btn-block" onClick={() => setChoisi(null)}>
                Choisir autre chose
              </button>
            ) : null}
          </>
        ) : (
          <>
            <div className="co-chercher" style={{ margin: "var(--space-2) 0 0" }}>
              <input
                type="search"
                autoFocus
                aria-label="Quoi ?"
                placeholder="Beurre, pâtes, œufs…"
                value={cherche}
                onChange={(e) => setCherche(e.target.value)}
              />
            </div>
            {q ? (
              <div className="aj-liste">
                {trouves.map((c) => (
                  <button key={c.id} className="aj-ligne" onClick={() => choisir(c.id)}>
                    {c.nom}
                  </button>
                ))}
                {!trouves.length ? <div className="co-note">Rien de connu sous ce nom.</div> : null}
              </div>
            ) : (
              <>
                {puces(titreSuggestions, suggestions.map((s) => s.id))}
                {puces(
                  "Achetés récemment",
                  recents.filter((id) => !suggestions.some((s) => s.id === id)),
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
