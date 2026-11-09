// Un projet détaillé en postes — ce que coûte un gros projet, poste par poste,
// et ce qu'il en reste à épargner.
//
// L'ORDRE DE L'ÉCRAN : le total et ce qu'il reste à épargner d'abord (c'est
// la cible du projet dans l'onglet Épargne), puis la certitude de ce total,
// les postes par groupe, ce qui les finance, et enfin le calendrier — ce qui
// tombe quel mois.
//
// Tout ce que l'écran DIT vit dans `projet.vue.ts` et `model/postes.ts`.

import { useState } from "react";
import { enSaisie, euros, lireMontant } from "../model/budget";
import {
  CERTITUDES,
  lireListe,
  montantDe,
  NOM_CERTITUDE,
  NOM_FINANCEMENT,
  SORTES_FINANCEMENT,
  type Calcul,
  type Certitude,
  type Detail,
  type Financement,
  type Poste,
  type SorteFinancement,
} from "../model/postes";
import type { Projet } from "../model/epargne";
import { jourISO } from "../db";
import { nouvelId, poserDetail, useBudget } from "../db/budget";
import { chemin } from "../nav/routes";
import { Corps } from "../ui/Coquille";
import { Boutons, Champ, ChampMontant, Feuille, Ligne, Section } from "./Budget";
import { FeuilleProjet } from "./Epargne";
import { moisEtAnnee } from "./epargne.vue";
import { DETAIL_VIDE, sousLigne, vueDuProjet } from "./projet.vue";

export function BudgetProjet({ id }: { id: string }) {
  const d = useBudget();
  if (!d) return <Corps plat><div className="co-note">chargement…</div></Corps>;
  const projet = d.projets.find((p) => p.id === id);
  return (
    <Corps plat>
      <a className="btn btn-ghost bu-retour" href={chemin({ ecran: "epargne" })}>
        ‹ Épargne
      </a>
      {projet ? (
        <ProjetEcran projet={projet} tous={d.projets} />
      ) : (
        <div className="co-vide">Ce projet n’existe plus.</div>
      )}
    </Corps>
  );
}

