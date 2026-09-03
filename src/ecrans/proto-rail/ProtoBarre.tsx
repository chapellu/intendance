// PROTOTYPE — à jeter. La barre flottante qui commute les variantes.
//
// Délibérément moche : elle ne fait pas partie du design qu'on juge, et elle
// doit se voir comme telle. Le `?variant=` est une vraie query string et non un
// segment de hash — l'app route sur le hash (`nav/routes.ts`), et lui ajouter
// un paramètre jetable obligerait à toucher le routeur pour un écran qui va
// disparaître.

import { useEffect } from "react";
import { NOM_VARIANTE, VARIANTES, type Variante } from "./rail";

export function lireVariante(): Variante {
  const v = new URLSearchParams(window.location.search).get("variant");
  return (VARIANTES as readonly string[]).includes(v ?? "") ? (v as Variante) : "A";
}

function ecrire(v: Variante): void {
  const u = new URL(window.location.href);
  u.searchParams.set("variant", v);
  window.history.replaceState(null, "", u.toString());
}

export function ProtoBarre({
  variante,
  changer,
  configHonoree,
  basculerConfig,
  demo,
  basculerDemo,
  recommencer,
  etat,
}: {
  variante: Variante;
  changer: (v: Variante) => void;
  configHonoree: boolean;
  basculerConfig: () => void;
  demo: boolean;
  basculerDemo: () => void;
  recommencer: () => void;
  /** L'état complet, affiché en clair : règle 5 du prototype. */
  etat: string;
}) {
  const bouger = (d: number) => {
    const i = VARIANTES.indexOf(variante);
    const v = VARIANTES[(i + d + VARIANTES.length) % VARIANTES.length]!;
    ecrire(v);
    changer(v);
  };

  useEffect(() => {
    const sur = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") bouger(-1);
      if (e.key === "ArrowRight") bouger(1);
    };
    window.addEventListener("keydown", sur);
    return () => window.removeEventListener("keydown", sur);
  });

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 12,
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "#111",
        color: "#fff",
        borderRadius: 12,
        padding: "8px 10px",
        boxShadow: "0 8px 24px rgba(0,0,0,.35)",
        font: "12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
        maxWidth: "min(94vw, 560px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => bouger(-1)} style={btn}>
          ←
        </button>
        <span style={{ flex: 1, textAlign: "center" }}>
          <b>{variante}</b> — {NOM_VARIANTE[variante]}
        </span>
        <button onClick={() => bouger(1)} style={btn}>
          →
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <button onClick={basculerConfig} style={{ ...btn, background: configHonoree ? "#2f6" : "#444", color: configHonoree ? "#000" : "#fff" }}>
          {configHonoree ? "taille 5 + cooldown 10 j" : "taille 4 en dur (actuel)"}
        </button>
        <button onClick={basculerDemo} style={{ ...btn, background: demo ? "#2f6" : "#444", color: demo ? "#000" : "#fff" }}>
          {demo ? "journal de démo" : "journal réel (vide)"}
        </button>
        <button onClick={recommencer} style={btn}>
          recommencer
        </button>
        <span style={{ opacity: 0.7 }}>← → variante</span>
      </div>
      <div style={{ marginTop: 6, opacity: 0.85, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {etat}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "#444",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  padding: "4px 10px",
  cursor: "pointer",
  font: "inherit",
};
