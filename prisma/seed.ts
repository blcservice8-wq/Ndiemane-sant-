// Charge les 12 rôles et leurs permissions. STATUT : écrit mais pas encore exécuté contre une vraie base.
import { PrismaClient } from "@prisma/client";
import { genererSeed } from "../packages/auth/src/seed";

const prisma = new PrismaClient();

async function main() {
  const { permissions, roles } = genererSeed();
  for (const p of permissions) {
    await prisma.permission.upsert({ where: { module_action: { module: p.module, action: p.action } }, update: {}, create: p });
  }
  for (const r of roles) {
    const role = await prisma.role.upsert({ where: { code: r.code }, update: { libelle: r.libelle }, create: { code: r.code, libelle: r.libelle, systeme: true } });
    for (const rp of r.permissions) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { module_action: { module: rp.module, action: rp.action } } });
      await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } }, update: {}, create: { roleId: role.id, permissionId: perm.id } });
    }
  }
  console.log(`OK : ${roles.length} rôles, ${permissions.length} permissions`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
