import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { enregistrer } from "./pwa/maj";

const racine = document.getElementById("racine");
// Le point de montage vient d'index.html ; s'il manque, c'est le HTML qui a
// dérivé, et un écran blanc silencieux serait la pire façon de l'apprendre.
if (!racine) throw new Error("#racine est absent d'index.html");

// Le service worker s'inscrit AVANT le premier rendu, et sans être attendu :
// il ne sert pas cette visite-ci (c'est le réseau qui l'a servie), il prépare
// la suivante — celle qui s'ouvrira peut-être sans réseau.
void enregistrer();

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
