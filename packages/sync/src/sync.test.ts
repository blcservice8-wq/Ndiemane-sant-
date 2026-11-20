import { describe, it, expect } from "vitest";
import { Central, TransportMemoire } from "./central.js"; import { Local } from "./local.js"; import { chiffrer, dechiffrer, lotsNegatifs } from "./chiffrement.js";
import type { Politiques } from "./types.js";

const politiques: Politiques = {
  patient: { politique: "DERNIERE_VERSION", empreinte: "empreinte" }, personnel: { politique: "DERNIERE_VERSION" }, consultation: { politique: "MANUEL" },
  mouvement: { politique: "ADDITIF" }, depense: { politique: "IMMUABLE", verrou: (d) => d.statut === "VALIDEE" || d.statut === "PAYEE" } };
let t = 0; const horloge = () => ++t;
const monde = () => { const central = new Central(politiques); const ta = new TransportMemoire(central), tb = new TransportMemoire(central);
  return { central, ta, tb, A: new Local("A", horloge, ta), B: new Local("B", horloge, tb) }; };

describe("synchronisation de base", () => {
  it("création locale hors connexion, puis synchronisation", async () => {
    const { central, ta, A } = monde(); ta.coupeAvant = true; A.creer("personnel", "p1", { nom: "Diop" });
    expect(A.lire("personnel", "p1")?.data.nom).toBe("Diop"); // jamais bloqué par le réseau
    expect((await A.synchroniser()).ok).toBe(false); expect(central.lire("personnel", "p1")).toBeNull(); expect(A.enAttente()).toHaveLength(1); expect(A.outbox[0].tentatives).toBe(1);
    ta.coupeAvant = false; const r = await A.synchroniser(); expect(r).toMatchObject({ ok: true, envoyees: 1 }); expect(central.lire("personnel", "p1")?.data.nom).toBe("Diop"); expect(A.enAttente()).toHaveLength(0);
  });
  it("idempotence : la même opération envoyée deux fois n'est appliquée qu'une fois", () => {
    const { central, A } = monde(); A.creer("personnel", "p1", { nom: "Diop" }); const op = A.outbox[0].op;
    expect(central.appliquer(op).statut).toBe("APPLIQUEE"); expect(central.appliquer(op).statut).toBe("DEJA_APPLIQUEE"); expect(central.enregs.size).toBe(1); expect(central.lire("personnel", "p1")?.version).toBe(1);
  });
  it("coupure APRÈS application serveur : le rejeu ne crée aucun doublon", async () => {
    const { central, ta, A } = monde(); A.creer("personnel", "p1", { nom: "Diop" }); A.modifier("personnel", "p1", { tel: "77" });
    ta.coupeApres = true; expect((await A.synchroniser()).ok).toBe(false); expect(central.lire("personnel", "p1")?.version).toBe(2); expect(A.enAttente()).toHaveLength(2);
    ta.coupeApres = false; expect((await A.synchroniser()).ok).toBe(true); expect(central.lire("personnel", "p1")?.version).toBe(2); expect(A.enAttente()).toHaveLength(0); expect(central.journal).toHaveLength(2);
    expect(A.lire("personnel", "p1")).toEqual(central.lire("personnel", "p1"));
  });
  it("ordre préservé : plusieurs modifications locales successives s'enchaînent sans conflit", async () => {
    const { central, A } = monde(); A.creer("personnel", "p1", { nom: "a" }); A.modifier("personnel", "p1", { nom: "b" }); A.modifier("personnel", "p1", { nom: "c" });
    const r = await A.synchroniser(); expect(r.conflits).toBe(0); expect(central.lire("personnel", "p1")?.data.nom).toBe("c"); expect(central.lire("personnel", "p1")?.version).toBe(3);
  });
  it("traçabilité : le journal de synchronisation liste chaque opération", async () => { const { A } = monde(); A.creer("personnel", "p1", { nom: "a" }); await A.synchroniser(); expect(A.journalSync).toContain("APPLIQUEE personnel:p1"); });
  it("lots : le traitement par paquets envoie tout", async () => { const { central, A } = monde(); for (let i = 0; i < 120; i++) A.creer("mouvement", `m${i}`, { lotId: "L", quantite: 1 }); const r = await A.synchroniser(50); expect(r.envoyees).toBe(120); expect(central.enregs.size).toBe(120); });
});
describe("conflits", () => {
  it("DERNIERE_VERSION : la plus récente gagne, ancienne valeur tracée, les deux sites convergent", async () => {
    const { central, A, B } = monde(); A.creer("personnel", "p1", { nom: "Diop", tel: "1" }); await A.synchroniser(); await B.synchroniser();
    A.modifier("personnel", "p1", { tel: "AAA" }); B.modifier("personnel", "p1", { tel: "BBB" }); // B est plus récent
    await A.synchroniser(); await B.synchroniser(); await A.synchroniser();
    expect(central.lire("personnel", "p1")?.data.tel).toBe("BBB"); const c = central.conflits.find((x) => x.type === "VERSION");
    expect(c).toMatchObject({ resolution: "AUTO_DERNIERE_VERSION", valeurCentrale: { nom: "Diop", tel: "AAA" } });
    expect(A.lire("personnel", "p1")).toEqual(central.lire("personnel", "p1")); expect(B.lire("personnel", "p1")).toEqual(central.lire("personnel", "p1"));
  });
  it("DERNIERE_VERSION : une modification plus ancienne n'écrase pas la valeur centrale", async () => {
    const { central, A, B } = monde(); A.creer("personnel", "p1", { tel: "0" }); await A.synchroniser(); await B.synchroniser();
    A.modifier("personnel", "p1", { tel: "ancien" }); B.modifier("personnel", "p1", { tel: "recent" }); await B.synchroniser(); const r = await A.synchroniser();
    expect(r.conflits).toBe(1); expect(central.lire("personnel", "p1")?.data.tel).toBe("recent"); expect(A.lire("personnel", "p1")?.data.tel).toBe("recent");
  });
  it("MANUEL (données cliniques) : aucune écriture automatique, valeur locale conservée dans le conflit", async () => {
    const { central, A, B } = monde(); A.creer("consultation", "c1", { diag: "x" }); await A.synchroniser(); await B.synchroniser();
    A.modifier("consultation", "c1", { diag: "paludisme" }); B.modifier("consultation", "c1", { diag: "typhoïde" }); await A.synchroniser(); await B.synchroniser();
    expect(central.lire("consultation", "c1")?.data.diag).toBe("paludisme"); const c = central.conflits[0];
    expect(c).toMatchObject({ resolution: null, valeurLocale: { diag: "typhoïde" }, valeurCentrale: { diag: "paludisme" } }); expect(B.outbox.at(-1)?.statut).toBe("CONFLIT");
  });
  it("doublon de patient créé sur deux sites : les deux sont conservés, signalés pour fusion humaine", async () => {
    const { central, A, B } = monde(); A.creer("patient", "uuid-A", { nom: "Diouf", empreinte: "diouf|awa|1990" }); B.creer("patient", "uuid-B", { nom: "Diouf", empreinte: "diouf|awa|1990" });
    await A.synchroniser(); await B.synchroniser(); expect([...central.enregs.keys()].sort()).toEqual(["patient:uuid-A", "patient:uuid-B"]); expect(central.conflits).toHaveLength(1); expect(central.conflits[0].type).toBe("DOUBLON_POSSIBLE");
  });
  it("même identifiant, contenu différent : conflit, rien d'écrasé", () => { const { central, A, B } = monde(); A.creer("personnel", "x", { n: 1 }); B.creer("personnel", "x", { n: 2 }); central.appliquer(A.outbox[0].op); expect(central.appliquer(B.outbox[0].op).statut).toBe("CONFLIT"); expect(central.lire("personnel", "x")?.data.n).toBe(1); });
});
describe("entités spéciales", () => {
  it("ADDITIF : mouvements de deux sites cumulés, modification refusée, stock négatif détecté", async () => {
    const { central, A, B } = monde(); A.creer("mouvement", "m0", { lotId: "L", quantite: 10 }); await A.synchroniser(); await B.synchroniser();
    A.creer("mouvement", "mA", { lotId: "L", quantite: -8 }); B.creer("mouvement", "mB", { lotId: "L", quantite: -7 }); await A.synchroniser(); await B.synchroniser(); await A.synchroniser();
    const tous = [...central.enregs.values()].map((e) => e.data as { lotId: string; quantite: number }); expect(tous.reduce((s, m) => s + m.quantite, 0)).toBe(-5); expect(lotsNegatifs(tous)).toEqual([{ lotId: "L", quantite: -5 }]);
    A.modifier("mouvement", "m0", { quantite: 999 }); const r = await A.synchroniser(); expect(r.rejetees).toBe(1); expect(central.lire("mouvement", "m0")?.data.quantite).toBe(10); expect(A.lire("mouvement", "m0")?.data.quantite).toBe(10);
  });
  it("IMMUABLE : dépense validée verrouillée, brouillon modifiable", async () => {
    const { central, A } = monde(); A.creer("depense", "d1", { statut: "DEMANDEE", montant: 100 }); await A.synchroniser(); A.modifier("depense", "d1", { montant: 120 }); await A.synchroniser(); expect(central.lire("depense", "d1")?.data.montant).toBe(120);
    A.modifier("depense", "d1", { statut: "VALIDEE" }); await A.synchroniser(); A.modifier("depense", "d1", { montant: 1 }); const r = await A.synchroniser(); expect(r.rejetees).toBe(1); expect(central.lire("depense", "d1")?.data.montant).toBe(120);
  });
  it("suppression logique propagée, donnée conservée", async () => { const { central, A, B } = monde(); A.creer("personnel", "p", { n: 1 }); await A.synchroniser(); await B.synchroniser(); A.supprimer("personnel", "p"); await A.synchroniser(); await B.synchroniser(); expect(central.lire("personnel", "p")).toMatchObject({ supprime: true, data: { n: 1 } }); expect(B.lire("personnel", "p")?.supprime).toBe(true); });
  it("entité inconnue rejetée", () => { const { central, A } = monde(); A.creer("inconnu", "z", {}); expect(central.appliquer(A.outbox[0].op).statut).toBe("REJETEE"); });
});
describe("chiffrement local", () => {
  it("aller-retour, sels différents, mauvaise clé et falsification détectées", () => {
    const j = chiffrer({ patient: "Awa", diag: "x" }, "secret-fort"); expect(j).not.toContain("Awa"); expect(dechiffrer(j, "secret-fort")).toEqual({ patient: "Awa", diag: "x" });
    expect(chiffrer("a", "s")).not.toBe(chiffrer("a", "s")); expect(() => dechiffrer(j, "autre")).toThrow();
    const p = j.split("."); p[4] = Buffer.from("xxxxxxxx").toString("base64"); expect(() => dechiffrer(p.join("."), "secret-fort")).toThrow(); expect(() => dechiffrer("n'importe quoi", "s")).toThrow();
  });
});
describe("convergence (test aléatoire reproductible)", () => {
  const prng = (s: number) => () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (const graine of [1, 7, 42, 123, 2026]) it(`graine ${graine} : après synchronisation complète, A = B = central`, async () => {
    const rnd = prng(graine); const { central, ta, tb, A, B } = monde(); const sites = [A, B]; const ts = [ta, tb]; let n = 0;
    for (let i = 0; i < 150; i++) {
      const k = rnd() < 0.5 ? 0 : 1, s = sites[k]; const a = rnd();
      if (a < 0.25) s.creer(rnd() < 0.5 ? "personnel" : "consultation", `${s.siteId}${++n}`, { v: Math.floor(rnd() * 100) });
      else if (a < 0.35) s.creer("mouvement", `${s.siteId}${++n}`, { lotId: "L", quantite: Math.floor(rnd() * 10) - 5 });
      else if (a < 0.8) { const ex = [...s.enregs.values()].filter((e) => e.entite !== "mouvement" && !e.supprime); if (ex.length) { const e = ex[Math.floor(rnd() * ex.length)]; s.modifier(e.entite, e.id, { v: Math.floor(rnd() * 100) }); } }
      else { ts[k].coupeApres = rnd() < 0.3; await s.synchroniser(1 + Math.floor(rnd() * 5)); ts[k].coupeApres = false; }
    }
    for (let i = 0; i < 6; i++) { await A.synchroniser(); await B.synchroniser(); }
    expect(A.enAttente()).toHaveLength(0); expect(B.enAttente()).toHaveLength(0);
    const norm = (m: Map<string, unknown>) => JSON.stringify([...m].sort(([x], [y]) => (x < y ? -1 : 1)));
    expect(norm(A.enregs)).toBe(norm(central.enregs)); expect(norm(B.enregs)).toBe(norm(central.enregs));
  });
});
