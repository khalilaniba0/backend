const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const candidatSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  motDePasse: { type: String, required: true },
  telephone: { type: String },
  cv_url: { type: String },
  portfolio_url: { type: String },
  photo_url: { type: String },
  resetToken: { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null }
}, { timestamps: true });

candidatSchema.pre('save', async function(next) {
  if (!this.isModified('motDePasse')) return next();
  this.motDePasse = await bcrypt.hash(this.motDePasse, 10);
  next();
});

candidatSchema.methods.verifierMotDePasse = async function(motDePasse) {
  return bcrypt.compare(motDePasse, this.motDePasse);
};

module.exports = mongoose.model('Candidat', candidatSchema);