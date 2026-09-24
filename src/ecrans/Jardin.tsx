// Écran « Jardin » — T95 et T96 du backlog.
//
// La facette jardin ouvre enfin : une carte de la terrasse, et le verdict
// d'une cellule. Elle n'existait jusqu'ici que pour que la barre du bas ne
// soit pas un mensonge (une coquille à trois facettes dont deux n'ouvrent
// rien ne se juge pas) ; elle porte maintenant un modèle.
//
// CE QUE CET ÉCRAN NE FAIT PAS, ET IL FAUT LE LIRE AVANT DE LE COMPLÉTER :
// il ne CONSIGNE rien. Aucune plantation ne s'enregistre, aucune observation
// ne se note, la base n'est pas touchée. La ligne de base année-0
// (Workspace#13) n'est pas tranchée — ce qu'une cellule porte au jour 1 est
// une question ouverte, et écrire en base une réponse qu'on n'a pas est le
// genre de dette qu'on retrouve dans six mois sans savoir qui l'a créée.
// L'écran LIT une amorce (`model/terrasse.ts`) et calcule. C'est déjà la
// moitié utile : la question « qu'est-ce que je plante ? » se pose au rayon,
// et elle n'a pas besoin qu'on ait consigné quoi que ce soit pour se poser.
//
// Tout ce que l'écran DIT vit dans `jardin.vue.ts` ; ce fichier le dessine.

import { useState } from "react";
import { NOM_FAMILLE } from "../model/cultures";
import type { Cellule } from "../model/terrasse";
import type { Raison, Verdict } from "../model/verdict";
import { Corps } from "../ui/Coquille";
import {
  decale,
  entree,
  HORIZONS,
  motDeLaBande,
  motDeLaForme,
  motDuStatut,
  vueDeLaTerrasse,
  type VueCellule,
} from "./jardin.vue";

export function Jardin() {
  // LE CARRÉ A DU BAC 2 PAR DÉFAUT, et pas la première cellule de la liste :
  // le bac 2 est la SEULE vraie planche potagère du site, les trois autres
  // bacs sont du mobilier. Ouvrir sur le lilas ferait chercher.
  const [id, setId] = useState("bac2-a");
  const [horizon, setHorizon] = useState(0);

  // Recalculé à chaque rendu, comme tout le reste de cette app : un verdict
  // est une fonction de (cellule, date), le mémoriser serait se garantir qu'il
  // divergera un jour de ses entrées (voir `db/schema.ts`).
  const date = decale(new Date(), HORIZONS[horizon]!.jours);
  const vues = vueDeLaTerrasse(date);
  const vue = vues.find((v) => v.cellule.id === id) ?? vues[0]!;

  return (
    <Corps plat>
      <div className="co-kicker accent">Facette jardin</div>
      <div className="co-h" style={{ margin: "var(--space-1) 0 0" }}>
        La terrasse
      </div>
      <p className="co-note" style={{ margin: "var(--space-1) 0 var(--space-3)" }}>
        {entree(vues)}
      </p>

      <div className="co-pilules" style={{ marginBottom: "var(--space-3)" }}>
        {HORIZONS.map((h, i) => (
          <button
            key={h.nom}
            className={`co-pilule${i === horizon ? " actif" : ""}`}
            onClick={() => setHorizon(i)}
          >
            {h.nom}
          </button>
        ))}
      </div>

      <div className="co-terrasse">
        {vues.map((v) => (
          <Case key={v.cellule.id} vue={v} choisie={v.cellule.id === vue.cellule.id} sur={() => setId(v.cellule.id)} />
        ))}
      </div>
      <p className="co-plan-note">
        Le bac 2 est découpé en trois carrés de 33 × 40 cm. C'est la seule
        granularité du site&nbsp;: en un seul tenant, une solanacée y coûterait
        toute la surface potagère pendant quatre ans.
      </p>

      <Detail vue={vue} />
    </Corps>
  );
}

