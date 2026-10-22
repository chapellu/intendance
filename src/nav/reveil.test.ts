import { describe, expect, test, vi } from "vitest";
import { ecouterLeReveil, minuteDe } from "./reveil";

describe("T146 — l'onglet rallumé se redessine", () => {
  const faux = (etat: DocumentVisibilityState) => {
    const doc = Object.assign(new EventTarget(), { visibilityState: etat });
    const win = new EventTarget();
    return { doc, win };
  };

  test("revenir sur l'onglet rend la minute courante ; caché, rien", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 2, 7, 30));
    const { doc, win } = faux("visible");
    const vu: number[] = [];
    const fin = ecouterLeReveil(doc as never, win as never, (m) => vu.push(m));
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("focus"));
    expect(vu).toEqual([minuteDe(Date.now()), minuteDe(Date.now())]);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(vu).toHaveLength(2);
    fin();
    doc.visibilityState = "visible";
    win.dispatchEvent(new Event("pageshow"));
    expect(vu).toHaveLength(2);
    vi.useRealTimers();
  });
});
