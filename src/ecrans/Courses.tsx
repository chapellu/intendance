// Écran « Courses » — T13 du backlog.
//
// DEUX GESTES, ET PLUS DE MODE À DEVINER. Toucher un article le met dans le
// sac ; « Ranger au stock », en bas, fait entrer d'un coup ce qui est dans le
// sac. L'ancien interrupteur « Au magasin / À la maison » obligeait à savoir
// qu'au magasin un toucher ne changeait PAS le stock — et c'est exactement là
// qu'on se perdait. « + J'ai acheté » couvre ce qui n'est pas sur la liste.
//
// C'EST LE PREMIER ÉCRAN QUI VIT VRAIMENT SUR LA PERSISTANCE. Une liste de
// courses qu'on ouvre au magasin, qu'on met en poche entre deux rayons et qui
// se vide au retour n'est pas une liste : c'est une farce. Rien ici n'est
// gardé en mémoire.
//
// Port de `apps/proto-shell/comptoir.js` (`ecranCourses`).

import { useEffect, useMemo, useState } from "react";
import { base, cocher, jourISO, rentrer, rentrerLesCoches, viderCourses } from "../db";
import { useCatalogue, useCourses, usePlacard, usePlanchersDenrees, useSemaine } from "../db/hooks";
import type { Calcul } from "../model/calcul";
import type { Jeu } from "../model/jeu";
import { fruitsDeLaSemaine, sousLeurPlancher } from "../model/plancherGardeManger";
import { Corps } from "../ui/Coquille";
import { BoutonFacture, BoutonScanner, RevueDuTicket } from "./Ticket";
import { listeParIngredient } from "./ticket.vue";
import {
  aVerifierParRaison,
  phraseDuPlancher,
  quantiteDeLArticle,
  vueDesCourses,
  type Article,
} from "./courses.vue";
import { pluriel } from "./stock.vue";
import { AjouterAuStock } from "../ui/Ajouter";
import { UNITE_PLANCHER } from "../model/plancherGardeManger";
import { ageDuReleve, phraseDeReference, referenceDe, type References } from "../model/references";
import { phraseDIssue, poserCle, rafraichirReferences, useReferences, type Issue } from "../db/references";

export function Courses() {
  const { catalogue } = useCatalogue();
  const { jeu, calc } = useSemaine(catalogue);
  const etats = useCourses();
  // LE PLACARD ET LES PLANCHERS — T41. La liste ne vient plus seulement de la
  // semaine : ce qui est sous son plancher EST la liste Carrefour. On attend les
  // deux, comme on attend `etats` : une liste affichée puis complétée d'une
  // ligne un instant plus tard est une liste dans laquelle on ne peut pas avoir
  // confiance, et c'est le seul écran qu'on lit debout dans un rayon.
  const placard = usePlacard(catalogue);
  const planchers = usePlanchersDenrees();
  if (!jeu || !calc || !etats || !placard || !planchers) return null;
  return (
    <Contenu
      jeu={jeu}
      calc={calc}
      etats={etats}
      sous={avecLesFruits(
        sousLeurPlancher(jeu.catalogue, placard, planchers),
        fruitsDeLaSemaine(jeu.catalogue, placard, new Date().getMonth() + 1),
      )}
    />
  );
}

/** T145 — un fruit qui a déjà un plancher validé ne fait pas deux lignes. */
const avecLesFruits = <L extends { ingredient: string }>(planchers: L[], fruits: L[]): L[] => [
  ...planchers,
  ...fruits.filter((f) => !planchers.some((p) => p.ingredient === f.ingredient)),
];