/** Une cellule sur la carte. C'est un BOUTON et pas une ancre : choisir une
 *  cellule ne change pas de page, et une URL par cellule serait un état à
 *  tenir avant même de savoir si la carte est la bonne forme. */
function Case({ vue, choisie, sur }: { vue: VueCellule; choisie: boolean; sur: () => void }) {
  const { carte } = vue.cellule;
  return (
    <button
      className={`co-cellule ${vue.etat}${choisie ? " choisie" : ""}`}
      style={{
        gridColumn: `${carte.x} / span ${carte.w}`,
        gridRow: `${carte.y} / span ${carte.h}`,
      }}
      onClick={sur}
      aria-current={choisie ? "true" : undefined}
    >
      <span className="nom">{vue.cellule.nom}</span>
      <span className="quoi">{vue.occupation}</span>
      {/* UN ZÉRO N'EST PAS UN CHIFFRE À AFFICHER — même règle qu'au cockpit.
          Une case de mobilier n'a rien à offrir et n'a pas à porter un « 0 ». */}
      {vue.ouvertes ? <span className="co-pastille">{vue.ouvertes}</span> : null}
    </button>
  );
}

function Detail({ vue }: { vue: VueCellule }) {
  const c = vue.cellule;
  return (
    <>
      <div className="co-kicker" style={{ margin: "var(--space-6) 0 var(--space-2)" }}>
        {c.nom}
      </div>
      <Faits cellule={c} />
      <div className="co-verdicts">
        {vue.verdicts.map((v) => (
          <Fiche key={v.culture.id} verdict={v} />
        ))}
      </div>
    </>
  );
}

/** Les faits de la cellule. LA LUMIÈRE D'HIVER Y FIGURE MÊME QUAND ELLE EST
 *  INCONNUE — surtout quand elle est inconnue : c'est la seule question du
 *  jardin qu'un doigt peut fermer aujourd'hui, et elle décide six cultures. */
function Faits({ cellule }: { cellule: Cellule }) {
  return (
    <div className="co-faits">
      <span>
        {cellule.nature === "bac" ? "Bac fixe" : "Pot mobile"} · {cellule.largeur} cm, {cellule.profondeur} cm de terre
      </span>
      <span>
        Soleil : {cellule.lumiere.ete} h l'été ·{" "}
        {cellule.lumiere.hiver === null ? (
          <b>l'hiver, non relevé</b>
        ) : (
          `${cellule.lumiere.hiver} h l'hiver`
        )}
      </span>
      {cellule.nature === "pot" ? <span>Substrat renouvelable : pas de rotation ici.</span> : null}
    </div>
  );
}

function Fiche({ verdict: v }: { verdict: Verdict }) {
  return (
    <div className={`co-verdict ${v.statut}`}>
      <div className="tete">
        <span className="nom">{v.culture.nom}</span>
        <span className="statut">{motDuStatut(v.statut)}</span>
      </div>
      <div className="bandes">
        <span className={`bande ${v.bande}`}>{motDeLaBande(v.bande)}</span>
        <span className="forme">{motDeLaForme(v.forme)}</span>
        <span className="famille">{NOM_FAMILLE[v.culture.famille]}</span>
        {v.confiance === "a-observer" ? <span className="observer">à observer</span> : null}
      </div>
      {/* TOUTES LES RAISONS, JAMAIS DISTILLÉES. Un écran qui n'en montrerait
          que la première enseignerait à lever un obstacle pour en découvrir un
          second — c'est la règle de Workspace#9, et c'est ce qui distingue un
          verdict d'un refus. */}
      <ul className="raisons">
        {v.raisons.map((r, i) => (
          <Ligne key={i} raison={r} />
        ))}
      </ul>
      {v.culture.note ? <p className="note">{v.culture.note}</p> : null}
    </div>
  );
}

const Ligne = ({ raison }: { raison: Raison }) => (
  <li className={raison.axe}>{raison.texte}</li>
);
