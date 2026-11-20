# Checklist avant toute donnée réelle

## Conformité (loi n° 2008-12 relative à la protection des données à caractère personnel)
- [ ] Contacter la **Commission de protection des Données Personnelles (CDP)** pour confirmer le régime applicable (déclaration ou autorisation préalable ; les données de santé relèvent en principe d'un régime renforcé : **à confirmer avec la CDP**).
- [ ] Désigner un responsable du traitement (le poste/district) et documenter les finalités, durées de conservation, destinataires.
- [ ] Informer les patients (affichage / mention d'information) et définir la procédure de droit d'accès et de rectification.
- [ ] Faire valider les registres et rapports par le responsable du poste et le district sanitaire de Joal-Fadiouth.

## Technique : à FAIRE (rien de ceci n'est fait à ce jour)
- [ ] Développer l'API et l'interface, brancher Prisma/PostgreSQL, appliquer le schéma (jamais validé avec `prisma validate` ici).
- [ ] Écrire les migrations SQL : contraintes CHECK, déclencheur anti-modification du journal d'audit.
- [ ] Tests de bout en bout (Playwright) et tests d'intégration sur une vraie base.
- [ ] Test d'intrusion / revue de sécurité indépendante.
- [ ] **Test de restauration réussi** sur la vraie pile.
- [ ] Test de synchronisation réelle (coupure réseau physique, deux sites).
- [ ] Période pilote avec données fictives, puis validation par le responsable.

## Déjà vérifié (par tests automatisés, hors intégration)
Authentification et verrouillage, droits par rôle, logique métier de tous les modules, synchronisation (convergence), chiffrement, journal d'audit chaîné, sauvegarde chiffrée et vérifiée, exports PDF/Excel.
