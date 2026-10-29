// Scanner un ticket — T138.
//
// UN TAP, UNE PHOTO, UNE REVUE. Le bouton ouvre l'appareil photo (ou la
// galerie) ; la lecture tourne sur le téléphone avec sa barre de progression ;
// la revue montre une rangée par ligne, et « Tout rentrer » passe par le même
// chemin que la liste. La photo ne vit que dans cet écran : rien ne la garde.
//
// T160 — LA FACTURE DU DRIVE PREND LE MÊME CHEMIN. Un PDF n'a pas d'OCR à
// passer : son texte est lu par pdf.js, puis par `lireFactureDrive`, et la
// revue qui suit est celle du ticket. Le PDF, lui non plus, n'est pas gardé.

import { useEffect, useMemo, useState } from "react";
import { base } from "../db";
import { lireAppris, rentrerUnTicket } from "../db/tickets";
import { estFactureDrive, lireFactureDrive } from "../model/factureDrive";
import { lireTicket, type TicketLu } from "../model/ticket";
import { candidatsDu } from "../model/ticketCorrespondance";
import type { Catalogue } from "../model/types";
import { lireImage } from "./ocr";
import { lirePdf } from "./pdf";
import {
  aRentrer,
  choisir,
  euros,
  nbAuStock,
  nbSansChoix,
  phraseDuTotal,
  rangeesDu,
  type Rangee,
} from "./ticket.vue";

export function BoutonScanner({ onImage }: { onImage: (f: File) => void }) {
  return (
    <label className="btn btn-secondary btn-block tk-scanner">
      Scanner un ticket
      <input
        type="file"
        accept="image/*"
        capture="environment"
        data-testid="ticket-photo"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          // Vider le champ : la même photo reprise doit pouvoir repartir, et
          // le navigateur ne garde pas de référence au fichier.
          e.currentTarget.value = "";
          if (f) onImage(f);
        }}
      />
    </label>
  );
}

/** T160 — la facture PDF du drive : pas d'appareil photo, un fichier. */
export function BoutonFacture({ onFichier }: { onFichier: (f: File) => void }) {
  return (
    <label className="btn btn-secondary btn-block tk-scanner">
      Rentrer une facture drive (PDF)
      <input
        type="file"
        accept="application/pdf,.pdf"
        data-testid="facture-pdf"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (f) onFichier(f);
        }}
      />
    </label>
  );
}

const estUnPdf = (f: File): boolean => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

type Etape =
  | { sorte: "lecture"; progres: number }
  | { sorte: "echec"; message: string }
  | { sorte: "revue"; lu: TicketLu }
  | { sorte: "fait"; rentrees: number; cochees: number; jour: string };

