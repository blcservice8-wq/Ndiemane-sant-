/** Limiteur de débit à fenêtre glissante (connexion, API). */
export class LimiteurDebit {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private fenetreMs: number) {}
  autoriser(cle: string, maintenant = Date.now()): { ok: true } | { ok: false; reessayerApresMs: number } {
    const recents = (this.hits.get(cle) ?? []).filter((t) => maintenant - t < this.fenetreMs);
    if (recents.length >= this.max) { this.hits.set(cle, recents); return { ok: false, reessayerApresMs: this.fenetreMs - (maintenant - recents[0]) }; }
    recents.push(maintenant); this.hits.set(cle, recents); return { ok: true };
  }
}
/** En-têtes de sécurité HTTP. La CSP stricte pourra nécessiter des nonces avec Next.js : à ajuster à l'intégration. */
export function enTetesSecurite(): Record<string, string> {
  return {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store" };
}
export const echapperHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Injection de formule : une cellule CSV commençant par = + - @ (ou tabulation/retour) est exécutée par Excel. */
export const neutraliserCellule = (v: unknown): string => { const s = v === null || v === undefined ? "" : String(v); return /^[=+\-@\t\r]/.test(s) && typeof v === "string" ? `'${s}` : s; };
export const versCsvSecurise = (lignes: unknown[][], sep = ";") => lignes.map((l) => l.map((c) => { const s = neutraliserCellule(c); return /["\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(sep)).join("\r\n");
