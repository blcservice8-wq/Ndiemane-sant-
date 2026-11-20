# Guide administrateur

## Comptes et rôles
- 12 profils prédéfinis. L'**administrateur système** gère les comptes et la technique mais n'a **aucun accès aux dossiers médicaux**.
- Créer un compte par personne ; jamais de compte partagé. Suspendre un compte au départ d'un agent (ne pas le supprimer : l'audit doit rester lisible).
- Active la double authentification pour le responsable, l'infirmier chef, l'administrateur et le financier.
- L'accès aux programmes sensibles (VIH) est **nominatif** : l'accorder uniquement aux personnes désignées par le responsable.
- Verrouillage automatique après 5 échecs de connexion (15 minutes).

## Paramètres à renseigner (non fixés par le logiciel)
Seuil de validation des dépenses par le responsable, solde annuel de congés, jours fériés, repos minimal entre gardes, quorum des réunions, calendrier vaccinal et CPN, catalogue des examens et tarifs, seuils d'alerte de stock, seuil de masquage des petits effectifs (rapports externes), indicateurs officiels du district.

## Surveillance
- Journal d'audit : vérifier l'intégrité de la chaîne chaque semaine ; conserver l'ancre du dernier hachage hors de la base.
- Conflits de synchronisation : traiter chaque conflit clinique (aucune résolution automatique).
- Alertes : ruptures, péremptions, pannes, échéances.

## Incident de sécurité
Suspendre les comptes concernés, conserver les journaux, informer le responsable du poste, évaluer l'obligation d'en informer la CDP, consigner l'incident.