export function RevueDuTicket({
  image,
  catalogue,
  liste,
  onFermer,
  onReprendre,
}: {
  image: File;
  catalogue: Catalogue;
  liste: ReadonlyMap<string, readonly string[]>;
  onFermer: () => void;
  onReprendre: (f: File) => void;
}) {
  const [etape, setEtape] = useState<Etape>({ sorte: "lecture", progres: 0 });
  const [rangees, setRangees] = useState<Rangee[]>([]);
  const [jour, setJour] = useState("");
  const candidats = useMemo(() => candidatsDu(catalogue), [catalogue]);
  const pdf = estUnPdf(image);

  useEffect(() => {
    let vivant = true;
    setEtape({ sorte: "lecture", progres: 0 });
    (async () => {
      const suivre = (p: number) => vivant && setEtape({ sorte: "lecture", progres: p });
      if (pdf) {
        const texte = await lirePdf(image, suivre);
        const lu = estFactureDrive(texte) ? lireFactureDrive(texte) : lireTicket(texte);
        const appris = await lireAppris(base);
        if (!vivant) return;
        if (!lu.lignes.length) {
          setEtape({ sorte: "echec", message: "Aucune ligne d’article lue dans ce PDF. Est-ce bien une facture Carrefour Drive ?" });
          return;
        }
        setRangees(rangeesDu(lu, appris, candidats, catalogue));
        setJour(lu.date ?? lu.dateSuggeree ?? "");
        setEtape({ sorte: "revue", lu });
        return;
      }
      let lu = lireTicket(await lireImage(image, suivre));
      // L'EXIF PEUT MENTIR : orientation=6 sur des pixels déjà droits. Une
      // lecture qui ne trouve aucune ligne est relue d'un quart de tour, dans
      // un sens puis dans l'autre.
      for (const tour of [-90, 90] as const) {
        if (lu.lignes.length || !vivant) break;
        lu = lireTicket(await lireImage(image, suivre, tour));
      }
      const appris = await lireAppris(base);
      if (!vivant) return;
      if (!lu.lignes.length) {
        setEtape({ sorte: "echec", message: "Aucune ligne d’article lue. Reprenez la photo bien à plat, ticket entier et éclairé." });
        return;
      }
      setRangees(rangeesDu(lu, appris, candidats, catalogue));
      setJour(lu.date ?? lu.dateSuggeree ?? "");
      setEtape({ sorte: "revue", lu });
    })().catch((e: unknown) => {
      if (vivant) setEtape({ sorte: "echec", message: `La lecture a échoué : ${e instanceof Error ? e.message : String(e)}` });
    });
    return () => {
      vivant = false;
    };
  }, [image, pdf, candidats, catalogue]);

  const maj = (rang: number, f: (r: Rangee) => Rangee) =>
    setRangees((rs) => rs.map((r) => (r.rang === rang ? f(r) : r)));

  if (etape.sorte === "lecture") {
    return (
      <div className="tk-revue">
        <div className="co-kicker">{pdf ? "Lecture de la facture" : "Lecture du ticket"}, sur le téléphone</div>
        <div className="tk-progres" role="progressbar" aria-valuenow={Math.round(etape.progres * 100)}>
          <div style={{ width: `${Math.round(etape.progres * 100)}%` }} />
        </div>
        <div className="co-note">{pdf ? "Le document ne quitte pas l’appareil et n’est pas gardé." : "La photo ne quitte pas l’appareil et n’est pas gardée."}</div>
      </div>
    );
  }
  if (etape.sorte === "echec") {
    return (
      <div className="tk-revue">
        <div className="co-vide">{etape.message}</div>
        {pdf ? <BoutonFacture onFichier={onReprendre} /> : <BoutonScanner onImage={onReprendre} />}
        <button className="btn btn-ghost" onClick={onFermer}>Fermer</button>
      </div>
    );
  }
  if (etape.sorte === "fait") {
    return (
      <div className="tk-revue">
        <div className="co-vide" data-testid="ticket-fait">
          <b>{etape.rentrees} ligne{etape.rentrees > 1 ? "s" : ""} rentrée{etape.rentrees > 1 ? "s" : ""} au stock</b>, achat du{" "}
          {new Date(`${etape.jour}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
          {etape.cochees ? ` · ${etape.cochees} article${etape.cochees > 1 ? "s" : ""} de la liste coché${etape.cochees > 1 ? "s" : ""}` : ""}.
        </div>
        <button className="btn btn-primary btn-block" onClick={onFermer}>Retour à la liste</button>
      </div>
    );
  }

  const { lu } = etape;
  const total = phraseDuTotal(lu);
  const n = nbAuStock(rangees);
  const sans = nbSansChoix(rangees);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(jour);

  const toutRentrer = async () => {
    const r = await rentrerUnTicket(base, jour, aRentrer(rangees), liste);
    setEtape({ sorte: "fait", ...r, jour });
  };

  return (
    <div className="tk-revue" data-testid="ticket-revue">
      <div className="co-kicker">{lu.magasin}{lu.date ? ` · ${new Date(`${lu.date}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}</div>

      {/* T66 — PAS D'ENTRÉE SANS DATE. Le cliché a coupé le haut ou le bas : on
          le dit, on propose de reprendre, ou de la taper. */}
      {!lu.date ? (
        <div className="tk-alerte" data-testid="ticket-sans-date">
          {pdf ? (
            <b>La date de livraison n’a pas été lue : il manque la date.</b>
          ) : (
            <><b>Photo incomplète : il manque la date</b>, reprenez le haut / le bas du ticket.</>
          )}
          {lu.dateSuggeree ? (
            <div className="co-note">Le code-barres suggère le {new Date(`${lu.dateSuggeree}T12:00:00`).toLocaleDateString("fr-FR")} — vérifiez.</div>
          ) : null}
          <div className="tk-ligne-date">
            <label>
              Date d’achat{" "}
              <input type="date" value={jour} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setJour(e.currentTarget.value)} data-testid="ticket-date" />
            </label>
          </div>
          {pdf ? null : <BoutonScanner onImage={onReprendre} />}
        </div>
      ) : null}

      <div className={`co-note${total.ok ? "" : " tk-ecart"}`} data-testid="ticket-total">{total.texte}</div>

      {rangees.map((r) => (
        <div key={r.rang} className={`tk-rangee${r.ignoree ? " ignoree" : ""}`} data-testid="ticket-rangee">
          <div className="tk-tete">
            <span className="tk-libelle">{r.libelle}</span>
            <span className="tk-prix">{euros(r.net)}{r.douteux ? " ?" : ""}</span>
          </div>
          {r.opaque ? <div className="co-note">Ligne de comptoir, sans détail : rentrez plutôt le talon du commerçant.</div> : null}
          <div className="tk-choix">
            {r.reconnu && r.ingredient !== undefined ? (
              <span className="tag tag-accent">reconnu · {r.ingredient === null ? "pas pour la cuisine" : (candidats.find((c) => c.id === r.ingredient)?.nom ?? r.ingredient)}</span>
            ) : (
              r.suggestions.map((s) => (
                <button key={s.id} className={`tk-puce${r.ingredient === s.id ? " on" : ""}`} onClick={() => maj(r.rang, (x) => choisir(x, s.id, lu, catalogue))}>
                  {s.nom}
                </button>
              ))
            )}
            <select
              aria-label="Autre ingrédient"
              value={r.ingredient === undefined ? "" : r.ingredient === null ? "-" : r.ingredient}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v) maj(r.rang, (x) => choisir(x, v === "-" ? null : v, lu, catalogue));
              }}
            >
              <option value="">autre…</option>
              <option value="-">pas pour la cuisine</option>
              {candidats.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>
          <div className="tk-pied">
            {typeof r.ingredient === "string" ? (
              <span className="tk-qte">
                <input type="number" min={1} inputMode="numeric" aria-label="Unités" value={r.unites} onChange={(e) => maj(r.rang, (x) => ({ ...x, unites: Math.max(1, Number(e.currentTarget.value) || 1) }))} />
                {r.parUnite ? (
                  <>
                    ×
                    <input type="number" min={1} inputMode="numeric" aria-label="Poids par unité" value={r.parUnite.amount} onChange={(e) => {
                      const amount = Math.max(1, Number(e.currentTarget.value) || 1);
                      maj(r.rang, (x) => ({ ...x, parUnite: x.parUnite ? { ...x.parUnite, amount } : null }));
                    }} />
                    {r.parUnite.unit}
                  </>
                ) : (
                  // Vendu au poids sans poids imprimé (Carrefour) : on le dit
                  // plutôt que de compter un poireau comme « 1 pièce ».
                  /VRAC|\bKG\b/.test(r.libelle) ? "· poids non imprimé" : "pièce" + (r.unites > 1 ? "s" : "")
                )}
              </span>
            ) : (
              <span className="co-note">{r.ingredient === null ? "pas pour la cuisine" : "à choisir"}</span>
            )}
            <button className="btn btn-ghost tk-ignorer" onClick={() => maj(r.rang, (x) => ({ ...x, ignoree: !x.ignoree }))}>
              {r.ignoree ? "Reprendre" : "Ignorer"}
            </button>
          </div>
        </div>
      ))}

      {sans ? <div className="co-note">{sans} ligne{sans > 1 ? "s" : ""} sans ingrédient ne rentrer{sans > 1 ? "ont" : "a"} pas.</div> : null}
      <button className="btn btn-primary btn-block" disabled={!dateOk || n === 0} onClick={() => void toutRentrer()} data-testid="ticket-rentrer">
        Tout rentrer — {n} ligne{n > 1 ? "s" : ""}
      </button>
      <button className="btn btn-ghost btn-block" onClick={onFermer}>Annuler</button>
    </div>
  );
}