function Contenu({
  jeu,
  calc,
  etats,
  sous,
}: {
  jeu: Jeu;
  calc: Calcul;
  etats: NonNullable<ReturnType<typeof useCourses>>;
  sous: ReturnType<typeof sousLeurPlancher>;
}) {
  // T138 — la photo du ticket vit ici, en mémoire, le temps de la revue.
  // T160 — ou la facture PDF du drive, au même titre.
  const [photo, setPhoto] = useState<File | null>(null);
  const [importer, setImporter] = useState(false);
  const [voirRanges, setVoirRanges] = useState(false);
  const vue = useMemo(
    () => vueDesCourses(jeu.catalogue, calc.panier, etats, sous, new Date().setHours(0, 0, 0, 0)),
    [jeu.catalogue, calc.panier, etats, sous],
  );
  const aVerifier = useMemo(() => aVerifierParRaison(calc.aVerifier), [calc.aVerifier]);
  // T179 — LES RÉFÉRENCES DU MAGASIN, quand le téléphone en a une copie. Elles
  // annotent la ligne ; elles ne la font ni n'en retirent aucune.
  const refs = useReferences()?.copie?.refs ?? null;

  // UN SEUL GESTE SUR LA LISTE : toucher = dans le sac. Le stock ne bouge qu'au
  // bouton « Ranger », en rentrant — il n'y a plus de mode à deviner. Toucher
  // un article déjà rangé le remet sur la liste.
  const toucher = (a: Article) => {
    // `vue.panier` ET NON `calc.panier` : c'est la semaine PLUS les lignes de
    // plancher, et c'est elle qui porte la quantité au moment où un article
    // rentre au stock (T27).
    void (a.rentre ? rentrer(base, a.cle, false) : cocher(base, a.cle, !a.coche));
  };

  const restants = vue.articles.filter((a) => !a.rentre);
  const ranges = vue.articles.filter((a) => a.rentre);
  const suggestions = restants.map((a) => ({
    id: a.ligne.id,
    ...(a.ligne.unit === UNITE_PLANCHER ? { unites: Math.max(1, Math.round(a.ligne.qty)) } : {}),
  }));

  if (photo) {
    return (
      <Corps>
        <RevueDuTicket
          image={photo}
          catalogue={jeu.catalogue}
          liste={listeParIngredient(vue.articles)}
          onFermer={() => setPhoto(null)}
          onReprendre={setPhoto}
        />
      </Corps>
    );
  }

  return (
    <Corps plat>
      <div className="st-tete">
        <div className="co-h">Courses</div>
        <AjouterAuStock
          catalogue={jeu.catalogue}
          panier={vue.panier}
          suggestions={suggestions}
          libelle="+ J’ai acheté"
          className="btn btn-secondary"
        />
      </div>
      <div className="co-note" style={{ margin: "0 var(--space-1) var(--space-3)" }}>
        {restants.length
          ? `${pluriel(restants.length, "article")} à acheter${vue.coches ? ` · ${vue.coches} dans le sac` : ""}`
          : "Rien à acheter."}
      </div>

      {restants.length === 0 && ranges.length === 0 ? (
        <div className="co-vide">Les plats posés tiennent avec ce qu’il y a déjà.</div>
      ) : null}

      {vue.rayons.map((r) => {
        const arts = r.articles.filter((a) => !a.rentre);
        if (!arts.length) return null;
        return (
          <div key={r.nom} style={{ marginBottom: "var(--space-3)" }}>
            <div className="co-kicker" style={{ marginBottom: "var(--space-1)" }}>
              {r.nom}
            </div>
            {arts.map((a) => (
              <Ligne key={a.cle} a={a} refs={refs} onClick={() => toucher(a)} />
            ))}
          </div>
        );
      })}

      {/* DEUX RAISONS DE NE PAS ACHETER : on en a sûrement (va voir combien),
          ou c'est du fond de placard qu'on a toujours. */}
      {aVerifier.stock.length || aVerifier.fond.length ? (
        <div className="co-vide" style={{ marginBottom: "var(--space-3)" }}>
          {aVerifier.stock.length ? (
            <>
              <b>Vous en avez sûrement — jetez un œil</b>
              <br />
              {aVerifier.stock.join(" · ")}
            </>
          ) : null}
          {aVerifier.stock.length && aVerifier.fond.length ? <div style={{ height: "var(--space-2)" }} /> : null}
          {aVerifier.fond.length ? (
            <>
              <b>Normalement au placard</b>
              <br />
              {aVerifier.fond.join(" · ")}
            </>
          ) : null}
        </div>
      ) : null}

      {ranges.length ? (
        <div style={{ marginBottom: "var(--space-3)" }}>
          <button
            className="btn btn-ghost"
            aria-expanded={voirRanges}
            onClick={() => setVoirRanges(!voirRanges)}
          >
            {voirRanges ? "▾" : "▸"} Déjà rangés ({ranges.length})
          </button>
          {voirRanges ? ranges.map((a) => <Ligne key={a.cle} a={a} refs={refs} onClick={() => toucher(a)} />) : null}
        </div>
      ) : null}

      {/* T138 / T160 — le ticket photographié ou la facture du drive : l'autre
          façon de vider le sac, pour les grosses courses. */}
      <div style={{ marginTop: "var(--space-4)" }}>
        <button className="btn btn-ghost" aria-expanded={importer} onClick={() => setImporter(!importer)}>
          {importer ? "▾" : "▸"} Importer un ticket ou une facture drive
        </button>
        {importer ? (
          <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <BoutonScanner onImage={setPhoto} />
            <BoutonFacture onFichier={setPhoto} />
          </div>
        ) : null}
      </div>

      <ReferencesDuMagasin />

      {vue.orphelins > 0 || vue.coches + vue.rentres > 0 ? (
        <div className="co-note" style={{ marginTop: "var(--space-3)" }}>
          <button
            className="btn btn-ghost st-petit"
            onClick={() => void viderCourses(base)}
          >
            Remettre la liste à zéro
          </button>
        </div>
      ) : null}

      {/* LE GESTE DE VIDER LE SAC, toujours au même endroit, sous le pouce. */}
      {vue.coches > 0 ? (
        <div className="cs-barre">
          <button className="btn btn-primary btn-block" onClick={() => void rentrerLesCoches(base, vue.panier)}>
            Ranger au stock — {pluriel(vue.coches, "article")}
          </button>
        </div>
      ) : null}
    </Corps>
  );
}