function ProjetEcran({ projet, tous }: { projet: Projet; tous: readonly Projet[] }) {
  const detail = projet.detail ?? DETAIL_VIDE;
  const v = vueDuProjet(detail);
  const ch = v.ch;
  const [poste, setPoste] = useState<Poste | "nouveau" | null>(null);
  const [financement, setFinancement] = useState<Financement | "nouveau" | null>(null);
  const [liste, setListe] = useState(false);
  const [fiche, setFiche] = useState(false);
  const ecrire = (x: Detail) => poserDetail(projet.id, x);
  const dates = ch.parMois.filter((m) => m.mois !== null);

  return (
    <>
      <div className="bu-section-tete">
        <div className="bu-titre-projet">{projet.nom}</div>
        <button className="btn btn-ghost" onClick={() => setFiche(true)}>
          Modifier
        </button>
      </div>

      <div className="bu-chiffres">
        <div className="bu-chiffre">
          <span className="k">Coût total</span>
          <span className="n" data-test="total">{euros(ch.total)}</span>
          <span className="q">{detail.postes.length} postes</span>
        </div>
        <div className="bu-chiffre">
          <span className="k">Financé autrement</span>
          <span className="n" data-test="finance">{euros(ch.finance)}</span>
          <span className="q">prêt, vente, dons</span>
        </div>
        <div className="bu-chiffre fort">
          <span className="k">À épargner</span>
          <span className="n" data-test="a-epargner">{euros(ch.aEpargner)}</span>
          <span className="q">{euros(projet.deja)} déjà de côté</span>
        </div>
      </div>
      <p className="co-note">{v.phrase}</p>

      {/* LA CERTITUDE DU TOTAL : un total fait d'estimations n'est pas un total
          fait de devis. La barre se remplit à mesure que les devis arrivent. */}
      {v.certitude ? (
        <div className="bu-certitude" data-test="certitude">
          <div className="barre" aria-hidden="true">
            <span className="paye" style={{ width: `${v.certitude.paye}%` }} />
            <span className="devis" style={{ width: `${v.certitude.devis}%` }} />
          </div>
          <div className="legende">
            {v.certitude.paye ? `${v.certitude.paye} % payé · ` : ""}
            {v.certitude.devis ? `${v.certitude.devis} % sur devis · ` : ""}
            {v.certitude.estime} % estimé
          </div>
        </div>
      ) : null}

      <Section titre="Postes" action="+ Poste" onAction={() => setPoste("nouveau")}>
        {ch.groupes.length ? (
          ch.groupes.map((g) => (
            <div key={g.nom} className="bu-groupe">
              <div className="bu-groupe-tete">
                <span>{g.nom}</span>
                <span>{euros(g.total)}</span>
              </div>
              {g.lignes.map((l) => (
                <Ligne
                  key={l.poste.id}
                  nom={l.poste.nom}
                  sous={sousLigne(l.poste, detail.postes)}
                  montant={euros(l.montant)}
                  onClick={() => setPoste(l.poste)}
                />
              ))}
            </div>
          ))
        ) : (
          <div className="co-vide">
            Chaque dépense du projet, avec son montant — saisi, ou calculé : une quantité par un prix, la part d’un
            autre poste.
          </div>
        )}
        <button className="btn btn-ghost btn-block" onClick={() => setListe(true)}>
          Coller une liste de postes
        </button>
      </Section>

      <Section titre="Financement" action="+ Financement" onAction={() => setFinancement("nouveau")}>
        {detail.financements.map((f) => (
          <Ligne key={f.id} nom={f.nom} sous={f.nom === NOM_FINANCEMENT[f.sorte] ? "" : NOM_FINANCEMENT[f.sorte]} montant={`−${euros(f.montant)}`} onClick={() => setFinancement(f)} />
        ))}
        {!detail.financements.length ? (
          <div className="co-vide">
            Ce qui paie une partie du projet sans venir de l’épargne : un prêt, la vente d’un bien, un don. Il se déduit
            du total.
          </div>
        ) : null}
        <Ligne nom="Reste à épargner" montant={euros(ch.aEpargner)} />
      </Section>

      {dates.length ? (
        <Section titre="Mois par mois">
          {ch.parMois.map((m) => (
            <Ligne key={m.mois ?? "sans"} nom={m.mois ? moisEtAnnee(m.mois) : "Sans date"} montant={euros(m.total)} />
          ))}
        </Section>
      ) : null}

      {poste ? (
        <FeuillePoste
          poste={poste === "nouveau" ? null : poste}
          detail={detail}
          onEcrire={ecrire}
          onFerme={() => setPoste(null)}
        />
      ) : null}
      {financement ? (
        <FeuilleFinancement
          financement={financement === "nouveau" ? null : financement}
          detail={detail}
          onEcrire={ecrire}
          onFerme={() => setFinancement(null)}
        />
      ) : null}
      {liste ? <FeuilleListe detail={detail} onEcrire={ecrire} onFerme={() => setListe(false)} /> : null}
      {fiche ? <FeuilleProjet projet={projet} tous={tous} mois={jourISO(new Date()).slice(0, 7)} onFerme={() => setFiche(false)} /> : null}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════ SAISIES */

/** « 85 », « 7,5 » → nombre ; `null` si ce n'en est pas un. */
const lireNombre = (t: string): number | null => {
  const net = t.replace(/[\s  ]/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(net) ? Number(net) : null;
};
const enNombre = (n: number): string => String(n).replace(".", ",");

type SorteCalcul = Calcul["sorte"];
const CALCULS: { sorte: SorteCalcul; nom: string }[] = [
  { sorte: "montant", nom: "Un montant" },
  { sorte: "quantite", nom: "Quantité × prix" },
  { sorte: "part", nom: "Part d’un poste" },
];

function Puces<T extends string>({ choix, valeur, onChange }: { choix: { v: T; nom: string }[]; valeur: T; onChange: (v: T) => void }) {
  return (
    <div className="aj-puces">
      {choix.map((c) => (
        <button
          key={c.v}
          type="button"
          className={`aj-puce${c.v === valeur ? " bu-choisie" : ""}`}
          aria-pressed={c.v === valeur}
          onClick={() => onChange(c.v)}
        >
          {c.nom}
        </button>
      ))}
    </div>
  );
}

function FeuillePoste({
  poste,
  detail,
  onEcrire,
  onFerme,
}: {
  poste: Poste | null;
  detail: Detail;
  onEcrire: (d: Detail) => Promise<void>;
  onFerme: () => void;
}) {
  const c0 = poste?.calcul;
  const autres = detail.postes.filter((p) => p.id !== poste?.id);
  const groupes = [...new Set(detail.postes.map((p) => p.groupe.trim()).filter(Boolean))];
  const [nom, setNom] = useState(poste?.nom ?? "");
  const [groupe, setGroupe] = useState(poste?.groupe ?? "");
  const [sorte, setSorte] = useState<SorteCalcul>(c0?.sorte ?? "montant");
  const [montant, setMontant] = useState(c0?.sorte === "montant" ? enSaisie(c0.montant) : "");
  const [quantite, setQuantite] = useState(c0?.sorte === "quantite" ? enNombre(c0.quantite) : "");
  const [prix, setPrix] = useState(c0?.sorte === "quantite" ? enSaisie(c0.prix) : "");
  const [taux, setTaux] = useState(c0?.sorte === "part" ? enNombre(c0.taux / 100) : "");
  const [de, setDe] = useState(c0?.sorte === "part" ? c0.de : (autres[0]?.id ?? ""));
  const [quand, setQuand] = useState(poste?.quand ?? "");
  const [certitude, setCertitude] = useState<Certitude>(poste?.certitude ?? "estime");

  let calcul: Calcul | null = null;
  if (sorte === "montant") {
    const m = lireMontant(montant);
    if (m !== null) calcul = { sorte, montant: m };
  } else if (sorte === "quantite") {
    const q = lireNombre(quantite);
    const p = lireMontant(prix);
    if (q !== null && p !== null) calcul = { sorte, quantite: q, prix: p };
  } else {
    const t = lireNombre(taux);
    if (t !== null && autres.some((p) => p.id === de)) calcul = { sorte, taux: Math.round(t * 100), de };
  }
  const id = poste?.id ?? "nouveau";
  const apercu = calcul ? montantDe({ id, nom, groupe, calcul, quand: null, certitude }, [...autres, { id, nom, groupe, calcul, quand: null, certitude }]) : null;
  const dependants = poste ? detail.postes.filter((p) => p.calcul.sorte === "part" && p.calcul.de === poste.id) : [];
  const ok = nom.trim() !== "" && calcul !== null && (quand === "" || /^\d{4}-\d{2}$/.test(quand));

  const valider = async () => {
    if (!ok) return;
    const p: Poste = { id: poste?.id ?? nouvelId(), nom: nom.trim(), groupe: groupe.trim(), calcul: calcul!, quand: quand || null, certitude };
    const postes = poste ? detail.postes.map((x) => (x.id === p.id ? p : x)) : [...detail.postes, p];
    await onEcrire({ ...detail, postes });
    onFerme();
  };

  return (
    <Feuille titre={poste ? "Corriger le poste" : "Nouveau poste"} onFerme={onFerme}>
      <Champ nom="Nom">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. : sol, électroménager, frais" />
      </Champ>
      <Champ nom="Groupe">
        <input value={groupe} onChange={(e) => setGroupe(e.target.value)} list="bu-groupes" placeholder="Ex. : travaux, équipement" />
        <datalist id="bu-groupes">
          {groupes.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </Champ>
      <div className="bu-champ">
        <span>Le montant</span>
        <Puces choix={CALCULS.filter((c) => c.sorte !== "part" || autres.length).map((c) => ({ v: c.sorte, nom: c.nom }))} valeur={sorte} onChange={setSorte} />
      </div>
      {sorte === "montant" ? <ChampMontant nom="Montant" valeur={montant} onChange={setMontant} /> : null}
      {sorte === "quantite" ? (
        <>
          <Champ nom="Quantité">
            <input inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} placeholder="Ex. : 40" />
          </Champ>
          <ChampMontant nom="Prix unitaire" valeur={prix} onChange={setPrix} />
        </>
      ) : null}
      {sorte === "part" ? (
        <>
          <Champ nom="Pourcentage">
            <input inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} placeholder="Ex. : 7,5" />
          </Champ>
          <Champ nom="Du poste">
            <select value={de} onChange={(e) => setDe(e.target.value)}>
              {autres.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </Champ>
        </>
      ) : null}
      {apercu !== null && sorte !== "montant" ? <p className="co-note">Soit {euros(apercu)}.</p> : null}
      <Champ nom="Payé en (facultatif)">
        <input type="month" value={quand} onChange={(e) => setQuand(e.target.value)} aria-label="Payé en" />
      </Champ>
      <div className="bu-champ">
        <span>Certitude</span>
        <Puces choix={CERTITUDES.map((c) => ({ v: c, nom: NOM_CERTITUDE[c] }))} valeur={certitude} onChange={setCertitude} />
      </div>
      {dependants.length ? (
        <p className="co-note">
          {dependants.map((p) => `« ${p.nom} »`).join(", ")} en {dependants.length > 1 ? "sont des parts" : "est une part"} :{" "}
          {dependants.length > 1 ? "ils suivront" : "il suivra"} ce montant.
        </p>
      ) : null}
      <Boutons
        ok={ok}
        onValide={() => void valider()}
        onRetire={poste ? () => void onEcrire({ ...detail, postes: detail.postes.filter((x) => x.id !== poste.id) }).then(onFerme) : undefined}
      />
    </Feuille>
  );
}

function FeuilleFinancement({
  financement,
  detail,
  onEcrire,
  onFerme,
}: {
  financement: Financement | null;
  detail: Detail;
  onEcrire: (d: Detail) => Promise<void>;
  onFerme: () => void;
}) {
  const [nom, setNom] = useState(financement?.nom ?? "");
  const [sorte, setSorte] = useState<SorteFinancement>(financement?.sorte ?? "pret");
  const [montant, setMontant] = useState(financement ? enSaisie(financement.montant) : "");
  const m = lireMontant(montant);
  const ok = m !== null;
  const valider = async () => {
    if (!ok) return;
    const f: Financement = { id: financement?.id ?? nouvelId(), nom: nom.trim() || NOM_FINANCEMENT[sorte], sorte, montant: m! };
    const financements = financement ? detail.financements.map((x) => (x.id === f.id ? f : x)) : [...detail.financements, f];
    await onEcrire({ ...detail, financements });
    onFerme();
  };
  return (
    <Feuille titre={financement ? "Corriger le financement" : "Nouveau financement"} onFerme={onFerme}>
      <div className="bu-champ">
        <span>Sorte</span>
        <Puces choix={SORTES_FINANCEMENT.map((s) => ({ v: s, nom: NOM_FINANCEMENT[s] }))} valeur={sorte} onChange={setSorte} />
      </div>
      <Champ nom="Nom (facultatif)">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder={NOM_FINANCEMENT[sorte]} />
      </Champ>
      <ChampMontant nom="Montant" valeur={montant} onChange={setMontant} />
      <Boutons
        ok={ok}
        onValide={() => void valider()}
        onRetire={
          financement
            ? () => void onEcrire({ ...detail, financements: detail.financements.filter((x) => x.id !== financement.id) }).then(onFerme)
            : undefined
        }
      />
    </Feuille>
  );
}

function FeuilleListe({ detail, onEcrire, onFerme }: { detail: Detail; onEcrire: (d: Detail) => Promise<void>; onFerme: () => void }) {
  const [texte, setTexte] = useState("");
  // DES IDS STABLES LE TEMPS DE LA SAISIE : l'aperçu se recalcule à chaque
  // frappe, et une part doit viser le même poste dans l'aperçu et en base.
  const [ids] = useState(() => new Map<number, string>());
  const idDe = (i: number) => {
    if (!ids.has(i)) ids.set(i, nouvelId());
    return ids.get(i)!;
  };
  const lu = lireListe(texte, idDe);
  const total = lu.postes.reduce((s, p) => s + montantDe(p, lu.postes), 0);
  return (
    <Feuille titre="Coller une liste de postes" onFerme={onFerme}>
      <p className="co-note">
        Une ligne par poste : <b>Groupe / Nom : valeur</b>. Le groupe est facultatif ; la valeur est un montant
        (3 000), une quantité par un prix (40 × 60) ou la part d’un autre poste de la liste (10 % de Sol).
      </p>
      <Champ nom="Liste">
        <textarea
          rows={8}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={"Travaux / Sol : 40 × 60\nÉquipement / Électroménager : 3 000\nMarge / Imprévus : 10 % de Sol"}
        />
      </Champ>
      {texte.trim() ? (
        <p className="co-note" data-test="apercu">
          {lu.postes.length} poste{lu.postes.length > 1 ? "s" : ""} compris, {euros(total)} au total
          {lu.erreurs.length ? ` · ${lu.erreurs.length} ligne${lu.erreurs.length > 1 ? "s" : ""} à revoir` : ""}.
        </p>
      ) : null}
      {lu.erreurs.length ? (
        <ul className="bu-resultats">
          {lu.erreurs.map((e) => (
            <li key={e.ligne} className="refus">
              Ligne {e.ligne} — {e.raison} : « {e.texte} »
            </li>
          ))}
        </ul>
      ) : null}
      <button
        className="btn btn-primary btn-block aj-go"
        disabled={!lu.postes.length}
        onClick={() => void onEcrire({ ...detail, postes: [...detail.postes, ...lu.postes] }).then(onFerme)}
      >
        Ajouter {lu.postes.length || ""} poste{lu.postes.length > 1 ? "s" : ""}
      </button>
    </Feuille>
  );
}
