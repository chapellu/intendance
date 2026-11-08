// Écran « Relevés » — le mois réel, importé des relevés PDF.
//
// LE PDF EST LU SUR LE TÉLÉPHONE ET N'EST PAS GARDÉ. `lirePdf` en tire le
// texte, `lireReleve` les opérations — vérifiées contre les totaux imprimés —
// et seules les opérations entrent en base, sous l'empreinte du compte. Le
// fichier, son IBAN, son adresse, ses références de mandat restent en mémoire
// le temps de la lecture, puis disparaissent avec elle.

import { useState } from "react";
import { euros, moisType, NATURE_PROPOSEE, NOM_CATEGORIE, NOM_NATURE, type Categorie, type Nature } from "../model/budget";
import { lireReleve } from "../model/releveBancaire";
import { classerTout, composition, historique, moisDisponibles, moisReel, type Classement, type Classes, type MoisReel, type OperationEnBase, type Source, type Vue } from "../model/reel";
import { useBudget } from "../db/budget";
import { classer, classerOperation, importerReleve, oublierLesReleves, useReleves, type DonneesReleves } from "../db/releves";
import { Corps } from "../ui/Coquille";
import { ChoixCategorie, ChoixNature, Feuille, Ligne, Section } from "./Budget";
import { dateCourte, nomDuMois } from "./budget.vue";
import { lirePdf } from "./pdf";

const aujourdhui = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Resultat {
  fichier: string;
  ok: boolean;
  texte: string;
}

export function Releves() {
  const d = useReleves();
  const budget = useBudget();
  if (!d || !budget) return <Corps plat><div className="co-note">chargement…</div></Corps>;
  return (
    <Corps plat>
      <Contenu d={d} type={moisType(budget.revenus, budget.echeances, budget.enveloppes)} />
    </Corps>
  );
}