function Ligne({ a, refs, onClick }: { a: Article; refs: References | null; onClick: () => void }) {
  const etat = a.rentre ? " rentre" : a.coche ? " coche" : "";
  const raison = a.plancher
    ? phraseDuPlancher(a.plancher, a.ligne.n)
    : a.ligne.n > 1
      ? `pour ${a.ligne.n} plats`
      : "pour 1 plat";
  return (
    <button className={`co-art${etat}`} aria-pressed={a.coche || a.rentre} onClick={onClick}>
      <span className="puce">{a.rentre ? "↓" : a.coche ? "✓" : ""}</span>
      <span style={{ flex: 1 }}>
        <span className="nom">{a.ligne.nom}</span>
        {raison ? <div className="pour">{raison}</div> : null}
        {refs ? <PhraseDeReference refs={refs} id={a.ligne.id} /> : null}
      </span>
      <span className="q">{quantiteDeLArticle(a.ligne)}</span>
    </button>
  );
}

function PhraseDeReference({ refs, id }: { refs: References; id: string }) {
  const phrase = phraseDeReference(referenceDe(refs, id), refs.magasin);
  return phrase ? <div className="pour co-ref">{phrase}</div> : null;
}

/**
 * T179 — La clé, et l'état de la copie. Replié par défaut : on la colle une
 * fois. À l'ouverture de l'écran, la copie se rafraîchit d'elle-même si une
 * clé est là ; sans réseau, l'ancienne reste.
 */
function ReferencesDuMagasin() {
  const etat = useReferences();
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [issue, setIssue] = useState<Issue | null>(null);
  const aUneCle = etat?.aUneCle ?? false;
  useEffect(() => {
    if (aUneCle) void rafraichirReferences().then(setIssue);
  }, [aUneCle]);
  if (!etat) return null;
  const copie = etat.copie;
  const aujourdhui = jourISO(new Date());
  const age = copie ? ageDuReleve(copie.refs, aujourdhui) : null;
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <button className="btn btn-ghost" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {ouvert ? "▾" : "▸"} Références du magasin
        {copie ? ` · relevées ${age === 0 ? "aujourd’hui" : `il y a ${pluriel(age ?? 0, "jour")}`}` : ""}
      </button>
      {ouvert ? (
        <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <div className="co-note">
            {copie
              ? `${pluriel(Object.keys(copie.refs.articles).length, "référence")} sur ce téléphone.`
              : "Aucune référence sur ce téléphone."}
            {issue ? ` ${phraseDIssue(issue)}` : ""}
          </div>
          <form
            style={{ display: "flex", gap: "var(--space-2)" }}
            onSubmit={(e) => {
              e.preventDefault();
              void poserCle(saisie)
                .then(() => rafraichirReferences())
                .then((i) => {
                  setIssue(i);
                  setSaisie("");
                });
            }}
          >
            <input
              type="password"
              autoComplete="off"
              aria-label="Clé du magasin"
              placeholder={aUneCle ? "Remplacer la clé" : "Coller la clé"}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary" type="submit" disabled={!saisie.trim()}>
              Enregistrer
            </button>
          </form>
          {aUneCle ? (
            <button className="btn btn-ghost st-petit" onClick={() => void rafraichirReferences().then(setIssue)}>
              Actualiser
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
