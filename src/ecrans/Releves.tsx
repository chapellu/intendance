// Écran « Relevés » — le mois réel, importé des relevés PDF.
//
// LE PDF EST LU SUR LE TÉLÉPHONE ET N'EST PAS GARDÉ. `lirePdf` en tire le
// texte, `lireReleve` les opérations — vérifiées contre les totaux imprimés —
// et seules les opérations entrent en base, sous l'empreinte du compte. Le
// fichier, son IBAN, son adresse, ses références de mandat restent en mémoire
// le temps de la lecture, puis disparaissent avec elle.

import { useState } from "react";
import { euros, moisType, NOM_CATEGORIE, NOM_NATURE, type Categorie, type Nature } from "../model/budget";
import { lireReleve } from "../model/releveBancaire";
import { moisDisponibles, moisReel, type Classement, type OperationEnBase } from "../model/reel";
import { useBudget } from "../db/budget";
import { classer, importerReleve, oublierLesReleves, useReleves, type DonneesReleves } from "../db/releves";
import { Corps } from "../ui/Coquille";
import { Boutons, ChoixCategorie, ChoixNature, Feuille, Ligne, Section } from "./Budget";
import { dateCourte, nomDuMois } from "./budget.vue";
import { lirePdf } from "./pdf";

const aujourdhui = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** La nature qu'on propose pour une catégorie, tant qu'on n'en a pas choisi
 *  une : c'est une première idée, pas une règle — l'écran la montre, le doigt
 *  la change. */
const NATURE_PROPOSEE: Record<Categorie, Nature> = {
  logement: "obligatoire",
  alimentation: "essentiel",
  transport: "essentiel",
  enfants: "essentiel",
  sante: "essentiel",
  assurances: "obligatoire",
  impots: "obligatoire",
  abonnements: "plaisir",
  loisirs: "plaisir",
  vacances: "plaisir",
  divers: "essentiel",
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
  const m = mois.length ? moisReel(d.operations, d.regles, choisi && mois.includes(choisi) ? choisi : mois[0]!, type) : null;

  const importer = async (fichiers: File[]) => {
    setEnCours(true);
    const res: Resultat[] = [];
    for (const f of fichiers) {
      try {
        const lecture = lireReleve(await lirePdf(f, () => {}));
        if (!lecture.ok) res.push({ fichier: f.name, ok: false, texte: lecture.raison });
        else {
          const imp = await importerReleve(lecture.releve);
          res.push({
            fichier: f.name,
            ok: true,
            texte: `${imp.compte.nom} · ${imp.nouvelles} opération${imp.nouvelles > 1 ? "s" : ""} ajoutée${imp.nouvelles > 1 ? "s" : ""}${imp.deja ? `, ${imp.deja} déjà là` : ""} · totaux vérifiés`,
          });
        }
      } catch {
        res.push({ fichier: f.name, ok: false, texte: "Ce PDF n’a pas pu être lu." });
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

          <div className="bu-chiffres">
            <div className="bu-chiffre">
              <span className="k">Entrées</span>
              <span className="n" data-test="entrees">{euros(m.entrees)}</span>
            </div>
            <div className="bu-chiffre">
              <span className="k">Dépenses</span>
              <span className="n" data-test="sorties">{euros(m.sorties)}</span>
            </div>
            <div className={`bu-chiffre fort${m.entrees - m.sorties < 0 ? " negatif" : ""}`}>
              <span className="k">Reste</span>
              <span className="n">{euros(m.entrees - m.sorties)}</span>
            </div>
          </div>
          <p className="co-note">
            {m.aClasser.length
              ? `${m.aClasser.length} opération${m.aClasser.length > 1 ? "s" : ""} à classer (${euros(m.montantAClasser)}) : tant qu’elles ne le sont pas, ces totaux sont incomplets.`
              : "Tout est classé."}
            {m.internes ? ` ${euros(m.internes)} de virements entre tes comptes, comptés ni en entrée ni en dépense.` : ""}
          </p>

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
                <div key={c.categorie} className={`bu-reel${c.prevu > 0 && c.reel > c.prevu ? " depasse" : ""}`}>
                  <div className="tete">
                    <span className="nom">{NOM_CATEGORIE[c.categorie]}</span>
                    <span className="v">
                      {euros(c.reel)} <span className="prevu">/ {euros(c.prevu)}</span>
                    </span>
                  </div>
                  <div className="jauge" aria-hidden="true">
                    <span style={{ width: `${c.prevu > 0 ? Math.min(100, (c.reel * 100) / c.prevu) : c.reel > 0 ? 100 : 0}%` }} />
                  </div>
                </div>
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

          <details className="bu-toutes">
            <summary>Toutes les opérations du mois · {m.operations.length}</summary>
            {m.operations.map((o) => (
              <Ligne
                key={o.cle}
                nom={o.libelle}
                sous={`${dateCourte(o.jour, jour)} · ${motDuClassement(d.regles.get(o.motif))}`}
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

      {aClasser ? (
        <FeuilleClassement
          op={aClasser}
          actuel={d.regles.get(aClasser.motif) ?? null}
          combien={d.operations.filter((o) => o.motif === aClasser.motif).length}
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

const signe = (c: number): string => (c > 0 ? `+${euros(c)}` : `−${euros(-c)}`);

function motDuClassement(c: Classement | undefined): string {
  if (!c) return "à classer";
  if (c.sorte === "revenu") return "revenu";
  if (c.sorte === "interne") return "entre mes comptes";
  return `${NOM_CATEGORIE[c.categorie]} · ${NOM_NATURE[c.nature].toLowerCase()}`;
}

type Sorte = Classement["sorte"];
const SORTES: { sorte: Sorte; nom: string }[] = [
  { sorte: "depense", nom: "Dépense" },
  { sorte: "revenu", nom: "Revenu" },
  { sorte: "interne", nom: "Entre mes comptes" },
];

function FeuilleClassement({
  op,
  actuel,
  combien,
  onFerme,
}: {
  op: OperationEnBase;
  actuel: Classement | null;
  combien: number;
  onFerme: () => void;
}) {
  const [sorte, setSorte] = useState<Sorte>(actuel?.sorte ?? (op.montant > 0 ? "revenu" : "depense"));
  const [categorie, setCategorie] = useState<Categorie>(actuel?.sorte === "depense" ? actuel.categorie : "alimentation");
  const [nature, setNature] = useState<Nature>(actuel?.sorte === "depense" ? actuel.nature : NATURE_PROPOSEE.alimentation);
  const [natureTouchee, setNatureTouchee] = useState(actuel?.sorte === "depense");

  const valider = async () => {
    await classer(op.motif, sorte === "depense" ? { sorte, categorie, nature } : { sorte });
    onFerme();
  };

  return (
    <Feuille titre={op.libelle} onFerme={onFerme}>
      <p className="co-note">
        {signe(op.montant)} le {dateCourte(op.jour, op.jour)}
        {op.detail.length ? ` · ${op.detail.join(" · ")}` : ""}
      </p>
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
      <p className="co-note">
        La règle vaut pour « {op.motif} » : {combien > 1 ? `les ${combien} opérations qui portent ce motif` : "cette opération"}, et
        celles des prochains relevés.
      </p>
      <Boutons ok onValide={() => void valider()} onRetire={actuel ? () => void classer(op.motif, null).then(onFerme) : undefined} />
    </Feuille>
  );
}
