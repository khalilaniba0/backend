/**
 * Standalone script to create the initial superadmin user.
 *
 * Usage:
 *   node backend/scripts/createSuperAdmin.js
 *
 * Environment variables (optional — falls back to hardcoded defaults):
 *   SUPERADMIN_EMAIL
 *   SUPERADMIN_PASSWORD
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { connectToMongoDB } = require('../config/db');
const Utilisateur = require('../models/utilisateur.model');

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'talentia.admin@gmail.com';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@2024';

async function main() {
  try {
    await connectToMongoDB();

    const existing = await Utilisateur.findOne({ email: SUPERADMIN_EMAIL });
    if (existing) {
      console.log('Superadmin existe déjà :', SUPERADMIN_EMAIL);
      process.exit(0);
    }

    await Utilisateur.create({
      nom: 'Super Admin',
      email: SUPERADMIN_EMAIL,
      motDePasse: SUPERADMIN_PASSWORD,
      role: 'superadmin',
      entreprise: null,
      bloque: false
    });

    console.log('Superadmin créé avec succès :', SUPERADMIN_EMAIL);
    process.exit(0);
  } catch (error) {
    console.error('Erreur lors de la création du superadmin :', error.message);
    process.exit(1);
  }
}

main();
