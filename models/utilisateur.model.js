const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const utilisateurSchema = new mongoose.Schema(
  {
    nom: { type: String, alias: 'name' },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      unique: true,
      match: /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/
    },
    motDePasse: { type: String, alias: 'password' },
    role: { type: String, enum: ['rh', 'admin', 'superadmin'], default: 'rh' },
    tel: { type: String, alias: 'telephone' },
    photo: String,
    adresse: { type: String, alias: 'address' },
    departement: String,
    competences: [{ type: String }],
    formation: [{ type: String }],
    linkedin: String,
    googleTokens: {
      access_token: String,
      refresh_token: String,
      expiry_date: Number
    },
    entreprise: { type: mongoose.Schema.Types.ObjectId, ref: 'Entreprise', default: null },
    bloque: { type: Boolean, default: false, alias: 'block' },
    tentativesConnexion: { type: Number, default: 0, alias: 'loginAttempts' },
    derniereConnexion: {
      type: Date,
      default: null
    },
    resetToken: {
      type: String,
      default: null
    },
    resetTokenExpiry: {
      type: Date,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    invitationToken: { type: String, default: null },
    invitationTokenExpires: { type: Date, default: null },
    isInvited: { type: Boolean, default: false },
    firstLogin: { type: Boolean, default: false }
  },
  { timestamps: true }
);

utilisateurSchema.set('toJSON', { virtuals: true });
utilisateurSchema.set('toObject', { virtuals: true });

utilisateurSchema.pre('save', async function() {
  if (!this.isModified('motDePasse')) return;
  const salt = await bcrypt.genSalt();
  const motDePasseHache = await bcrypt.hash(this.motDePasse, salt);
  this.motDePasse = motDePasseHache;
});

utilisateurSchema.statics.connexion = async function(email, motDePasse) {
  const utilisateur = await this.findOne({ email });
  if (!utilisateur) {
    throw new Error('Incorrect email');
  }

  if (utilisateur.bloque === true) {
    throw new Error('User is blocked');
  }

  const correspondance = await bcrypt.compare(motDePasse, utilisateur.motDePasse);

  if (!correspondance) {
    const utilisateurMisAJour = await this.findByIdAndUpdate(
      utilisateur._id,
      { $inc: { tentativesConnexion: 1 } },
      { new: true }
    );

    if (utilisateurMisAJour.tentativesConnexion >= 5) {
      await this.findByIdAndUpdate(utilisateur._id, { bloque: true });
      throw new Error('User is blocked due to too many failed login attempts');
    }

    throw new Error('Incorrect password');
  }

  const utilisateurReinitialise = await this.findByIdAndUpdate(
    utilisateur._id,
    { tentativesConnexion: 0 },
    { new: true }
  );

  return utilisateurReinitialise;
};

// Compatibilite descendante
utilisateurSchema.statics.login = async function(email, password) {
  return this.connexion(email, password);
};

const Utilisateur = mongoose.model('Utilisateur', utilisateurSchema, 'users');
module.exports = Utilisateur;
