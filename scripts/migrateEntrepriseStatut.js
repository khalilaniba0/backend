/**
 * Migration script: sets statut = 'active' on all existing enterprises
 * that were created before the superadmin feature was introduced.
 *
 * Usage:
 *   node backend/scripts/migrateEntrepriseStatut.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { connectToMongoDB } = require('../config/db');
const Entreprise = require('../models/entreprise.model');

async function main() {
  try {
    await connectToMongoDB();

    // All enterprises that don't have a statut field yet (pre-migration).
    const result = await Entreprise.updateMany(
      { statut: { $exists: false } },
      {
        $set: {
          statut: 'active',
          dateInscription: new Date()
        }
      }
    );

    // Also update any that have the old isActive boolean field.
    const result2 = await Entreprise.updateMany(
      { statut: null },
      {
        $set: {
          statut: 'active',
          dateInscription: new Date()
        }
      }
    );

    console.log(`Migration terminée :`);
    console.log(`  - ${result.modifiedCount} entreprises mises à jour (sans statut)`);
    console.log(`  - ${result2.modifiedCount} entreprises mises à jour (statut null)`);

    // Remove the old isActive field from all enterprise documents.
    const cleanup = await Entreprise.updateMany(
      {},
      { $unset: { isActive: "" } }
    );
    console.log(`  - ${cleanup.modifiedCount} documents nettoyés (champ isActive supprimé)`);

    process.exit(0);
  } catch (error) {
    console.error('Erreur lors de la migration :', error.message);
    process.exit(1);
  }
}

main();