function Contenu({ d, type }: { d: DonneesReleves; type: ReturnType<typeof moisType> }) {
  const jour = aujourdhui();
  const mois = moisDisponibles(d.operations);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [aClasser, setAClasser] = useState<OperationEnBase | null>(null);
  const [oubli, setOubli] = useState(false);
  // CE QU'ON A OUVERT POUR VOIR DE QUOI IL EST FAIT : un total du haut, une
  // catégorie, ou « toutes les dépenses ». `retour` ramène à la liste des
  // catégories quand on y est entré par elle.
  const [vue, setVue] = useState<{ vue: Vue | "depenses"; retour: boolean } | null>(null);
  // LE CLASSEMENT EFFECTIF de chaque opération : exception, virement apparié,
  // puis règle du motif (`classerTout`). Tout ce qui suit le lit, jamais les
  // règles directement — une règle ne sait pas sur quel compte elle tombe.
  const eff = classerTout(d.operations, d.regles, d.exceptions);
  const m = mois.length ? moisReel(d.operations, eff.classes, choisi && mois.includes(choisi) ? choisi : mois[0]!, type) : null;

  const importer = async (fichiers: File[]) => {
    setEnCours(true);
    const res: Resultat[] = [];
    for (const f of fichiers) {
      // L'ÉTAPE VA AVEC L'ERREUR. La première version disait « Ce PDF n'a pas
      // pu être lu » pour tout ce qui lève, et le premier essai sur iPhone n'a
      // rien pu dire de plus : ni si pdf.js avait échoué, ni la base. Le
      // message d'une exception ne porte aucune donnée du relevé — c'est celui
      // de pdf.js, de la base ou du navigateur — et c'est lui qui permet de
      // corriger.
      let etape = "lecture du PDF";
      try {
        const texte = await lirePdf(f, () => {});
        etape = "lecture du relevé";
        const lecture = lireReleve(texte);
        if (!lecture.ok) res.push({ fichier: f.name, ok: false, texte: lecture.raison });
        else {
          etape = "enregistrement";
          const imp = await importerReleve(lecture.releve);
          res.push({
            fichier: f.name,
            ok: true,
            texte: `${imp.compte.nom} · ${imp.nouvelles} opération${imp.nouvelles > 1 ? "s" : ""} ajoutée${imp.nouvelles > 1 ? "s" : ""}${imp.deja ? `, ${imp.deja} déjà là` : ""} · totaux vérifiés`,
          });
        }
      } catch (e) {
        res.push({ fichier: f.name, ok: false, texte: echec(etape, e) });
      }
    }
    setResultats(res);
    setEnCours(false);
  };

  return (
    <>
      <div className="co-kicker">Le mois réel</div>
      <label className={`btn btn-primary btn-block tk-scanner bu-import${enCours ? " occupe" : ""}`}>
        {enCours ? "Lecture…" : "Importer des relevés (PDF)"}
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          data-testid="releve-pdf"
          disabled={enCours}
          onChange={(e) => {
            const f = [...(e.currentTarget.files ?? [])];
            e.currentTarget.value = "";
            if (f.length) void importer(f);
          }}
        />
      </label>
      <p className="co-note">
        Le relevé est lu sur ce téléphone et n’est pas gardé : seules les opérations restent, rien n’est envoyé. Un
        relevé dont les totaux ne tombent pas juste est refusé plutôt qu’importé faux.
      </p>
      {resultats.length ? (
        <ul className="bu-resultats" data-testid="releve-resultats">
          {resultats.map((r, i) => (
            <li key={i} className={r.ok ? "ok" : "refus"}>
              {r.texte}
            </li>
          ))}
        </ul>
      ) : null}

      {!m ? (
        <div className="co-vide" style={{ marginTop: "var(--space-3)" }}>
          Aucun relevé importé. Télécharge le relevé du mois depuis l’appli ou le site de ta banque, puis choisis le
          fichier ici.
        </div>
      ) : (
        <>
          <div className="co-pilules bu-mois" style={{ margin: "var(--space-4) 0 var(--space-2)" }}>
            {mois.slice(0, 12).map((x) => (
              <button key={x} className={`co-pilule${x === m.mois ? " actif" : ""}`} onClick={() => setChoisi(x)}>
                {nomDuMois(x, jour)}
              </button>
            ))}
          </div>

          {/* DEUX PAR DEUX : ce qui entre et ce qui sort, puis ce qu'on a mis de
              côté et ce qui reste sur les comptes. L'épargne a sa case parce que
              c'est le chiffre que tout le budget sert à faire grossir. */}
          <div className="bu-chiffres deux">
            <button className="bu-chiffre ouvrable" onClick={() => setVue({ vue: { sorte: "revenu" }, retour: false })}>
              <span className="k">Entrées</span>
              <span className="n" data-test="entrees">{euros(m.entrees)}</span>
            </button>
            <button className="bu-chiffre ouvrable" onClick={() => setVue({ vue: "depenses", retour: false })}>
              <span className="k">Dépenses</span>
              <span className="n" data-test="sorties">{euros(m.sorties)}</span>
            </button>
            <button className="bu-chiffre fort ouvrable" onClick={() => setVue({ vue: { sorte: "epargne" }, retour: false })}>
              <span className="k">Épargné</span>
              <span className="n" data-test="epargne">{euros(m.epargne)}</span>
              {type.capacite > 0 ? <span className="q">le mois type en permet {euros(type.capacite)}</span> : null}
            </button>
            <div className={`bu-chiffre${m.entrees - m.sorties - m.epargne < 0 ? " negatif" : ""}`}>
              <span className="k">Reste sur les comptes</span>
              <span className="n">{euros(m.entrees - m.sorties - m.epargne)}</span>
            </div>
          </div>
          <p className="co-note">
            {m.aClasser.length
              ? `${m.aClasser.length} opération${m.aClasser.length > 1 ? "s" : ""} à classer (${euros(m.montantAClasser)}) : tant qu’elles ne le sont pas, ces totaux sont incomplets.`
              : "Tout est classé."}
            {m.internes ? ` ${euros(m.internes)} de virements entre tes comptes, comptés ni en entrée ni en dépense.` : ""}
          </p>
          {m.internes ? (
            <button className="btn btn-ghost" onClick={() => setVue({ vue: { sorte: "interne" }, retour: false })}>
              Voir les virements entre comptes
            </button>
          ) : null}

          {m.aClasser.length ? (
            <Section titre={`À classer · ${m.aClasser.length}`}>
              {m.aClasser.map((o) => (
                <Ligne
                  key={o.cle}
                  nom={o.libelle}
                  sous={dateCourte(o.jour, jour)}
                  montant={signe(o.montant)}
                  onClick={() => setAClasser(o)}
                />
              ))}
            </Section>
          ) : null}

          <Section titre="Par catégorie · réel / prévu">
            {m.categories.length ? (
              m.categories.map((c) => (
                <button
                  key={c.categorie}
                  className={`bu-reel${c.prevu > 0 && c.reel > c.prevu ? " depasse" : ""}`}
                  onClick={() => setVue({ vue: { sorte: "depense", categorie: c.categorie }, retour: false })}
                >
                  <div className="tete">
                    <span className="nom">
                      {NOM_CATEGORIE[c.categorie]}
                      {m.sorties > 0 && c.reel > 0 ? <span className="pct"> · {Math.round((c.reel * 100) / m.sorties)} %</span> : null}
                    </span>
                    <span className="v">
                      {euros(c.reel)} <span className="prevu">/ {euros(c.prevu)}</span>
                    </span>
                  </div>
                  <div className="jauge" aria-hidden="true">
                    <span style={{ width: `${c.prevu > 0 ? Math.min(100, (c.reel * 100) / c.prevu) : c.reel > 0 ? 100 : 0}%` }} />
                  </div>
                </button>
              ))
            ) : (
              <div className="co-vide">Classe quelques opérations pour voir le réel en face du budget.</div>
            )}
          </Section>
          <p className="co-note">
            Le prévu lisse les provisions au mois : une facture trimestrielle dépasse son mois, puis laisse les deux
            suivants sous le prévu.
          </p>

          <Section titre="Par nature">
            {m.natures.map((n) => (
              <Ligne key={n.nature} nom={NOM_NATURE[n.nature]} montant={`${euros(n.reel)} / ${euros(n.prevu)}`} />
            ))}
          </Section>

          <MoisParMois d={d} eff={eff} type={type} jour={jour} actuel={m.mois} onChoisir={setChoisi} />

          <details className="bu-toutes">
            <summary>Toutes les opérations du mois · {m.operations.length}</summary>
            {m.operations.map((o) => (
              <Ligne
                key={o.cle}
                nom={o.libelle}
                sous={`${dateCourte(o.jour, jour)} · ${motDuClassement(eff.classes.get(o.cle), eff.sources.get(o.cle))}`}
                montant={signe(o.montant)}
                onClick={() => setAClasser(o)}
              />
            ))}
          </details>
        </>
      )}

      {d.comptes.length ? (
        <Section titre="Comptes">
          {d.comptes.map((c) => (
            <Ligne key={c.id} nom={c.nom} sous={`relevés jusqu’au ${dateCourte(c.jusquau, jour)}`} montant="" />
          ))}
          <button className="btn btn-ghost btn-block" style={{ marginTop: "var(--space-2)" }} onClick={() => setOubli(true)}>
            Tout oublier des relevés
          </button>
        </Section>
      ) : null}

      {vue && m ? (
        <FeuilleComposition
          d={d}
          eff={eff}
          m={m}
          jour={jour}
          vue={vue.vue}
          onRetour={vue.retour ? () => setVue({ vue: "depenses", retour: false }) : undefined}
          onOuvrir={(v) => setVue({ vue: v, retour: true })}
          onOperation={setAClasser}
          onFerme={() => setVue(null)}
        />
      ) : null}
      {aClasser ? (
        <FeuilleClassement
          op={aClasser}
          d={d}
          eff={eff}
          onFerme={() => setAClasser(null)}
        />
      ) : null}
      {oubli ? (
        <Feuille titre="Tout oublier ?" onFerme={() => setOubli(false)}>
          <p className="co-note">
            Les opérations importées, les comptes et les règles de classement seront effacés de ce téléphone. Le budget
            écrit (échéances, enveloppes, revenus) ne bouge pas.
          </p>
          <button
            className="btn btn-primary btn-block aj-go"
            onClick={() => void oublierLesReleves().then(() => setOubli(false))}
          >
            Effacer
          </button>
        </Feuille>
      ) : null}
    </>
  );
}

