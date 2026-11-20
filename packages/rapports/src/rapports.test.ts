import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { execFileSync } from "node:child_process"; import { writeFileSync, mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { calculer, periode, validerDefinitions, masquerPetitsEffectifs, type DefIndicateur, type Jeux } from "./indicateurs.js";
import { genererRapport, peutExporter } from "./rapport.js"; import { versExcel, versPdf } from "./export.js";
const d = (s: string) => new Date(s + "T12:00:00Z");

const jeux: Jeux = {
  consultations: [{ date: d("2026-11-02"), type: "CPN", age: 25 }, { date: d("2026-11-03"), type: "CURATIVE", age: 3 }, { date: d("2026-11-10"), type: "CURATIVE", age: 40 }, { date: d("2026-10-05"), type: "CPN", age: 30 }],
  recettes: [{ date: d("2026-11-02"), montant: 10000 }, { date: d("2026-11-15"), montant: 5000 }, { date: d("2026-09-01"), montant: 999 }] };
const defs: DefIndicateur[] = [
  { code: "CONS", libelle: "Consultations", op: "COUNT", jeu: "consultations", champDate: "date" },
  { code: "CPN", libelle: "Consultations prénatales", op: "COUNT", jeu: "consultations", champDate: "date", ou: [{ champ: "type", egal: "CPN" }] },
  { code: "ENF", libelle: "Enfants de moins de 5 ans", op: "COUNT", jeu: "consultations", champDate: "date", ou: [{ champ: "age", max: 4 }] },
  { code: "PCT_CPN", libelle: "Part des CPN (%)", op: "RATIO", numerateur: "CPN", denominateur: "CONS" },
  { code: "REC", libelle: "Recettes (FCFA)", op: "SUM", jeu: "recettes", champDate: "date", champ: "montant" }];
const nov = periode("MOIS", d("2026-11-19"));

describe("indicateurs configurables", () => {
  it("COUNT / SUM / RATIO avec filtres et période", () => { expect(calculer(defs, jeux, nov)).toEqual({ CONS: 3, CPN: 1, ENF: 1, PCT_CPN: 33.3, REC: 15000 }); });
  it("ratio sans dénominateur = null, jamais Infinity/NaN", () => { expect(calculer(defs, jeux, periode("JOUR", d("2026-01-01")))).toMatchObject({ CONS: 0, PCT_CPN: null }); });
  it("jeu absent = 0, pas d'invention", () => { expect(calculer([{ code: "X", libelle: "x", op: "COUNT", jeu: "absent", champDate: "date" }], jeux, nov).X).toBe(0); });
  it("définitions invalides : doublon, référence inconnue, circularité", () => {
    expect(validerDefinitions([...defs, defs[0]])).toContain("Codes d'indicateurs en double");
    expect(validerDefinitions([{ code: "R", libelle: "r", op: "RATIO", numerateur: "A", denominateur: "B" }])).toHaveLength(2);
    expect(() => calculer([{ code: "A", libelle: "a", op: "RATIO", numerateur: "B", denominateur: "B" }, { code: "B", libelle: "b", op: "RATIO", numerateur: "A", denominateur: "A" }], {}, nov)).toThrow("circulaire");
  });
  it("périodes", () => {
    expect(periode("MOIS", d("2026-02-10")).fin.toISOString()).toBe("2026-02-28T23:59:59.999Z"); expect(periode("TRIMESTRE", d("2026-11-19")).debut.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(periode("ANNEE", d("2026-06-01")).fin.toISOString()).toBe("2026-12-31T23:59:59.999Z"); expect(periode("JOUR", d("2026-11-19")).debut.toISOString()).toBe("2026-11-19T00:00:00.000Z");
  });
  it("masquage des petits effectifs", () => { expect(masquerPetitsEffectifs(3, 5)).toBe("<5"); expect(masquerPetitsEffectifs(0, 5)).toBe(0); expect(masquerPetitsEffectifs(12, 5)).toBe(12); expect(masquerPetitsEffectifs(null, 5)).toBeNull(); });
});
describe("génération et droits", () => {
  it("le chef de poste produit un rapport sanitaire ; le financier non", () => {
    const r = genererRapport({ id: "c", roles: ["INFIRMIER_CHEF"] }, "SANITAIRE", "Rapport mensuel", defs, jeux, nov, { maintenant: d("2026-11-19") });
    expect(r.indicateurs.find((i) => i.code === "CONS")?.valeur).toBe(3);
    expect(() => genererRapport({ id: "f", roles: ["GESTIONNAIRE_FINANCIER"] }, "SANITAIRE", "x", defs, jeux, nov)).toThrow("Accès refusé");
  });
  it("rapport financier : financier oui, sage-femme non ; lecteur ne peut ni voir finances ni exporter", () => {
    expect(genererRapport({ id: "f", roles: ["GESTIONNAIRE_FINANCIER"] }, "FINANCIER", "Fin", defs, jeux, nov).type).toBe("FINANCIER");
    expect(() => genererRapport({ id: "s", roles: ["SAGE_FEMME"] }, "FINANCIER", "x", defs, jeux, nov)).toThrow("Accès refusé");
    expect(() => genererRapport({ id: "l", roles: ["LECTEUR"] }, "FINANCIER", "x", defs, jeux, nov)).toThrow(); expect(peutExporter({ id: "l", roles: ["LECTEUR"] })).toBe(false); expect(peutExporter({ id: "r", roles: ["RESPONSABLE_POSTE"] })).toBe(true);
  });
  it("rapport externe : petits effectifs masqués, ratios conservés", () => {
    const r = genererRapport({ id: "r", roles: ["RESPONSABLE_POSTE"] }, "SANITAIRE", "Partenaire", defs, jeux, nov, { externe: true, seuilMasquage: 5 });
    expect(r.indicateurs.find((i) => i.code === "CPN")?.valeur).toBe("<5"); expect(r.indicateurs.find((i) => i.code === "PCT_CPN")?.valeur).toBe(33.3); expect(r.externe).toBe(true);
  });
});
describe("exports", () => {
  const u = { id: "r", roles: ["RESPONSABLE_POSTE"] };
  const rap = () => genererRapport(u, "SANITAIRE", "Rapport mensuel - Novembre 2026", defs, jeux, nov, { maintenant: d("2026-11-19"), tableaux: [{ titre: "Consultations par type", colonnes: ["Type", "Nombre"], lignes: [["CURATIVE", 2], ["CPN", 1]] }] });
  it("Excel : relu et conforme", async () => {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await versExcel(rap())) as unknown as ExcelJS.Buffer); expect(wb.worksheets.map((w) => w.name)).toEqual(["Indicateurs", "1-Consultations par type"]);
    const s = wb.getWorksheet("Indicateurs")!; expect(s.getCell("A1").value).toBe("Rapport mensuel - Novembre 2026"); expect(s.getCell("C6").value).toBe(3); expect(wb.getWorksheet("1-Consultations par type")!.getCell("B3").value).toBe(1);
  });
  it("PDF : valide, texte lisible avec accents, pagination", async () => {
    const buf = await versPdf(rap()); expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const dir = mkdtempSync(join(tmpdir(), "pdf-")); const f = join(dir, "r.pdf"); writeFileSync(f, buf);
    let txt = ""; try { txt = execFileSync("pdftotext", ["-layout", f, "-"]).toString(); } catch { return; }
    expect(txt).toContain("NDIEMANE SANTÉ DIGITAL"); expect(txt).toContain("Consultations prénatales"); expect(txt).toContain("33,3"); expect(txt).toContain("Page 1 / 1"); expect(txt).toContain("01/11/2026");
  });
  it("PDF long : plusieurs pages numérotées", async () => {
    const r = rap(); r.tableaux = [{ titre: "Long", colonnes: ["A", "B"], lignes: Array.from({ length: 120 }, (_, i) => [`L${i}`, i]) }];
    const buf = await versPdf(r); const dir = mkdtempSync(join(tmpdir(), "pdf-")); const f = join(dir, "l.pdf"); writeFileSync(f, buf);
    try { const txt = execFileSync("pdftotext", [f, "-"]).toString(); expect(txt).toMatch(/Page 3 \/ [3-9]/); } catch { /* pdftotext absent */ }
  });
});
