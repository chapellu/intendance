// Les écrans du budget — « Le mois », « Provisions », « Enveloppes ».
//
// CE QUE CETTE PREMIÈRE VERSION NE FAIT PAS, et il faut le lire avant de la
// compléter : elle ne lit AUCUN relevé bancaire. Tout ce qu'elle montre est le
// budget tel qu'on l'a ÉCRIT — le mois type — et non le mois tel qu'il s'est
// passé. L'import des relevés bancaires viendra le comparer ; il n'a pas
// besoin d'exister pour que la question « combien puis-je épargner ? » se pose.
//
// Tout ce que les écrans DISENT vit dans `budget.vue.ts` ; ce fichier dessine
// et saisit.

import { useState, type ReactNode } from "react";
import {
  CATEGORIES,
  DIT_NATURE,
  enSaisie,
  estProvision,
  euros,
  FREQUENCES,
  lireMontant,
  NATURES,
  NOM_CATEGORIE,
  NOM_FREQUENCE,
  NOM_NATURE,
  parMois,
  prochaine,
  type Categorie,
  type Echeance,
  type Enveloppe,
  type Frequence,
  type Nature,
  type Revenu,
} from "../model/budget";
import { jourISO } from "../db";
import {
  nouvelId,
  poserEcheance,
  poserEnveloppe,
  poserRevenus,
  releverSolde,
  retirerEcheance,
  retirerEnveloppe,
  useBudget,
  type DonneesBudget,
} from "../db/budget";
import { chemin } from "../nav/routes";
import { Corps } from "../ui/Coquille";
import { dans, dateCourte, MOT_ETAT, nomDuMois, vueDesProvisions, vueDuMois } from "./budget.vue";

const aujourdhui = (): string => jourISO(new Date());

/** Les trois écrans attendent la base de la même façon : rien plutôt qu'un
 *  zéro provisoire. */
function AvecBudget({ children }: { children: (d: DonneesBudget) => ReactNode }) {
  const d = useBudget();
  if (!d) return <Corps plat><div className="co-note">chargement…</div></Corps>;
  return <Corps plat>{children(d)}</Corps>;
}

/* ═════════════════════════════════════════════════════════════════ LE MOIS */

export function BudgetMois() {
  return <AvecBudget>{(d) => <Mois d={d} />}</AvecBudget>;
}