/** Ce qu'on dit d'une exception : l'étape, et ce que l'exception dit d'elle-même. */
export function echec(etape: string, e: unknown): string {
  const nom = e instanceof Error ? e.name : "";
  if (nom === "PasswordException") return "Ce PDF est protégé par un mot de passe : exporte-le sans protection depuis la banque.";
  const message = e instanceof Error ? `${nom && nom !== "Error" ? `${nom} : ` : ""}${e.message}` : String(e);
  return `Échec à l’étape « ${etape} » — ${message || "sans message"}`;
}

/* ═════════════════════════════════════════════════════ CE QUI COMPOSE */

const TITRE_VUE = (v: Vue): string =>
  v.sorte === "depense" ? NOM_CATEGORIE[v.categorie]
  : v.sorte === "revenu" ? "Revenus"
  : v.sorte === "epargne" ? "Épargne"
  : v.sorte === "interne" ? "Entre mes comptes"
  : "À classer";

/**
 * Ce qui compose un total : les catégories de toutes les dépenses, ou les
 * motifs d'une vue — chacun avec son total, sa part et son nombre
 * d'opérations, et ses opérations au toucher. Une opération touchée s'ouvre
 * dans la fiche de classement, par-dessus : on corrige là où l'on a vu.
 */
function FeuilleComposition({
  d,
  eff,
  m,
  jour,
  vue,
  onRetour,
  onOuvrir,
  onOperation,
  onFerme,
}: {
  d: DonneesReleves;
  eff: Classes;
  m: MoisReel;
  jour: string;
  vue: Vue | "depenses";
  onRetour: (() => void) | undefined;
  onOuvrir: (v: Vue) => void;
  onOperation: (o: OperationEnBase) => void;
  onFerme: () => void;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const mois = nomDuMois(m.mois, jour);

  if (vue === "depenses") {
    return (
      <Feuille titre="Dépenses" onFerme={onFerme}>
        <div className="bu-capacite petit">
          <div className="n">{euros(m.sorties)}</div>
          <div className="k">
            {mois} · {m.categories.filter((c) => c.reel).length} catégories
          </div>
        </div>
        <div>
          {m.categories
            .filter((c) => c.reel)
            .map((c) => (
              <Ligne
                key={c.categorie}
                nom={NOM_CATEGORIE[c.categorie]}
                sous={`${m.sorties > 0 ? Math.round((c.reel * 100) / m.sorties) : 0} %${c.prevu ? ` · prévu ${euros(c.prevu)}` : ""}`}
                montant={euros(c.reel)}
                onClick={() => onOuvrir({ sorte: "depense", categorie: c.categorie })}
              />
            ))}
          {m.aClasser.length ? (
            <Ligne nom="À classer" sous={`${m.aClasser.length} opérations`} montant={euros(m.montantAClasser)} onClick={() => onOuvrir({ sorte: "a-classer" })} />
          ) : null}
        </div>
      </Feuille>
    );
  }

  const c = composition(d.operations, eff.classes, m.mois, vue);
  const n = c.groupes.reduce((s, g) => s + g.operations.length, 0);
  const part = vue.sorte === "depense" && m.sorties > 0 ? ` · ${Math.round((c.total * 100) / m.sorties)} % des dépenses` : "";
  return (
    <Feuille titre={TITRE_VUE(vue)} onFerme={onFerme}>
      {onRetour ? (
        <button className="btn btn-ghost bu-retour" onClick={onRetour}>
          ← Toutes les dépenses
        </button>
      ) : null}
      <div className="bu-capacite petit">
        <div className="n" data-test="composition-total">{euros(c.total)}</div>
        <div className="k">
          {mois} · {n} opération{n > 1 ? "s" : ""}
          {part}
        </div>
      </div>
      {c.groupes.length ? (
        <div data-test="composition">
          {c.groupes.map((g) => (
            <div key={g.motif} className={`bu-groupe${ouvert === g.motif ? " ouvert" : ""}`}>
              <Ligne
                nom={g.nom}
                sous={`${g.operations.length} opération${g.operations.length > 1 ? "s" : ""}${c.total ? ` · ${Math.round((g.total * 100) / c.total)} %` : ""}`}
                montant={euros(g.total)}
                onClick={() => setOuvert(ouvert === g.motif ? null : g.motif)}
              />
              {ouvert === g.motif
                ? g.operations.map((o) => (
                    <Ligne key={o.cle} nom={dateCourte(o.jour, jour)} sous={o.libelle} montant={signe(o.montant)} onClick={() => onOperation(o)} />
                  ))
                : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="co-vide">Rien ce mois-ci.</div>
      )}
    </Feuille>
  );
}

/** Les derniers mois importés, et ce qu'ils ont laissé : la capacité
 *  d'épargne réelle, en face de celle que le mois type promet. */
function MoisParMois({
  d,
  eff,
  type,
  jour,
  actuel,
  onChoisir,
}: {
  d: DonneesReleves;
  eff: Classes;
  type: ReturnType<typeof moisType>;
  jour: string;
  actuel: string;
  onChoisir: (mois: string) => void;
}) {
  const h = historique(d.operations, eff.classes, type);
  if (h.mois.length < 2) return null;
  return (
    <Section titre="Mois par mois">
      {h.mois.map((x) => (
        <Ligne
          key={x.mois}
          nom={`${nomDuMois(x.mois, jour)}${x.mois === actuel ? " · affiché" : ""}`}
          sous={`${signe(x.entrees)} · ${signe(-x.sorties)}${x.epargne ? ` · ${euros(x.epargne)} épargnés` : ""}${x.aClasser ? ` · ${x.aClasser} à classer` : ""}`}
          montant={signe(x.capacite)}
          onClick={() => onChoisir(x.mois)}
        />
      ))}
      {h.moyenne !== null ? (
        <p className="co-note" data-test="moyenne">
          En moyenne, {h.moyenne >= 0 ? `${euros(h.moyenne)} laissés` : `${euros(-h.moyenne)} de trop`} par mois sur{" "}
          {h.mois.length} mois{type.capacite > 0 ? ` ; le mois type en prévoit ${euros(type.capacite)}` : ""}. Un mois
          n’est complet que si les relevés de tous tes comptes le couvrent.
        </p>
      ) : null}
    </Section>
  );
}

const signe = (c: number): string => (c > 0 ? `+${euros(c)}` : c < 0 ? `−${euros(-c)}` : euros(0));

function motDuClassement(c: Classement | undefined, source?: Source): string {
  if (!c) return "à classer";
  if (source === "paire") return "entre mes comptes (repéré)";
  if (c.sorte === "revenu") return "revenu";
  if (c.sorte === "interne") return "entre mes comptes";
  if (c.sorte === "epargne") return "épargne";
  return `${NOM_CATEGORIE[c.categorie]} · ${NOM_NATURE[c.nature].toLowerCase()}`;
}

type Sorte = Classement["sorte"];
const SORTES: { sorte: Sorte; nom: string; dit: string }[] = [
  { sorte: "depense", nom: "Dépense", dit: "de l’argent qui part pour de bon" },
  { sorte: "revenu", nom: "Revenu", dit: "salaire, allocations, remboursements de frais" },
  { sorte: "epargne", nom: "Épargne", dit: "un versement vers un livret, une assurance-vie, un PEA" },
  { sorte: "interne", nom: "Entre mes comptes", dit: "d’un compte courant à l’autre : ni gagné, ni dépensé" },
];

function FeuilleClassement({
  op,
  d,
  eff,
  onFerme,
}: {
  op: OperationEnBase;
  d: DonneesReleves;
  eff: Classes;
  onFerme: () => void;
}) {
  const actuel = eff.classes.get(op.cle) ?? null;
  const source = eff.sources.get(op.cle);
  const regle = d.regles.get(op.motif) ?? null;
  const exception = d.exceptions.get(op.cle) ?? null;
  const autreJambe = eff.paires.has(op.cle) ? d.operations.find((o) => o.cle === eff.paires.get(op.cle)) : undefined;
  const combien = d.operations.filter((o) => o.motif === op.motif).length;

  const [sorte, setSorte] = useState<Sorte>(actuel?.sorte ?? (op.montant > 0 ? "revenu" : "depense"));
  const [categorie, setCategorie] = useState<Categorie>(actuel?.sorte === "depense" ? actuel.categorie : "alimentation");
  const [nature, setNature] = useState<Nature>(actuel?.sorte === "depense" ? actuel.nature : NATURE_PROPOSEE.alimentation);
  const [natureTouchee, setNatureTouchee] = useState(actuel?.sorte === "depense");
  // LA PORTÉE : tout le motif (une règle) ou cette opération seule (une
  // exception). Seule par défaut quand l'opération a déjà une exception, ou
  // quand c'est un virement apparié — corriger celui-là ne doit pas changer
  // la règle des autres virements du même nom.
  const [seule, setSeule] = useState(exception !== null || source === "paire");

  const valider = async () => {
    const c: Classement = sorte === "depense" ? { sorte, categorie, nature } : { sorte };
    if (seule) await classerOperation(op.cle, c);
    else {
      await classer(op.motif, c);
      // Une règle choisie pour tout le motif : l'exception de cette opération
      // n'a plus lieu d'être, sinon elle resterait seule à part sans le dire.
      if (exception) await classerOperation(op.cle, null);
    }
    onFerme();
  };

  const retirer = exception
    ? { mot: "Revenir à la règle du motif", faire: () => classerOperation(op.cle, null) }
    : regle
      ? { mot: "Retirer la règle", faire: () => classer(op.motif, null) }
      : null;

  return (
    <Feuille titre={op.libelle} onFerme={onFerme}>
      <p className="co-note">
        {signe(op.montant)} le {dateCourte(op.jour, op.jour)}
        {op.detail.length ? ` · ${op.detail.join(" · ")}` : ""}
      </p>
      {autreJambe && source === "paire" ? (
        <p className="co-note bu-repere" data-test="paire">
          Repéré comme un virement entre tes comptes : il répond à {signe(autreJambe.montant)} le{" "}
          {dateCourte(autreJambe.jour, autreJambe.jour)} sur {d.comptes.find((c) => c.id === autreJambe.compte)?.nom ?? "un autre compte"}.
          Il n’est compté ni en entrée ni en dépense, quelle que soit la règle de son motif.
        </p>
      ) : null}
      <div className="bu-champ">
        <span>C’est</span>
        <div className="aj-puces">
          {SORTES.map((s) => (
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
      {sorte === "depense" ? (
        <>
          <ChoixCategorie
            valeur={categorie}
            onChange={(c) => {
              setCategorie(c);
              if (!natureTouchee) setNature(NATURE_PROPOSEE[c]);
            }}
          />
          <ChoixNature
            valeur={nature}
            onChange={(n) => {
              setNature(n);
              setNatureTouchee(true);
            }}
          />
        </>
      ) : null}
      <div className="bu-champ">
        <span>Pour</span>
        <div className="aj-puces">
          <button type="button" className={`aj-puce${!seule ? " bu-choisie" : ""}`} aria-pressed={!seule} onClick={() => setSeule(false)}>
            {combien > 1 ? `Les ${combien} « ${op.motif} »` : `Tout « ${op.motif} »`}
          </button>
          <button type="button" className={`aj-puce${seule ? " bu-choisie" : ""}`} aria-pressed={seule} onClick={() => setSeule(true)}>
            Seulement cette opération
          </button>
        </div>
        <em className="dit">
          {seule
            ? "Les autres opérations de ce motif gardent leur classement."
            : "Une règle : elle vaut aussi pour les prochains relevés — sauf pour un virement repéré entre tes comptes."}
        </em>
      </div>
      <div className="bu-boutons">
        <button className="btn btn-primary btn-block aj-go" onClick={() => void valider()}>
          Enregistrer
        </button>
        {retirer ? (
          <button className="btn btn-ghost btn-block" onClick={() => void retirer.faire().then(onFerme)}>
            {retirer.mot}
          </button>
        ) : null}
      </div>
    </Feuille>
  );
}
