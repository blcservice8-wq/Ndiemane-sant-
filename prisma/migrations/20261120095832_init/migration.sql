-- CreateEnum
CREATE TYPE "Sexe" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "StatutUtilisateur" AS ENUM ('ACTIF', 'SUSPENDU', 'DESACTIVE');

-- CreateEnum
CREATE TYPE "TypeConsultation" AS ENUM ('CURATIVE', 'CPN', 'CPON', 'PF', 'ENFANT', 'VACCINATION', 'NUTRITION', 'CHRONIQUE');

-- CreateEnum
CREATE TYPE "TypeMouvement" AS ENUM ('ENTREE', 'SORTIE_DELIVRANCE', 'SORTIE_PERTE', 'AJUSTEMENT_INVENTAIRE', 'TRANSFERT');

-- CreateEnum
CREATE TYPE "StatutDemandeLabo" AS ENUM ('DEMANDEE', 'PRELEVEE', 'RESULTAT_SAISI', 'VALIDEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "EtatEquipement" AS ENUM ('FONCTIONNEL', 'EN_PANNE', 'EN_MAINTENANCE', 'HORS_SERVICE');

-- CreateEnum
CREATE TYPE "EtatBatiment" AS ENUM ('BON', 'MOYEN', 'DEGRADE', 'CRITIQUE');

-- CreateEnum
CREATE TYPE "StatutCommande" AS ENUM ('BROUILLON', 'VALIDEE', 'ENVOYEE', 'PARTIELLE', 'LIVREE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "StatutDepense" AS ENUM ('DEMANDEE', 'ENGAGEE', 'VALIDEE', 'PAYEE', 'REJETEE');

-- CreateEnum
CREATE TYPE "TypeRecette" AS ENUM ('ACTES', 'SOINS', 'PHARMACIE', 'LABO', 'SUBVENTION', 'DON', 'CONTRIBUTION', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeConge" AS ENUM ('ANNUEL', 'MALADIE', 'MATERNITE', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutSync" AS ENUM ('EN_ATTENTE', 'ENVOYEE', 'APPLIQUEE', 'CONFLIT', 'ECHEC');

-- CreateEnum
CREATE TYPE "SeveriteAlerte" AS ENUM ('INFO', 'ATTENTION', 'CRITIQUE');

-- CreateEnum
CREATE TYPE "TypeAlerte" AS ENUM ('STOCK_FAIBLE', 'RUPTURE', 'PEREMPTION', 'PANNE', 'MAINTENANCE', 'CONGE', 'DOCUMENT_EXPIRANT', 'RENDEZ_VOUS', 'ECHEANCE', 'RAPPORT_RETARD');

-- CreateEnum
CREATE TYPE "OperationSync_Type" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "district" TEXT,
    "region" TEXT,
    "parametres" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nomComplet" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "mfaSecret" TEXT,
    "statut" "StatutUtilisateur" NOT NULL DEFAULT 'ACTIF',
    "tentativesEchec" INTEGER NOT NULL DEFAULT 0,
    "verrouJusqua" TIMESTAMP(3),
    "derniereConnexion" TIMESTAMP(3),
    "personnelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "systeme" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UtilisateurRole" (
    "utilisateurId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UtilisateurRole_pkey" PRIMARY KEY ("utilisateurId","roleId")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "numeroDossier" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "sexe" "Sexe" NOT NULL,
    "dateNaissance" TIMESTAMP(3),
    "telephone" TEXT,
    "localite" TEXT,
    "adresse" TEXT,
    "personneContact" TEXT,
    "empreinteDoublon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Antecedent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Antecedent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergie" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Allergie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "praticienId" TEXT NOT NULL,
    "type" "TypeConsultation" NOT NULL DEFAULT 'CURATIVE',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motif" TEXT NOT NULL,
    "poids" DECIMAL(5,2),
    "taille" DECIMAL(5,1),
    "temperature" DECIMAL(4,1),
    "tensionSys" INTEGER,
    "tensionDia" INTEGER,
    "pouls" INTEGER,
    "observations" TEXT,
    "soins" TEXT,
    "orientation" TEXT,
    "montantFcfa" INTEGER NOT NULL DEFAULT 0,
    "donneesSpecifiques" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnostic" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "codeCim10" TEXT,
    "libelle" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Diagnostic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LignePrescription" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "posologie" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,

    CONSTRAINT "LignePrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "structureDestination" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contreReference" TEXT,

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RendezVous" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "motif" TEXT,
    "honore" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RendezVous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vaccination" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "vaccin" TEXT NOT NULL,
    "dose" INTEGER NOT NULL DEFAULT 1,
    "date" TIMESTAMP(3) NOT NULL,
    "lot" TEXT,
    "prochaineDate" TIMESTAMP(3),
    "agentId" TEXT,

    CONSTRAINT "Vaccination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Programme" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "acces_restreint" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuiviProgramme" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "donnees" JSONB,

    CONSTRAINT "SuiviProgramme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Indicateur" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "formule" JSONB NOT NULL,
    "unite" TEXT,

    CONSTRAINT "Indicateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Objectif" (
    "id" TEXT NOT NULL,
    "indicateurId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "cible" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "Objectif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Realisation" (
    "id" TEXT NOT NULL,
    "objectifId" TEXT NOT NULL,
    "valeur" DECIMAL(14,2) NOT NULL,
    "dateMesure" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Realisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Personnel" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "matricule" TEXT,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "fonction" TEXT NOT NULL,
    "qualification" TEXT,
    "telephone" TEXT,
    "dateEmbauche" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Personnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrat" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "debut" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3),

    CONSTRAINT "Contrat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presence" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "present" BOOLEAN NOT NULL,
    "motifAbsence" TEXT,

    CONSTRAINT "Presence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conge" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "type" "TypeConge" NOT NULL,
    "debut" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "approuve" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Conge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Garde" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "debut" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Garde_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formation" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "organisme" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "evaluation" TEXT,

    CONSTRAINT "Formation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produit" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "dci" TEXT,
    "forme" TEXT,
    "categorie" TEXT NOT NULL,
    "unite" TEXT NOT NULL,
    "prixVenteFcfa" INTEGER NOT NULL DEFAULT 0,
    "seuilAlerte" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Produit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "peremption" TIMESTAMP(3),
    "quantiteInitiale" INTEGER NOT NULL,
    "fournisseurId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MouvementStock" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "type" "TypeMouvement" NOT NULL,
    "quantite" INTEGER NOT NULL,
    "motif" TEXT,
    "utilisateurId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivranceId" TEXT,
    "livraisonId" TEXT,

    CONSTRAINT "MouvementStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivrance" (
    "id" TEXT NOT NULL,
    "lignePrescriptionId" TEXT,
    "patientId" TEXT,
    "quantite" INTEGER NOT NULL,
    "prixFcfa" INTEGER NOT NULL DEFAULT 0,
    "delivreurId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delivrance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventaire" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsableId" TEXT NOT NULL,
    "lignes" JSONB NOT NULL,
    "valide" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Inventaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Examen" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "tarifFcfa" INTEGER NOT NULL DEFAULT 0,
    "valeursReference" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Examen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandeAnalyse" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consultationId" TEXT,
    "examenId" TEXT NOT NULL,
    "statut" "StatutDemandeLabo" NOT NULL DEFAULT 'DEMANDEE',
    "dateDemande" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "datePrelevement" TIMESTAMP(3),

    CONSTRAINT "DemandeAnalyse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultatAnalyse" (
    "id" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "interpretation" TEXT,
    "technicienId" TEXT NOT NULL,
    "valideParId" TEXT,
    "dateValidation" TIMESTAMP(3),

    CONSTRAINT "ResultatAnalyse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batiment" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "etat" "EtatBatiment" NOT NULL DEFAULT 'BON',
    "description" TEXT,

    CONSTRAINT "Batiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Salle" (
    "id" TEXT NOT NULL,
    "batimentId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "usage" TEXT,

    CONSTRAINT "Salle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Travaux" (
    "id" TEXT NOT NULL,
    "batimentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budgetFcfa" INTEGER NOT NULL DEFAULT 0,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIE',
    "dateDebut" TIMESTAMP(3),
    "dateFin" TIMESTAMP(3),

    CONSTRAINT "Travaux_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipement" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "codeQr" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "marque" TEXT,
    "modele" TEXT,
    "numeroSerie" TEXT,
    "dateAcquisition" TIMESTAMP(3),
    "valeurFcfa" INTEGER,
    "sourceFinancement" TEXT,
    "fournisseurId" TEXT,
    "salleId" TEXT,
    "responsableId" TEXT,
    "etat" "EtatEquipement" NOT NULL DEFAULT 'FONCTIONNEL',
    "garantieFin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Equipement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Maintenance" (
    "id" TEXT NOT NULL,
    "equipementId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "prochaineDate" TIMESTAMP(3),
    "coutFcfa" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "Maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fournisseur" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "contact" TEXT,
    "telephone" TEXT,
    "evaluation" INTEGER,

    CONSTRAINT "Fournisseur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commande" (
    "id" TEXT NOT NULL,
    "fournisseurId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "statut" "StatutCommande" NOT NULL DEFAULT 'BROUILLON',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validePar" TEXT,

    CONSTRAINT "Commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneCommande" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixUnitaireFcfa" INTEGER NOT NULL,

    CONSTRAINT "LigneCommande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Livraison" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conforme" BOOLEAN NOT NULL DEFAULT true,
    "remarque" TEXT,

    CONSTRAINT "Livraison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facture" (
    "id" TEXT NOT NULL,
    "fournisseurId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "montantFcfa" INTEGER NOT NULL,
    "echeance" TIMESTAMP(3),
    "payee" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partenaire" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contact" TEXT,

    CONSTRAINT "Partenaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Convention" (
    "id" TEXT NOT NULL,
    "partenaireId" TEXT NOT NULL,
    "objet" TEXT NOT NULL,
    "debut" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3),
    "montantFcfa" INTEGER,

    CONSTRAINT "Convention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Association" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "localite" TEXT,

    CONSTRAINT "Association_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membre" (
    "id" TEXT NOT NULL,
    "associationId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "fonction" TEXT,
    "telephone" TEXT,

    CONSTRAINT "Membre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiviteCommunautaire" (
    "id" TEXT NOT NULL,
    "associationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "compteRendu" TEXT,
    "participants" INTEGER,

    CONSTRAINT "ActiviteCommunautaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "libelle" TEXT NOT NULL,
    "montantFcfa" INTEGER NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "montantFcfa" INTEGER NOT NULL,
    "objet" TEXT NOT NULL,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depense" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "engagementId" TEXT,
    "libelle" TEXT NOT NULL,
    "montantFcfa" INTEGER NOT NULL,
    "statut" "StatutDepense" NOT NULL DEFAULT 'DEMANDEE',
    "demandeurId" TEXT NOT NULL,
    "validateurId" TEXT,
    "dateValidation" TIMESTAMP(3),
    "justificatifId" TEXT,
    "datePaiement" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Depense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recette" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" "TypeRecette" NOT NULL,
    "montantFcfa" INTEGER NOT NULL,
    "consultationId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caissierId" TEXT NOT NULL,

    CONSTRAINT "Recette_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalCaisse" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "libelle" TEXT NOT NULL,
    "entreeFcfa" INTEGER NOT NULL DEFAULT 0,
    "sortieFcfa" INTEGER NOT NULL DEFAULT 0,
    "soldeFcfa" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,

    CONSTRAINT "JournalCaisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "cheminStockage" TEXT NOT NULL,
    "empreinteSha256" TEXT NOT NULL,
    "expiration" TIMESTAMP(3),
    "confidentialite" TEXT NOT NULL DEFAULT 'INTERNE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alerte" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" "TypeAlerte" NOT NULL,
    "severite" "SeveriteAlerte" NOT NULL DEFAULT 'ATTENTION',
    "message" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "luePar" TEXT,
    "resolue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alerte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalAudit" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "utilisateurId" TEXT,
    "action" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT,
    "avant" JSONB,
    "apres" JSONB,
    "ip" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationSync" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "operation" "OperationSync_Type" NOT NULL DEFAULT 'UPDATE',
    "charge" JSONB NOT NULL,
    "versionBase" INTEGER NOT NULL,
    "cleIdempotence" TEXT NOT NULL,
    "statut" "StatutSync" NOT NULL DEFAULT 'EN_ATTENTE',
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "erreur" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traiteeLe" TIMESTAMP(3),

    CONSTRAINT "OperationSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflitSync" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "valeurLocale" JSONB NOT NULL,
    "valeurCentrale" JSONB NOT NULL,
    "resolution" TEXT,
    "resoluPar" TEXT,
    "resoluLe" TIMESTAMP(3),

    CONSTRAINT "ConflitSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_code_key" ON "Site"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_personnelId_key" ON "Utilisateur"("personnelId");

-- CreateIndex
CREATE INDEX "Utilisateur_siteId_idx" ON "Utilisateur"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_module_action_key" ON "Permission"("module", "action");

-- CreateIndex
CREATE INDEX "Patient_siteId_nom_prenom_idx" ON "Patient"("siteId", "nom", "prenom");

-- CreateIndex
CREATE INDEX "Patient_empreinteDoublon_idx" ON "Patient"("empreinteDoublon");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_siteId_numeroDossier_key" ON "Patient"("siteId", "numeroDossier");

-- CreateIndex
CREATE INDEX "Antecedent_patientId_idx" ON "Antecedent"("patientId");

-- CreateIndex
CREATE INDEX "Allergie_patientId_idx" ON "Allergie"("patientId");

-- CreateIndex
CREATE INDEX "Consultation_siteId_date_idx" ON "Consultation"("siteId", "date");

-- CreateIndex
CREATE INDEX "Consultation_patientId_date_idx" ON "Consultation"("patientId", "date");

-- CreateIndex
CREATE INDEX "Diagnostic_consultationId_idx" ON "Diagnostic"("consultationId");

-- CreateIndex
CREATE INDEX "Diagnostic_codeCim10_idx" ON "Diagnostic"("codeCim10");

-- CreateIndex
CREATE INDEX "Prescription_consultationId_idx" ON "Prescription"("consultationId");

-- CreateIndex
CREATE INDEX "LignePrescription_prescriptionId_idx" ON "LignePrescription"("prescriptionId");

-- CreateIndex
CREATE INDEX "Reference_consultationId_idx" ON "Reference"("consultationId");

-- CreateIndex
CREATE INDEX "RendezVous_date_idx" ON "RendezVous"("date");

-- CreateIndex
CREATE INDEX "Vaccination_patientId_idx" ON "Vaccination"("patientId");

-- CreateIndex
CREATE INDEX "Vaccination_date_idx" ON "Vaccination"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Programme_code_key" ON "Programme"("code");

-- CreateIndex
CREATE INDEX "SuiviProgramme_programmeId_idx" ON "SuiviProgramme"("programmeId");

-- CreateIndex
CREATE UNIQUE INDEX "Indicateur_code_key" ON "Indicateur"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Objectif_indicateurId_periode_key" ON "Objectif"("indicateurId", "periode");

-- CreateIndex
CREATE INDEX "Realisation_objectifId_idx" ON "Realisation"("objectifId");

-- CreateIndex
CREATE UNIQUE INDEX "Personnel_siteId_matricule_key" ON "Personnel"("siteId", "matricule");

-- CreateIndex
CREATE INDEX "Contrat_fin_idx" ON "Contrat"("fin");

-- CreateIndex
CREATE UNIQUE INDEX "Presence_personnelId_date_key" ON "Presence"("personnelId", "date");

-- CreateIndex
CREATE INDEX "Conge_debut_fin_idx" ON "Conge"("debut", "fin");

-- CreateIndex
CREATE INDEX "Garde_debut_idx" ON "Garde"("debut");

-- CreateIndex
CREATE UNIQUE INDEX "Produit_siteId_code_key" ON "Produit"("siteId", "code");

-- CreateIndex
CREATE INDEX "Lot_peremption_idx" ON "Lot"("peremption");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_produitId_numero_key" ON "Lot"("produitId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "MouvementStock_delivranceId_key" ON "MouvementStock"("delivranceId");

-- CreateIndex
CREATE INDEX "MouvementStock_lotId_date_idx" ON "MouvementStock"("lotId", "date");

-- CreateIndex
CREATE INDEX "Delivrance_date_idx" ON "Delivrance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Examen_code_key" ON "Examen"("code");

-- CreateIndex
CREATE INDEX "DemandeAnalyse_statut_idx" ON "DemandeAnalyse"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "ResultatAnalyse_demandeId_key" ON "ResultatAnalyse"("demandeId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipement_siteId_codeQr_key" ON "Equipement"("siteId", "codeQr");

-- CreateIndex
CREATE INDEX "Maintenance_prochaineDate_idx" ON "Maintenance"("prochaineDate");

-- CreateIndex
CREATE UNIQUE INDEX "Commande_numero_key" ON "Commande"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Facture_fournisseurId_numero_key" ON "Facture"("fournisseurId", "numero");

-- CreateIndex
CREATE INDEX "Convention_fin_idx" ON "Convention"("fin");

-- CreateIndex
CREATE INDEX "ActiviteCommunautaire_date_idx" ON "ActiviteCommunautaire"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_siteId_annee_libelle_key" ON "Budget"("siteId", "annee", "libelle");

-- CreateIndex
CREATE INDEX "Depense_siteId_statut_idx" ON "Depense"("siteId", "statut");

-- CreateIndex
CREATE INDEX "Recette_siteId_date_idx" ON "Recette"("siteId", "date");

-- CreateIndex
CREATE INDEX "JournalCaisse_siteId_date_idx" ON "JournalCaisse"("siteId", "date");

-- CreateIndex
CREATE INDEX "Document_expiration_idx" ON "Document"("expiration");

-- CreateIndex
CREATE INDEX "Alerte_siteId_resolue_idx" ON "Alerte"("siteId", "resolue");

-- CreateIndex
CREATE INDEX "JournalAudit_entite_entiteId_idx" ON "JournalAudit"("entite", "entiteId");

-- CreateIndex
CREATE INDEX "JournalAudit_date_idx" ON "JournalAudit"("date");

-- CreateIndex
CREATE UNIQUE INDEX "OperationSync_cleIdempotence_key" ON "OperationSync"("cleIdempotence");

-- CreateIndex
CREATE INDEX "OperationSync_statut_createdAt_idx" ON "OperationSync"("statut", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConflitSync_operationId_key" ON "ConflitSync"("operationId");

-- AddForeignKey
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilisateurRole" ADD CONSTRAINT "UtilisateurRole_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilisateurRole" ADD CONSTRAINT "UtilisateurRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Antecedent" ADD CONSTRAINT "Antecedent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergie" ADD CONSTRAINT "Allergie_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_praticienId_fkey" FOREIGN KEY ("praticienId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnostic" ADD CONSTRAINT "Diagnostic_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LignePrescription" ADD CONSTRAINT "LignePrescription_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LignePrescription" ADD CONSTRAINT "LignePrescription_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RendezVous" ADD CONSTRAINT "RendezVous_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiviProgramme" ADD CONSTRAINT "SuiviProgramme_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiviProgramme" ADD CONSTRAINT "SuiviProgramme_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Indicateur" ADD CONSTRAINT "Indicateur_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objectif" ADD CONSTRAINT "Objectif_indicateurId_fkey" FOREIGN KEY ("indicateurId") REFERENCES "Indicateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Realisation" ADD CONSTRAINT "Realisation_objectifId_fkey" FOREIGN KEY ("objectifId") REFERENCES "Objectif"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrat" ADD CONSTRAINT "Contrat_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presence" ADD CONSTRAINT "Presence_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conge" ADD CONSTRAINT "Conge_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Garde" ADD CONSTRAINT "Garde_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formation" ADD CONSTRAINT "Formation_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "Fournisseur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivrance" ADD CONSTRAINT "Delivrance_lignePrescriptionId_fkey" FOREIGN KEY ("lignePrescriptionId") REFERENCES "LignePrescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeAnalyse" ADD CONSTRAINT "DemandeAnalyse_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeAnalyse" ADD CONSTRAINT "DemandeAnalyse_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeAnalyse" ADD CONSTRAINT "DemandeAnalyse_examenId_fkey" FOREIGN KEY ("examenId") REFERENCES "Examen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultatAnalyse" ADD CONSTRAINT "ResultatAnalyse_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "DemandeAnalyse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultatAnalyse" ADD CONSTRAINT "ResultatAnalyse_technicienId_fkey" FOREIGN KEY ("technicienId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Salle" ADD CONSTRAINT "Salle_batimentId_fkey" FOREIGN KEY ("batimentId") REFERENCES "Batiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Travaux" ADD CONSTRAINT "Travaux_batimentId_fkey" FOREIGN KEY ("batimentId") REFERENCES "Batiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipement" ADD CONSTRAINT "Equipement_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "Salle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipement" ADD CONSTRAINT "Equipement_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "Fournisseur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_equipementId_fkey" FOREIGN KEY ("equipementId") REFERENCES "Equipement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "Fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneCommande" ADD CONSTRAINT "LigneCommande_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneCommande" ADD CONSTRAINT "LigneCommande_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Livraison" ADD CONSTRAINT "Livraison_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "Fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Convention" ADD CONSTRAINT "Convention_partenaireId_fkey" FOREIGN KEY ("partenaireId") REFERENCES "Partenaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membre" ADD CONSTRAINT "Membre_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "Association"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiviteCommunautaire" ADD CONSTRAINT "ActiviteCommunautaire_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "Association"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_justificatifId_fkey" FOREIGN KEY ("justificatifId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recette" ADD CONSTRAINT "Recette_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalAudit" ADD CONSTRAINT "JournalAudit_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflitSync" ADD CONSTRAINT "ConflitSync_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "OperationSync"("id") ON DELETE CASCADE ON UPDATE CASCADE;
