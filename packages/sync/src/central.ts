import type { Conflit, Donnees, Enreg, Issue, Operation, Politiques, Transport } from "./types.js";
const cleDe = (entite: string, id: string) => `${entite}:${id}`;
const egal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Serveur central (en production : API + PostgreSQL ; ici en mémoire pour spécifier et tester les règles). */
export class Central {
  enregs = new Map<string, Enreg>(); appliquees = new Set<string>(); journal: { seq: number; cle: string }[] = []; seq = 0; conflits: Conflit[] = [];
  constructor(public politiques: Politiques) {}
  lire(entite: string, id: string) { return this.enregs.get(cleDe(entite, id)) ?? null; }

  private ecrire(e: Enreg) { this.enregs.set(cleDe(e.entite, e.id), e); this.journal.push({ seq: ++this.seq, cle: cleDe(e.entite, e.id) }); }
  private conflit(op: Operation, type: Conflit["type"], cur: Enreg | null, resolution: string | null): Conflit {
    const c: Conflit = { cleOperation: op.cle, entite: op.entite, entiteId: op.entiteId, type, valeurLocale: op.charge, valeurCentrale: cur ? cur.data : null, resolution }; this.conflits.push(c); return c;
  }
  appliquer(op: Operation): Issue {
    if (this.appliquees.has(op.cle)) return { statut: "DEJA_APPLIQUEE" };
    const cfg = this.politiques[op.entite]; if (!cfg) return { statut: "REJETEE", raison: `Entité inconnue : ${op.entite}` };
    const cur = this.lire(op.entite, op.entiteId);
    const fin = (i: Issue) => { this.appliquees.add(op.cle); return i; };

    if (op.operation === "CREATE") {
      if (cur) return egal(cur.data, op.charge) ? fin({ statut: "DEJA_APPLIQUEE", version: cur.version }) : fin({ statut: "CONFLIT", raison: "Identifiant déjà utilisé avec un contenu différent", conflit: this.conflit(op, "VERSION", cur, null) });
      this.ecrire({ entite: op.entite, id: op.entiteId, version: 1, data: op.charge, majLe: op.creeLe, supprime: false, siteId: op.siteId });
      let c: Conflit | undefined;
      if (cfg.empreinte) { const emp = op.charge[cfg.empreinte];
        const autre = emp ? [...this.enregs.values()].find((x) => x.entite === op.entite && x.id !== op.entiteId && !x.supprime && x.data[cfg.empreinte!] === emp) : undefined;
        if (autre) c = this.conflit(op, "DOUBLON_POSSIBLE", autre, null); } // conservé, jamais fusionné automatiquement
      return fin({ statut: "APPLIQUEE", version: 1, conflit: c });
    }
    if (!cur) return { statut: "REJETEE", raison: "Enregistrement introuvable" };
    if (cfg.politique === "ADDITIF") return fin({ statut: "REJETEE", raison: "Entité additive : modification et suppression interdites" });
    if (cfg.politique === "IMMUABLE" && cfg.verrou?.(cur.data)) return fin({ statut: "REJETEE", raison: "Enregistrement verrouillé" });

    const appliquer = (c?: Conflit): Issue => {
      const data: Donnees = op.operation === "DELETE" ? cur.data : { ...cur.data, ...op.charge };
      this.ecrire({ ...cur, data, version: cur.version + 1, majLe: op.creeLe, supprime: op.operation === "DELETE" || cur.supprime, siteId: op.siteId });
      return fin({ statut: "APPLIQUEE", version: cur.version + 1, conflit: c });
    };
    if (cur.version === op.versionBase) return appliquer();
    if (cfg.politique === "MANUEL") return fin({ statut: "CONFLIT", raison: "Conflit à résoudre manuellement", conflit: this.conflit(op, "VERSION", cur, null) });
    if (op.creeLe >= cur.majLe) return appliquer(this.conflit(op, "VERSION", cur, "AUTO_DERNIERE_VERSION"));
    return fin({ statut: "CONFLIT", raison: "Version centrale plus récente conservée", version: cur.version, conflit: this.conflit(op, "VERSION", cur, "AUTO_VERSION_CENTRALE_PLUS_RECENTE") });
  }
  depuis(curseur: number) {
    const cles = new Set(this.journal.filter((j) => j.seq > curseur).map((j) => j.cle));
    return { changements: [...cles].map((c) => this.enregs.get(c)!), curseur: this.seq };
  }
}

/** Transport de test : permet de simuler une coupure avant ou APRÈS l'application côté serveur. */
export class TransportMemoire implements Transport {
  coupeAvant = false; coupeApres = false;
  constructor(private central: Central) {}
  async push(ops: Operation[]) {
    if (this.coupeAvant) throw new Error("Réseau indisponible");
    const issues = ops.map((o) => this.central.appliquer(o));
    if (this.coupeApres) throw new Error("Connexion perdue avant la réponse");
    return issues;
  }
  async pull(c: number) { if (this.coupeAvant) throw new Error("Réseau indisponible"); return this.central.depuis(c); }
  async lire(e: string, id: string) { if (this.coupeAvant) throw new Error("Réseau indisponible"); return this.central.lire(e, id); }
}
