import { ROLES, MODULES, ACTIONS } from "./rbac.js";
/** Données à insérer dans Role / Permission / RolePermission. */
export function genererSeed() {
  const permissions = MODULES.flatMap((module) => ACTIONS.map((action) => ({ module, action })));
  const roles = Object.entries(ROLES).map(([code, r]) => ({
    code, libelle: r.libelle, systeme: true,
    permissions: Object.entries(r.droits).flatMap(([module, actions]) => (actions ?? []).map((action) => ({ module, action }))) }));
  return { permissions, roles };
}
