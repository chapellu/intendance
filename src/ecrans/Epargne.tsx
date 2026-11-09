// L'écran de l'épargne — ce qui dort, ce qui reste chaque mois, et où ça va.
//
// L'ORDRE DE L'ÉCRAN EST CELUI DES GESTES : d'abord le stock (ce qui dort sur
// le compte courant, à placer une fois), puis le flux (la capacité, chaque
// mois), puis les projets qui les reçoivent, et enfin « à faire » — les
// virements, nommés, montant par montant. Une capacité d'épargne sans
// destination reste sur le compte courant : c'est exactement l'argent qui dort.
//
// Tout ce que l'écran DIT vit dans `epargne.vue.ts` ; ce fichier dessine et
// saisit.

import { useState } from "react";
import { enSaisie, euros, lireMontant } from "../model/budget";
import type { Projet, Rythme } from "../model/epargne";
import { chiffrer } from "../model/postes";
import { aller } from "../nav/useRoute";
import { jourISO } from "../db";
import { nouvelId, poserProjets, releverCourant, useBudget, type DonneesBudget } from "../db/budget";
import { useReleves, type DonneesReleves } from "../db/releves";
import { Corps } from "../ui/Coquille";
import { Boutons, Champ, ChampMontant, Feuille, Section } from "./Budget";
import {
  ditLigne,
  ditRythme,
  eurosBas,
  eurosRonds,
  phraseDuDormant,
  phraseDuFlux,
  releveDuCourant,
  vueDeLEpargne,
} from "./epargne.vue";

const aujourdhui = (): string => jourISO(new Date());

export function BudgetEpargne() {
  const d = useBudget();
  const r = useReleves();
  if (!d || !r) return <Corps plat><div className="co-note">chargement…</div></Corps>;
  return (
    <Corps plat>
      <EpargneEcran d={d} reel={r} />
    </Corps>
  );
}

type Modele = Omit<Projet, "id">;

