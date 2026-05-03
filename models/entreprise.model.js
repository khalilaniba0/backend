const mongoose = require('mongoose');

const entrepriseSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
      match: /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/
    },
    adresse: String,
    secteur: String,
    logo: String,
    siteWeb: String,
    apropos: { type: String, default: "" },
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },

    // Superadmin validation workflow — replaces the old boolean isActive field.
    statut: {
      type: String,
      enum: ['en_attente', 'active', 'rejetee', 'suspendue'],
      default: 'en_attente'
    },
    dateInscription: { type: Date, default: Date.now },
    dateValidation: { type: Date },
    motifRejet: { type: String },
    validePar: { type: mongoose.Schema.Types.ObjectId, ref: 'Utilisateur' }
  },
  { timestamps: true }
);

// Virtual backward-compat getter so legacy code reading `isActive` still works.
entrepriseSchema.virtual('isActive').get(function () {
  return this.statut === 'active';
});

entrepriseSchema.set('toJSON', { virtuals: true });
entrepriseSchema.set('toObject', { virtuals: true });

const Entreprise = mongoose.model('Entreprise', entrepriseSchema);
module.exports = Entreprise;