function Mois({ d }: { d: DonneesBudget }) {
  const jour = aujourdhui();
  const v = vueDuMois(d, jour);
  const [revenu, setRevenu] = useState<Revenu | "nouveau" | null>(null);

  return (
    <>
      <div className="co-kicker">Le mois type</div>
      <div className={`bu-capacite${v.mois.capacite < 0 ? " negatif" : ""}`}>
        <div className="k">Reste pour épargner</div>
        <div className="n" data-test="capacite">{euros(v.mois.capacite)}</div>
        {v.pctCapacite !== null ? <div className="k">{v.pctCapacite} % des revenus</div> : null}
      </div>
      <p className="co-note">{v.phrase}</p>

      {/* LA BARRE EST UNE PART DES REVENUS, PAS DES DÉPENSES. C'est la seule
          lecture qui fasse apparaître l'épargne comme un poste à part entière,
          à côté des trois autres, au lieu d'un reste qu'on découvre à la fin. */}
      {v.mois.revenus > 0 ? <Barre v={v} /> : null}

      <Section titre="Revenus" action="+ Revenu" onAction={() => setRevenu("nouveau")}>
        {d.revenus.length ? (
          d.revenus.map((r) => (
            <Ligne key={r.id} nom={r.nom} montant={euros(r.montant)} onClick={() => setRevenu(r)} />
          ))
        ) : (
          <div className="co-vide">Salaires, allocations, loyers perçus : ce qui rentre chaque mois, net.</div>
        )}
      </Section>

      <Section titre="Dépenses, par nature">
        {v.parts.map((p) => {
          const poste = v.mois.postes[p.nature];
          return (
            <div key={p.nature} className={`bu-poste ${p.nature}`}>
              <div className="tete">
                <span className="nom">{NOM_NATURE[p.nature]}</span>
                <span className="v">
                  {euros(p.total)}
                  {p.pct !== null ? <span className="pct"> · {p.pct} %</span> : null}
                </span>
              </div>
              <div className="detail">
                {[
                  poste.fixes ? `${euros(poste.fixes)} de charges fixes` : null,
                  poste.provisions ? `${euros(poste.provisions)} de provisions` : null,
                  poste.enveloppes ? `${euros(poste.enveloppes)} d’enveloppes` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || DIT_NATURE[p.nature]}
              </div>
            </div>
          );
        })}
      </Section>

      {v.mois.categories.length ? (
        <Section titre="Par catégorie">
          {v.mois.categories.map((c) => (
            <Ligne key={c.categorie} nom={NOM_CATEGORIE[c.categorie]} montant={euros(c.total)} />
          ))}
        </Section>
      ) : null}

      {v.prov.lignes.length ? (
        <a className="co-appel" href={chemin({ ecran: "provisions" })}>
          {v.rattrapage > 0
            ? `Provisions : ${euros(v.prov.conseille)} à virer ce mois-ci (${euros(v.prov.regime)} en régime).`
            : `Provisions : ${euros(v.prov.regime)} à virer chaque mois sur le compte dédié.`}
        </a>
      ) : null}

      {revenu ? (
        <FeuilleRevenu
          revenu={revenu === "nouveau" ? null : revenu}
          tous={d.revenus}
          onFerme={() => setRevenu(null)}
        />
      ) : null}
    </>
  );
}

function Barre({ v }: { v: ReturnType<typeof vueDuMois> }) {
  const sur = Math.max(v.mois.revenus, v.mois.depenses);
  const largeur = (x: number) => `${Math.max(0, (x * 100) / sur)}%`;
  return (
    <div className="bu-barre" aria-hidden="true">
      {v.parts.map((p) => (p.total > 0 ? <span key={p.nature} className={p.nature} style={{ width: largeur(p.total) }} /> : null))}
      {v.mois.capacite > 0 ? <span className="epargne" style={{ width: largeur(v.mois.capacite) }} /> : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ PROVISIONS */

export function BudgetProvisions() {
  return <AvecBudget>{(d) => <ProvisionsEcran d={d} />}</AvecBudget>;
}

function ProvisionsEcran({ d }: { d: DonneesBudget }) {
  const jour = aujourdhui();
  const v = vueDesProvisions(d, jour);
  const [edite, setEdite] = useState<Echeance | "nouvelle" | null>(null);
  const [releve, setReleve] = useState(false);
  const mensuelles = d.echeances.filter((e) => !estProvision(e));

  return (
    <>
      <div className="co-kicker">Le compte des provisions</div>
      <div className="bu-chiffres">
        <button className="bu-chiffre" onClick={() => setReleve(true)}>
          <span className="k">Solde relevé</span>
          <span className="n">{d.solde ? euros(v.releve.montant) : "—"}</span>
          <span className={`q${v.releve.perime ? " perime" : ""}`}>{v.releve.quand ?? "toucher pour relever"}</span>
        </button>
        <div className="bu-chiffre">
          <span className="k">Devrait y avoir</span>
          <span className="n">{euros(v.prov.requis)}</span>
          <span className="q">aujourd’hui</span>
        </div>
        <div className="bu-chiffre fort">
          <span className="k">À virer ce mois-ci</span>
          <span className="n" data-test="conseille">{euros(v.prov.conseille)}</span>
          <span className="q">régime : {euros(v.prov.regime)}/mois</span>
        </div>
      </div>
      <p className="co-note">
        {v.phrase}
        {v.releve.perime ? " Le relevé date : mets-le à jour avant de te fier à l’écart." : ""}
      </p>

      <Section titre="Échéances" action="+ Échéance" onAction={() => setEdite("nouvelle")}>
        {v.prov.lignes.length ? (
          v.prov.lignes.map((l) => (
            <button key={l.echeance.id} className={`bu-provision ${l.etat}`} onClick={() => setEdite(l.echeance)}>
              <div className="tete">
                <span className="nom">{l.echeance.nom}</span>
                <span className="v">{euros(l.echeance.montant)}</span>
              </div>
              <div className="quand">
                {dateCourte(l.prochaine, jour)}, {dans(l.dans)} · {NOM_FREQUENCE[l.echeance.tousLes].toLowerCase()}
              </div>
              <div className="jauge" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (l.couvert * 100) / l.echeance.montant)}%` }} />
                <i style={{ left: `${Math.min(100, (l.requis * 100) / l.echeance.montant)}%` }} />
              </div>
              <div className="pied">
                <span className="etat">{MOT_ETAT[l.etat]}</span>
                <span>
                  {euros(l.couvert)} de côté · {l.conseille > 0 ? `${euros(l.conseille)} ce mois-ci` : "rien à virer"}
                </span>
              </div>
            </button>
          ))
        ) : (
          <div className="co-vide">
            L’eau au trimestre, la taxe foncière, les assurances, l’impôt : tout ce qui ne tombe pas chaque mois
            mais dont on connaît le montant et la date.
          </div>
        )}
      </Section>

      {v.plusLourd ? (
        <Section titre="Les douze prochains mois">
          <div className="bu-calendrier">
            {v.calendrier.map((m) => (
              <div key={m.mois} className={`mois${m === v.plusLourd ? " lourd" : ""}`}>
                <span className="nom">{nomDuMois(m.mois, jour)}</span>
                <span className="quoi">{m.echeances.map((x) => x.echeance.nom).join(", ") || "—"}</span>
                <span className="v">{m.total ? euros(m.total) : ""}</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section titre="Charges mensuelles">
        {mensuelles.length ? (
          mensuelles.map((e) => (
            <Ligne key={e.id} nom={e.nom} montant={`${euros(e.montant)}/mois`} onClick={() => setEdite(e)} />
          ))
        ) : (
          <div className="co-vide">
            Le prêt, la crèche, les abonnements : une échéance « tous les mois » se range ici. Elle compte dans le
            mois type, pas dans le compte des provisions.
          </div>
        )}
      </Section>

      {edite ? <FeuilleEcheance echeance={edite === "nouvelle" ? null : edite} onFerme={() => setEdite(null)} /> : null}
      {releve ? <FeuilleSolde d={d} onFerme={() => setReleve(false)} /> : null}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════ ENVELOPPES */

export function BudgetEnveloppes() {
  return <AvecBudget>{(d) => <EnveloppesEcran d={d} />}</AvecBudget>;
}

function EnveloppesEcran({ d }: { d: DonneesBudget }) {
  const [edite, setEdite] = useState<Enveloppe | "nouvelle" | null>(null);
  const total = d.enveloppes.reduce((s, e) => s + e.montant, 0);

  return (
    <>
      <div className="co-kicker">Les plafonds du mois</div>
      <div className="bu-capacite petit">
        <div className="k">Enveloppes</div>
        <div className="n">{euros(total)}</div>
        <div className="k">par mois</div>
      </div>
      <p className="co-note">
        Ce qui varie d’un mois sur l’autre — courses, essence, sorties — a un plafond qu’on se fixe. Ce sont les seuls
        postes qu’on peut serrer du jour au lendemain.
      </p>

      {NATURES.map((n) => {
        const liste = d.enveloppes.filter((e) => e.nature === n).sort((a, b) => b.montant - a.montant);
        if (!liste.length) return null;
        return (
          <Section key={n} titre={NOM_NATURE[n]}>
            {liste.map((e) => (
              <Ligne
                key={e.id}
                nom={e.nom}
                sous={NOM_CATEGORIE[e.categorie]}
                montant={euros(e.montant)}
                onClick={() => setEdite(e)}
              />
            ))}
          </Section>
        );
      })}

      {!d.enveloppes.length ? <div className="co-vide" style={{ marginTop: "var(--space-3)" }}>Aucune enveloppe pour l’instant.</div> : null}

      <button className="btn btn-primary btn-block" style={{ marginTop: "var(--space-4)" }} onClick={() => setEdite("nouvelle")}>
        + Enveloppe
      </button>

      {edite ? <FeuilleEnveloppe enveloppe={edite === "nouvelle" ? null : edite} onFerme={() => setEdite(null)} /> : null}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════ BRIQUES */

function Section({
  titre,
  action,
  onAction,
  children,
}: {
  titre: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="bu-section">
      <div className="bu-section-tete">
        <div className="co-kicker">{titre}</div>
        {action ? (
          <button className="btn btn-ghost" onClick={onAction}>
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Ligne({ nom, sous, montant, onClick }: { nom: string; sous?: string; montant: string; onClick?: () => void }) {
  const corps = (
    <>
      <span className="nom">
        {nom}
        {sous ? <span className="sous">{sous}</span> : null}
      </span>
      <span className="v">{montant}</span>
    </>
  );
  return onClick ? (
    <button className="bu-ligne" onClick={onClick}>
      {corps}
    </button>
  ) : (
    <div className="bu-ligne">{corps}</div>
  );
}

/* ═══════════════════════════════════════════════════════════════ SAISIES */

function Feuille({ titre, onFerme, children }: { titre: string; onFerme: () => void; children: ReactNode }) {
  return (
    <div className="aj-fond" onClick={onFerme}>
      <div className="aj-feuille bu-feuille" role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <div className="aj-tete">
          <div className="aj-titre">{titre}</div>
          <button className="btn btn-ghost" onClick={onFerme} aria-label="Fermer">
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Champ({ nom, children }: { nom: string; children: ReactNode }) {
  return (
    <label className="bu-champ">
      <span>{nom}</span>
      {children}
    </label>
  );
}

function ChampMontant({ nom, valeur, onChange }: { nom: string; valeur: string; onChange: (v: string) => void }) {
  const invalide = valeur !== "" && lireMontant(valeur) === null;
  return (
    <Champ nom={nom}>
      <input
        inputMode="decimal"
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        aria-invalid={invalide || undefined}
      />
      {invalide ? <em>Un montant en euros, par exemple 180 ou 83,50.</em> : null}
    </Champ>
  );
}

function ChoixNature({ valeur, onChange }: { valeur: Nature; onChange: (n: Nature) => void }) {
  return (
    <div className="bu-champ">
      <span>Nature</span>
      <div className="aj-puces">
        {NATURES.map((n) => (
          <button
            key={n}
            type="button"
            className={`aj-puce${n === valeur ? " bu-choisie" : ""}`}
            aria-pressed={n === valeur}
            onClick={() => onChange(n)}
          >
            {NOM_NATURE[n]}
          </button>
        ))}
      </div>
      <em className="dit">{DIT_NATURE[valeur]}</em>
    </div>
  );
}

function ChoixCategorie({ valeur, onChange }: { valeur: Categorie; onChange: (c: Categorie) => void }) {
  return (
    <Champ nom="Catégorie">
      <select value={valeur} onChange={(e) => onChange(e.target.value as Categorie)}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {NOM_CATEGORIE[c]}
          </option>
        ))}
      </select>
    </Champ>
  );
}

function Boutons({ ok, onValide, onRetire }: { ok: boolean; onValide: () => void; onRetire?: (() => void) | undefined }) {
  return (
    <div className="bu-boutons">
      <button className="btn btn-primary btn-block aj-go" disabled={!ok} onClick={onValide}>
        Enregistrer
      </button>
      {onRetire ? (
        <button className="btn btn-ghost btn-block" onClick={onRetire}>
          Supprimer
        </button>
      ) : null}
    </div>
  );
}

function FeuilleEcheance({ echeance, onFerme }: { echeance: Echeance | null; onFerme: () => void }) {
  const jour = aujourdhui();
  const [nom, setNom] = useState(echeance?.nom ?? "");
  const [montant, setMontant] = useState(echeance ? enSaisie(echeance.montant) : "");
  const [tousLes, setTousLes] = useState<Frequence>(echeance?.tousLes ?? 12);
  // ON MONTRE LA PROCHAINE DATE, PAS LA RÉFÉRENCE STOCKÉE : c'est celle qu'on a
  // en tête (« l'assurance tombe le 1er mars »), et l'une vaut l'autre pour le
  // modèle — n'importe quelle occurrence retrouve toutes les autres.
  const [date, setDate] = useState(echeance ? prochaine(echeance, jour) : "");
  const [categorie, setCategorie] = useState<Categorie>(echeance?.categorie ?? "logement");
  const [nature, setNature] = useState<Nature>(echeance?.nature ?? "obligatoire");

  const centimes = lireMontant(montant);
  const ok = nom.trim() !== "" && centimes !== null && centimes > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const apercu = ok && tousLes > 1 ? `soit ${euros(parMois({ montant: centimes!, tousLes }))} à mettre de côté par mois` : null;

  const valider = async () => {
    if (!ok) return;
    await poserEcheance({ id: echeance?.id ?? nouvelId(), nom: nom.trim(), montant: centimes!, tousLes, reference: date, categorie, nature });
    onFerme();
  };

  return (
    <Feuille titre={echeance ? echeance.nom : "Nouvelle échéance"} onFerme={onFerme}>
      <Champ nom="Nom">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Eau, taxe foncière, assurance auto…" />
      </Champ>
      <ChampMontant nom="Montant à chaque échéance" valeur={montant} onChange={setMontant} />
      <Champ nom="Revient">
        <select value={tousLes} onChange={(e) => setTousLes(Number(e.target.value) as Frequence)}>
          {FREQUENCES.map((f) => (
            <option key={f} value={f}>
              {NOM_FREQUENCE[f]}
            </option>
          ))}
        </select>
      </Champ>
      <Champ nom={tousLes > 1 ? "Prochaine échéance (ou une date passée)" : "Jour de prélèvement (une date du mois)"}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Champ>
      <ChoixCategorie valeur={categorie} onChange={setCategorie} />
      <ChoixNature valeur={nature} onChange={setNature} />
      {apercu ? <p className="co-note">{apercu}</p> : null}
      <Boutons
        ok={ok}
        onValide={() => void valider()}
        onRetire={echeance ? () => void retirerEcheance(echeance.id).then(onFerme) : undefined}
      />
    </Feuille>
  );
}

function FeuilleEnveloppe({ enveloppe, onFerme }: { enveloppe: Enveloppe | null; onFerme: () => void }) {
  const [nom, setNom] = useState(enveloppe?.nom ?? "");
  const [montant, setMontant] = useState(enveloppe ? enSaisie(enveloppe.montant) : "");
  const [categorie, setCategorie] = useState<Categorie>(enveloppe?.categorie ?? "alimentation");
  const [nature, setNature] = useState<Nature>(enveloppe?.nature ?? "essentiel");
  const centimes = lireMontant(montant);
  const ok = nom.trim() !== "" && centimes !== null && centimes > 0;

  const valider = async () => {
    if (!ok) return;
    await poserEnveloppe({ id: enveloppe?.id ?? nouvelId(), nom: nom.trim(), montant: centimes!, categorie, nature });
    onFerme();
  };

  return (
    <Feuille titre={enveloppe ? enveloppe.nom : "Nouvelle enveloppe"} onFerme={onFerme}>
      <Champ nom="Nom">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Courses, essence, sorties…" />
      </Champ>
      <ChampMontant nom="Plafond par mois" valeur={montant} onChange={setMontant} />
      <ChoixCategorie valeur={categorie} onChange={setCategorie} />
      <ChoixNature valeur={nature} onChange={setNature} />
      <Boutons
        ok={ok}
        onValide={() => void valider()}
        onRetire={enveloppe ? () => void retirerEnveloppe(enveloppe.id).then(onFerme) : undefined}
      />
    </Feuille>
  );
}

function FeuilleRevenu({ revenu, tous, onFerme }: { revenu: Revenu | null; tous: readonly Revenu[]; onFerme: () => void }) {
  const [nom, setNom] = useState(revenu?.nom ?? "");
  const [montant, setMontant] = useState(revenu ? enSaisie(revenu.montant) : "");
  const centimes = lireMontant(montant);
  const ok = nom.trim() !== "" && centimes !== null && centimes > 0;

  const valider = async () => {
    if (!ok) return;
    const r: Revenu = { id: revenu?.id ?? nouvelId(), nom: nom.trim(), montant: centimes! };
    await poserRevenus(revenu ? tous.map((x) => (x.id === r.id ? r : x)) : [...tous, r]);
    onFerme();
  };

  return (
    <Feuille titre={revenu ? revenu.nom : "Nouveau revenu"} onFerme={onFerme}>
      <Champ nom="Nom">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Salaire, allocations familiales…" />
      </Champ>
      <ChampMontant nom="Net par mois" valeur={montant} onChange={setMontant} />
      <Boutons
        ok={ok}
        onValide={() => void valider()}
        onRetire={revenu ? () => void poserRevenus(tous.filter((x) => x.id !== revenu.id)).then(onFerme) : undefined}
      />
    </Feuille>
  );
}

function FeuilleSolde({ d, onFerme }: { d: DonneesBudget; onFerme: () => void }) {
  const [montant, setMontant] = useState(d.solde ? enSaisie(d.solde.montant) : "");
  const centimes = lireMontant(montant);
  const ok = centimes !== null;

  const valider = async () => {
    if (!ok) return;
    await releverSolde({ montant: centimes!, jour: aujourdhui() });
    onFerme();
  };

  return (
    <Feuille titre="Relever le solde" onFerme={onFerme}>
      <p className="co-note">
        Le solde du livret ou du compte où dorment les provisions, tel que l’appli de la banque l’affiche aujourd’hui.
      </p>
      <ChampMontant nom="Solde" valeur={montant} onChange={setMontant} />
      <Boutons ok={ok} onValide={() => void valider()} />
    </Feuille>
  );
}