function EpargneEcran({ d, reel }: { d: DonneesBudget; reel: DonneesReleves }) {
  const jour = aujourdhui();
  const v = vueDeLEpargne(d, reel, jour);
  const [edite, setEdite] = useState<{ projet: Projet | null; modele?: Modele } | null>(null);
  const [releve, setReleve] = useState(false);
  const { lignes, stockLibre, fluxLibre } = v.rep;
  const uneFois = lignes.filter((l) => l.uneFois > 0);
  const chaqueMois = lignes.filter((l) => l.ceMois > 0);
  const c = v.capacite;

  return (
    <>
      <div className="co-kicker">Ce qui dort sur le compte courant</div>
      <div className="bu-chiffres">
        <button className="bu-chiffre" onClick={() => setReleve(true)}>
          <span className="k">Sur le compte</span>
          <span className="n">{v.dormant ? euros(v.dormant.solde) : "—"}</span>
          <span className={`q${v.releve.perime ? " perime" : ""}`}>{v.releve.quand ?? "toucher pour relever"}</span>
        </button>
        <div className="bu-chiffre">
          <span className="k">À garder</span>
          <span className="n" data-test="a-garder">{v.dormant ? euros(v.dormant.reserve + v.dormant.matelas) : "—"}</span>
          <span className="q">{v.provisionsSurLeCourant ? "factures à venir + un mois" : "un mois de dépenses"}</span>
        </div>
        <div className="bu-chiffre fort">
          <span className="k">À placer</span>
          <span className="n" data-test="a-placer">{v.dormant ? euros(v.dormant.aPlacer) : "—"}</span>
          <span className="q">une fois</span>
        </div>
      </div>
      <p className="co-note">{phraseDuDormant(v)}</p>

      <div className="co-kicker" style={{ marginTop: "var(--space-5)" }}>Chaque mois</div>
      <div className="bu-capacite petit">
        <div className="k">Capacité d’épargne</div>
        <div className="n" data-test="capacite-retenue">{euros(c.retenue)}</div>
        <div className="k">par mois</div>
      </div>
      <p className="co-note">
        Le mois type en laisse {euros(c.ecrite)}
        {c.mesuree !== null ? `, les relevés ${euros(c.mesuree)}` : ""}
        {c.mesuree !== null && c.mesuree !== c.ecrite ? " : on planifie sur le plus prudent des deux" : ""}. {phraseDuFlux(c)}
      </p>

      {/* LES PROJETS, DANS L'ORDRE OÙ ILS SONT SERVIS. Le premier prend d'abord ce
          qui dort, puis sa part de chaque mois ; le suivant prend ce qui reste. */}
      <Section titre="Projets, par priorité" action="+ Projet" onAction={() => setEdite({ projet: null })}>
        {lignes.length ? (
          lignes.map((l, i) => {
            const r = l.projet.rythme;
            const dit = ditLigne(l);
            const cible = r.sorte === "mensuel" ? null : r.cible;
            return (
              <button
                key={l.projet.id}
                // Les couleurs des provisions : le même vocabulaire visuel — vert
                // qui avance, orange qui n'y arrive pas.
                className={`bu-provision bu-projet${l.etat === "court" ? " a-rattraper" : ""}`}
                // UN PROJET DÉTAILLÉ S'OUVRE SUR SES POSTES ; les autres, sur leur
                // fiche. La fiche reçoit le projet TEL QU'EN BASE, pas celui que la
                // répartition a vu — sa cible calculée n'a pas à s'écrire.
                onClick={() =>
                  l.projet.detail?.postes.length
                    ? aller({ ecran: "projet", id: l.projet.id })
                    : setEdite({ projet: d.projets.find((p) => p.id === l.projet.id) ?? l.projet })
                }
              >
                <div className="tete">
                  <span className="nom">
                    {i + 1}. {l.projet.nom}
                  </span>
                  <span className="v">{ditRythme(r)}</span>
                </div>
                <div className="quand">
                  {l.projet.detail?.postes.length
                    ? `${l.projet.detail.postes.length} postes · ${euros(chiffrer(l.projet.detail).total)} au total · `
                    : ""}
                  {euros(l.projet.deja)} déjà de côté
                </div>
                {/* CE QUI EST DE CÔTÉ, PUIS, PLUS PÂLE, CE QUE LE VIREMENT D'AUJOURD'HUI
                    Y AJOUTE : l'un est fait, l'autre est à faire. */}
                {cible ? (
                  <div className="jauge" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (l.projet.deja * 100) / cible)}%` }} />
                    {l.uneFois > 0 ? (
                      <span className="puis" style={{ width: `${Math.min(100, (l.uneFois * 100) / cible)}%` }} />
                    ) : null}
                  </div>
                ) : null}
                <div className="pied">
                  <span className="etat">{dit.etat}</span>
                  <span>{dit.detail}</span>
                </div>
              </button>
            );
          })
        ) : (
          <div className="co-vide">
            Une réserve pour les coups durs, un achat à préparer pour une date, une somme mise de côté chaque mois
            pour quelqu’un : chaque projet reçoit sa part, dans l’ordre.
            {v.precaution > 0 ? (
              <button
                className="btn btn-secondary btn-block"
                style={{ marginTop: "var(--space-3)" }}
                onClick={() =>
                  setEdite({
                    projet: null,
                    modele: { nom: "Réserve de précaution", rythme: { sorte: "vite", cible: v.precaution }, deja: 0 },
                  })
                }
              >
                Commencer par une réserve de précaution : {eurosRonds(v.precaution)}
              </button>
            ) : null}
          </div>
        )}
      </Section>

      {lignes.length ? (
        <div className="bu-mode" data-test="a-faire">
          <div className="co-kicker">À faire</div>
          <ol>
            {uneFois.length ? (
              <li>
                <b>Une fois, maintenant</b> : depuis le compte courant,{" "}
                {uneFois.map((l) => `${euros(l.uneFois)} vers « ${l.projet.nom} »`).join(", ")}. Puis corrige « déjà de
                côté » et relève le compte.
              </li>
            ) : null}
            {chaqueMois.length ? (
              <li>
                <b>Chaque mois, juste après la paie</b>, en virements permanents :{" "}
                {chaqueMois.map((l) => `${eurosRonds(l.ceMois)} vers « ${l.projet.nom} »`).join(", ")}.
              </li>
            ) : null}
            {fluxLibre > 0 ? (
              <li>
                <b>{eurosBas(fluxLibre)} par mois restent sans destination</b> : sans projet pour les recevoir, ils
                s’accumuleront sur le compte courant.
              </li>
            ) : null}
            {stockLibre > 0 ? (
              <li>
                <b>{euros(stockLibre)} dorment encore</b> : aucun projet n’en veut plus. Augmente un objectif, ou ajoute un
                projet.
              </li>
            ) : null}
            <li>
              <b>Une fois par mois</b>, relève le compte courant ici.
            </li>
          </ol>
        </div>
      ) : null}

      {edite ? (
        <FeuilleProjet
          projet={edite.projet}
          modele={edite.modele}
          tous={d.projets}
          mois={jour.slice(0, 7)}
          onFerme={() => setEdite(null)}
        />
      ) : null}
      {releve ? <FeuilleCourant d={d} onFerme={() => setReleve(false)} /> : null}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════ SAISIES */

type Sorte = Rythme["sorte"];
const SORTES: { sorte: Sorte; nom: string; dit: string }[] = [
  { sorte: "date", nom: "Pour une date", dit: "Un montant à réunir pour un mois donné : l’effort se répartit sur les mois qui restent." },
  { sorte: "vite", nom: "Dès que possible", dit: "Une réserve à remplir : elle prend tout ce qu’elle peut jusqu’à être pleine." },
  { sorte: "mensuel", nom: "Chaque mois", dit: "Une somme fixe, mise de côté mois après mois, sans montant à atteindre." },
];

export function FeuilleProjet({
  projet,
  modele,
  tous,
  mois,
  onFerme,
}: {
  projet: Projet | null;
  modele?: Modele | undefined;
  tous: readonly Projet[];
  mois: string;
  onFerme: () => void;
}) {
  const depart = projet ?? modele ?? null;
  const r0 = depart?.rythme;
  // DÉTAILLÉ, LE MONTANT NE SE SAISIT PLUS : il se calcule depuis les postes.
  const detail = projet?.detail?.postes.length ? projet.detail : null;
  const [nom, setNom] = useState(depart?.nom ?? "");
  const [sorte, setSorte] = useState<Sorte>(r0?.sorte ?? "date");
  const [cible, setCible] = useState(r0 && r0.sorte !== "mensuel" ? enSaisie(r0.cible) : "");
  const [pour, setPour] = useState(r0?.sorte === "date" ? r0.pour : "");
  const [mensuel, setMensuel] = useState(r0?.sorte === "mensuel" ? enSaisie(r0.mensuel) : "");
  const [deja, setDeja] = useState(depart?.deja ? enSaisie(depart.deja) : "");
  // LE RANG EST LA PRIORITÉ. Un nouveau projet se range en dernier : il passe
  // après ceux qu'on a déjà, jusqu'à ce qu'on décide le contraire.
  const autres = tous.filter((p) => p.id !== projet?.id);
  const [rang, setRang] = useState(projet ? tous.findIndex((p) => p.id === projet.id) : autres.length);

  const c = lireMontant(cible);
  const m = lireMontant(mensuel);
  const dj = deja === "" ? 0 : lireMontant(deja);
  const ok =
    nom.trim() !== "" &&
    dj !== null &&
    (sorte === "mensuel" ? m !== null && m > 0 : detail !== null || (c !== null && c > 0)) &&
    (sorte !== "date" || (/^\d{4}-\d{2}$/.test(pour) && pour > mois));

  const valider = async () => {
    if (!ok) return;
    // La cible saisie reste en base sous le détail : elle revient si l'on
    // retire tous les postes.
    const cibleGardee = c ?? (r0 && r0.sorte !== "mensuel" ? r0.cible : 0);
    const rythme: Rythme =
      sorte === "mensuel"
        ? { sorte, mensuel: m! }
        : sorte === "vite"
          ? { sorte, cible: cibleGardee }
          : { sorte, cible: cibleGardee, pour };
    // `...projet` : le détail suit — corriger le nom ne doit pas effacer les postes.
    const p: Projet = { ...(projet ?? {}), id: projet?.id ?? nouvelId(), nom: nom.trim(), rythme, deja: dj! };
    const liste = [...autres];
    liste.splice(Math.min(rang, liste.length), 0, p);
    await poserProjets(liste);
    onFerme();
  };

  return (
    <Feuille titre={projet ? "Corriger le projet" : "Nouveau projet"} onFerme={onFerme}>
      <Champ nom="Nom">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. : précaution, voiture, études" />
      </Champ>
      <div className="bu-champ">
        <span>Comment le financer</span>
        <div className="aj-puces">
          {SORTES.filter((s) => !(detail && s.sorte === "mensuel")).map((s) => (
            <button
              key={s.sorte}
              type="button"
              className={`aj-puce${s.sorte === sorte ? " bu-choisie" : ""}`}
              aria-pressed={s.sorte === sorte}
              onClick={() => setSorte(s.sorte)}
            >
              {s.nom}
            </button>
          ))}
        </div>
        <em className="dit">{SORTES.find((s) => s.sorte === sorte)!.dit}</em>
      </div>
      {sorte === "mensuel" ? (
        <ChampMontant nom="Chaque mois" valeur={mensuel} onChange={setMensuel} />
      ) : detail ? (
        <div className="bu-champ">
          <span>Montant à réunir</span>
          <em className="dit">
            Calculé depuis les postes : {euros(chiffrer(detail).aEpargner)} — le total, moins ce que d’autres financent.
          </em>
        </div>
      ) : (
        <ChampMontant nom="Montant à réunir" valeur={cible} onChange={setCible} />
      )}
      {sorte === "date" ? (
        <Champ nom="Pour">
          <input type="month" value={pour} min={mois} onChange={(e) => setPour(e.target.value)} aria-label="Pour" />
        </Champ>
      ) : null}
      <ChampMontant nom="Déjà de côté" valeur={deja} onChange={setDeja} />
      {autres.length ? (
        <div className="bu-champ">
          <span>Priorité</span>
          <div className="aj-puces">
            {Array.from({ length: autres.length + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`aj-puce${i === rang ? " bu-choisie" : ""}`}
                aria-pressed={i === rang}
                aria-label={`Priorité ${i + 1}`}
                onClick={() => setRang(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <em className="dit">Le premier est servi d’abord : ce qui dort, puis sa part de chaque mois.</em>
        </div>
      ) : null}
      {/* UN GROS PROJET N'EST PAS UNE LIGNE : on le découpe en postes, et sa
          cible s'en déduit. Un projet déjà enregistré seulement — les postes
          s'accrochent à son id. */}
      {projet && sorte !== "mensuel" ? (
        <button type="button" className="btn btn-secondary btn-block" onClick={() => aller({ ecran: "projet", id: projet.id })}>
          {detail ? "Voir les postes" : "Détailler en postes"} →
        </button>
      ) : null}
      <Boutons
        ok={ok}
        onValide={() => void valider()}
        onRetire={projet ? () => void poserProjets(autres).then(onFerme) : undefined}
      />
    </Feuille>
  );
}

function FeuilleCourant({ d, onFerme }: { d: DonneesBudget; onFerme: () => void }) {
  const jour = aujourdhui();
  const avant = releveDuCourant(d);
  const [montant, setMontant] = useState(avant ? enSaisie(avant.montant) : "");
  const centimes = lireMontant(montant);
  return (
    <Feuille titre="Relever le compte courant" onFerme={onFerme}>
      <p className="co-note">
        Le solde du compte où arrive la paie, tel que l’appli de la banque l’affiche aujourd’hui.
        {d.lieu === "courant" ? " Les provisions y dorment : c’est le même relevé que celui de l’écran Provisions." : ""}
      </p>
      <ChampMontant nom="Solde du compte courant" valeur={montant} onChange={setMontant} />
      <Boutons
        ok={centimes !== null}
        onValide={() => void releverCourant({ montant: centimes!, jour }, d.lieu).then(onFerme)}
      />
    </Feuille>
  );
}
