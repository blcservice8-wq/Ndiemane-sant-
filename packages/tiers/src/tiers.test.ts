import { describe, it, expect } from "vitest";
import * as F from "./fournisseurs.js";
import * as P from "./partenaires.js";
import { ErreurAcces } from "../../auth/src/rbac.js";
const d = (s: string) => new Date(s + "T00:00:00Z"); const now = d("2026-11-19");
const lignes = [{ produitId: "a", quantite: 10, prixUnitaireFcfa: 500 }, { produitId: "b", quantite: 4, prixUnitaireFcfa: 2500 }];

describe("commandes", () => {
  it("numéro BC et total", () => { expect(F.formaterBC("NDM", 2026, 7)).toBe("BC-NDM-2026-0007"); expect(F.totalCommande(lignes)).toBe(15000); });
  it("validation des lignes", () => {
    expect(F.validerLignes([])).toContain("Commande sans ligne");
    expect(F.validerLignes([{ produitId: "a", quantite: 0, prixUnitaireFcfa: 1 }])[0]).toContain("quantité invalide");
    expect(F.validerLignes([{ produitId: "a", quantite: 1, prixUnitaireFcfa: -1 }, { produitId: "a", quantite: 1, prixUnitaireFcfa: 1 }])).toContain("Produit en double dans la commande");
    expect(F.validerLignes(lignes)).toEqual([]);
  });
  it("transitions", () => { expect(F.transitionCommande("BROUILLON", "VALIDEE")).toBe(true); expect(F.transitionCommande("LIVREE", "ANNULEE")).toBe(false); expect(F.transitionCommande("BROUILLON", "LIVREE")).toBe(false); });
});
describe("livraisons et rapprochement", () => {
  it("réception partielle puis complète", () => {
    const r1 = F.recevoir(lignes, [], [{ produitId: "a", quantiteRecue: 10 }]); expect(r1.ok && r1.statut).toBe("PARTIELLE");
    const r2 = F.recevoir(lignes, [{ produitId: "a", quantiteRecue: 10 }], [{ produitId: "b", quantiteRecue: 4 }]); expect(r2.ok && r2.statut).toBe("LIVREE");
  });
  it("refuse sur-réception, produit inconnu, quantité invalide", () => {
    expect(F.recevoir(lignes, [{ produitId: "a", quantiteRecue: 8 }], [{ produitId: "a", quantiteRecue: 3 }]).ok).toBe(false);
    expect(F.recevoir(lignes, [], [{ produitId: "z", quantiteRecue: 1 }]).ok).toBe(false);
    expect(F.recevoir(lignes, [], [{ produitId: "a", quantiteRecue: -2 }]).ok).toBe(false);
  });
  it("rapprochement : conforme, surfacturé, tolérance", () => {
    const recu = new Map([["a", 10], ["b", 2]]); // attendu 5000 + 5000 = 10000
    expect(F.rapprocherFacture(lignes, recu, 10000)).toMatchObject({ attendu: 10000, conforme: true, motif: null });
    expect(F.rapprocherFacture(lignes, recu, 15000)).toMatchObject({ conforme: false, motif: "Facture supérieure aux quantités reçues" });
    expect(F.rapprocherFacture(lignes, recu, 10100, 2).conforme).toBe(true);
  });
});
describe("dettes", () => {
  const fs = [{ fournisseurId: "x", numero: "1", montantFcfa: 1000, payeFcfa: 0, echeance: d("2026-11-01") }, { fournisseurId: "x", numero: "2", montantFcfa: 500, payeFcfa: 500, echeance: d("2026-10-01") },
    { fournisseurId: "y", numero: "3", montantFcfa: 800, payeFcfa: 300, echeance: d("2026-12-01") }];
  it("total, retards, par fournisseur", () => {
    const r = F.dettes(fs, now); expect(r.total).toBe(1500); expect(r.enRetard.map((x) => x.numero)).toEqual(["1"]); expect(r.enRetard[0].joursRetard).toBe(18); expect(r.parFournisseur.get("y")).toBe(500);
  });
  it("paiements contrôlés", () => {
    expect(F.enregistrerPaiement(fs[0], 400).payeFcfa).toBe(400);
    expect(() => F.enregistrerPaiement(fs[0], 2000)).toThrow("supérieur"); expect(() => F.enregistrerPaiement(fs[0], 0)).toThrow("invalide");
  });
});
describe("évaluation et doublons", () => {
  it("note moyenne et validation", () => { expect(F.noteFournisseur([{ delai: 4, qualite: 5, prix: 3, conformite: 4 }, { delai: 2, qualite: 2, prix: 2, conformite: 2 }])).toBe(3); expect(F.noteFournisseur([])).toBeNull(); expect(F.validerEvaluation({ delai: 6, qualite: 1, prix: 1, conformite: 1 })).toHaveLength(1); });
  it("doublon de fournisseur malgré SARL/accents/ponctuation", () => { expect(F.estDoublonFournisseur("Établissements Diop & Fils", ["ETS DIOP FILS"])).toBe(true); expect(F.estDoublonFournisseur("Sow", ["Diop"])).toBe(false); });
});
describe("service commande", () => {
  const mk = (statut: F.StatutCommande) => { const logs: string[] = []; let cur = statut; let vp: string | undefined;
    return { logs, get: () => ({ cur, vp }), a: { log: async (e: { action: string }) => { logs.push(e.action); } },
      d: { commande: async () => ({ statut: cur, total: 15000 }), changerStatut: async (_i: string, v: F.StatutCommande, p?: string) => { cur = v; vp = p; } } }; };
  it("validation par le responsable, tracée", async () => { const m = mk("BROUILLON"); await F.avancerCommande(m.d, m.a, { id: "r", roles: ["RESPONSABLE_POSTE"] }, "c", "VALIDEE"); expect(m.get()).toEqual({ cur: "VALIDEE", vp: "r" }); expect(m.logs).toEqual(["COMMANDE_VALIDEE"]); });
  it("le gestionnaire de pharmacie ne valide pas un achat", async () => {
    const m = mk("BROUILLON"); await expect(F.avancerCommande(m.d, m.a, { id: "p", roles: ["GESTIONNAIRE_PHARMACIE"] }, "c", "VALIDEE")).rejects.toThrow(ErreurAcces);
  });
  it("le logisticien envoie une commande validée mais ne l'annule pas", async () => {
    const m = mk("VALIDEE"); await F.avancerCommande(m.d, m.a, { id: "l", roles: ["RESPONSABLE_LOGISTIQUE"] }, "c", "ENVOYEE"); expect(m.get().cur).toBe("ENVOYEE");
    await expect(F.avancerCommande(m.d, m.a, { id: "l", roles: ["RESPONSABLE_LOGISTIQUE"] }, "c", "ANNULEE")).rejects.toThrow(ErreurAcces);
  });
  it("transition interdite et rôle sans droit", async () => {
    const m = mk("LIVREE"); await expect(F.avancerCommande(m.d, m.a, { id: "r", roles: ["RESPONSABLE_POSTE"] }, "c", "ANNULEE")).rejects.toThrow("Transition interdite");
    await expect(F.avancerCommande(m.d, m.a, { id: "a", roles: ["AGENT_SANTE"] }, "c", "ENVOYEE")).rejects.toThrow(ErreurAcces);
  });
});
describe("partenaires", () => {
  const c: P.Convention = { id: "c1", partenaireId: "p1", objet: "Appui nutrition", debut: d("2026-01-01"), fin: d("2027-01-31"), montantFcfa: 2_000_000 };
  it("validation", () => { expect(P.validerConvention({ objet: "", debut: d("2026-02-01"), fin: d("2026-01-01"), montantFcfa: -1 })).toHaveLength(3); });
  it("statut, expiration proche, partenaires actifs", () => {
    expect(P.statutConvention(c, now)).toBe("ACTIVE"); expect(P.statutConvention({ ...c, debut: d("2027-01-01") }, now)).toBe("A_VENIR"); expect(P.statutConvention({ ...c, fin: d("2026-06-01") }, now)).toBe("EXPIREE");
    expect(P.conventionsExpirantes([c], now)[0].joursRestants).toBe(73); expect(P.partenairesActifs([c, { ...c, id: "c2", fin: d("2026-06-01"), partenaireId: "p2" }], now)).toEqual(["p1"]);
  });
  it("suivi des contributions", () => {
    expect(P.suiviContributions(c, [{ conventionId: "c1", montantFcfa: 500_000, nature: "FINANCIERE" }, { conventionId: "autre", montantFcfa: 9, nature: "FINANCIERE" }])).toEqual({ recu: 500_000, convenu: 2_000_000, taux: 25, reste: 1_500_000 });
    expect(P.suiviContributions({ ...c, montantFcfa: null }, []).taux).toBeNull();
  });
  it("rapport partenaire : agrégats seulement", () => {
    const r = P.rapportPartenaire(c, [{ libelle: "Enfants dépistés", valeur: 40 }], P.suiviContributions(c, [])); expect(JSON.stringify(r)).not.toMatch(/patient|nom|dossier/i);
  });
});
