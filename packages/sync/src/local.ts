import type { Donnees, Enreg, Issue, Operation, Transport } from "./types.js";
export type EntreeOutbox = { op: Operation; statut: "EN_ATTENTE" | "SYNCHRONISEE" | "CONFLIT" | "REJETEE"; tentatives: number; erreur?: string };
export type Rapport = { ok: boolean; envoyees: number; conflits: number; rejetees: number; recues: number; erreur?: string };
const cle = (e: string, id: string) => `${e}:${id}`;

/** Poste/serveur local : écrit d'abord en local (jamais bloqué par le réseau) et file chaque écriture dans l'outbox. */
export class Local {
  enregs = new Map<string, Enreg>(); outbox: EntreeOutbox[] = []; curseur = 0; journalSync: string[] = []; private n = 0;
  constructor(public siteId: string, private horloge: () => number, private transport: Transport) {}
  lire(entite: string, id: string) { return this.enregs.get(cle(entite, id)) ?? null; }
  private cleOp() { return `${this.siteId}-${++this.n}-${this.horloge()}`; }

  private ecrire(entite: string, id: string, operation: Operation["operation"], charge: Donnees) {
    const cur = this.lire(entite, id);
    if (operation === "CREATE" && cur) throw new Error("Existe déjà localement");
    if (operation !== "CREATE" && !cur) throw new Error("Introuvable localement");
    const versionBase = cur ? cur.version : 0, t = this.horloge();
    this.enregs.set(cle(entite, id), { entite, id, version: versionBase + 1, data: operation === "DELETE" ? cur!.data : { ...(cur?.data ?? {}), ...charge }, majLe: t, supprime: operation === "DELETE" || !!cur?.supprime, siteId: this.siteId });
    this.outbox.push({ op: { cle: this.cleOp(), siteId: this.siteId, entite, entiteId: id, operation, charge, versionBase, creeLe: t }, statut: "EN_ATTENTE", tentatives: 0 });
  }
  creer(e: string, id: string, data: Donnees) { this.ecrire(e, id, "CREATE", data); }
  modifier(e: string, id: string, charge: Donnees) { this.ecrire(e, id, "UPDATE", charge); }
  supprimer(e: string, id: string) { this.ecrire(e, id, "DELETE", {}); }
  enAttente() { return this.outbox.filter((o) => o.statut === "EN_ATTENTE"); }
  private aOpEnAttente(e: string, id: string) { return this.enAttente().some((o) => o.op.entite === e && o.op.entiteId === id); }

  async synchroniser(tailleLot = 50): Promise<Rapport> {
    const r: Rapport = { ok: true, envoyees: 0, conflits: 0, rejetees: 0, recues: 0 }; const touches = new Map<string, Issue | undefined>();
    const attente = this.enAttente();
    for (let i = 0; i < attente.length; i += tailleLot) {
      const lot = attente.slice(i, i + tailleLot);
      let issues: Issue[];
      try { issues = await this.transport.push(lot.map((x) => x.op)); }
      catch (e) { for (const x of lot) { x.tentatives++; x.erreur = (e as Error).message; } this.journalSync.push(`ECHEC_PUSH ${(e as Error).message}`); return { ...r, ok: false, erreur: (e as Error).message }; }
      lot.forEach((x, k) => { const is = issues[k]; x.erreur = is.raison;
        x.statut = is.statut === "CONFLIT" ? "CONFLIT" : is.statut === "REJETEE" ? "REJETEE" : "SYNCHRONISEE";
        if (x.statut === "CONFLIT") r.conflits++; if (x.statut === "REJETEE") r.rejetees++; r.envoyees++;
        const necessiteRefresh = is.statut !== "APPLIQUEE" && is.statut !== "DEJA_APPLIQUEE" || !!is.conflit || is.version !== this.lire(x.op.entite, x.op.entiteId)?.version;
        if (necessiteRefresh) touches.set(cle(x.op.entite, x.op.entiteId), is);
        this.journalSync.push(`${is.statut} ${x.op.entite}:${x.op.entiteId}`); });
    }
    try {
      const p = await this.transport.pull(this.curseur);
      for (const e of p.changements) { if (this.aOpEnAttente(e.entite, e.id)) continue; this.enregs.set(cle(e.entite, e.id), e); r.recues++; }
      this.curseur = p.curseur;
      for (const k of touches.keys()) { const [e, ...rest] = k.split(":"); const id = rest.join(":"); if (this.aOpEnAttente(e, id)) continue;
        const c = await this.transport.lire(e, id); if (c) this.enregs.set(k, c); }
    } catch (e) { this.journalSync.push(`ECHEC_PULL ${(e as Error).message}`); return { ...r, ok: false, erreur: (e as Error).message }; }
    return r;
  }
}
