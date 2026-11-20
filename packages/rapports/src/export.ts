import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { Rapport } from "./rapport.js";
const fr = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
const fmt = (v: unknown) => v === null || v === undefined ? "n/d" : typeof v === "number" ? v.toLocaleString("fr-FR") : String(v);

export async function versExcel(r: Rapport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); wb.creator = "NDIEMANE SANTÉ DIGITAL"; wb.created = r.genereLe;
  const s = wb.addWorksheet("Indicateurs");
  s.addRow([r.titre]).font = { bold: true, size: 14 }; s.addRow([`Période : ${fr(r.periode.debut)} au ${fr(r.periode.fin)}`]); s.addRow([`Généré le ${fr(r.genereLe)}`]); s.addRow([]);
  const h = s.addRow(["Code", "Indicateur", "Valeur"]); h.font = { bold: true, color: { argb: "FFFFFFFF" } }; h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14467A" } };
  for (const i of r.indicateurs) s.addRow([i.code, i.libelle, i.valeur]);
  s.columns = [{ width: 18 }, { width: 50 }, { width: 16 }];
  r.tableaux.forEach((t, k) => { const w = wb.addWorksheet(`${k + 1}-${t.titre}`.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
    const hh = w.addRow(t.colonnes); hh.font = { bold: true }; for (const l of t.lignes) w.addRow(l); w.columns = t.colonnes.map(() => ({ width: 20 })); });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function versPdf(r: Rapport): Promise<Buffer> {
  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true, info: { Title: r.titre, Author: "NDIEMANE SANTÉ DIGITAL" } });
    const parts: Buffer[] = []; doc.on("data", (b: Buffer) => parts.push(b)); doc.on("end", () => res(Buffer.concat(parts))); doc.on("error", rej);
    doc.fillColor("#14467A").fontSize(18).text("NDIEMANE SANTÉ DIGITAL"); doc.fillColor("#1B8A4B").fontSize(10).text("Poste de Santé de Ndiemane - District sanitaire de Joal-Fadiouth");
    doc.moveDown().fillColor("#000").fontSize(14).text(r.titre); doc.fontSize(9).fillColor("#555").text(`Période : ${fr(r.periode.debut)} au ${fr(r.periode.fin)}  |  Généré le ${fr(r.genereLe)}`);
    if (r.externe) doc.fillColor("#b00").text("Rapport externe : effectifs inférieurs au seuil masqués.");
    doc.moveDown().fillColor("#14467A").fontSize(11).text("Indicateurs"); doc.fillColor("#000").fontSize(10);
    for (const i of r.indicateurs) { const y = doc.y; doc.text(i.libelle, 50, y, { width: 380 }); doc.text(fmt(i.valeur), 440, y, { width: 100, align: "right" }); doc.moveDown(0.3); }
    for (const t of r.tableaux) {
      doc.moveDown().fillColor("#14467A").fontSize(11).text(t.titre); doc.fillColor("#000").fontSize(9); const w = 495 / t.colonnes.length;
      const ligne = (cells: unknown[], gras: boolean) => { if (doc.y > 760) doc.addPage(); const y = doc.y; doc.font(gras ? "Helvetica-Bold" : "Helvetica"); cells.forEach((c, k) => doc.text(fmt(c), 50 + k * w, y, { width: w - 4 })); doc.moveDown(0.2); };
      ligne(t.colonnes, true); for (const l of t.lignes) ligne(l, false); doc.font("Helvetica");
    }
    const n = doc.bufferedPageRange().count;
    for (let i = 0; i < n; i++) { doc.switchToPage(i); doc.fontSize(8).fillColor("#888").text(`Page ${i + 1} / ${n}`, 50, 800, { align: "center", width: 495 }); }
    doc.end();
  });
}
