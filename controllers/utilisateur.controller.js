require('dotenv').config();
const utilisateurModel = require('../models/utilisateur.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { transporter, resolveFromAddress } = require('../config/mailer');
const { invitationEmailHtml } = require('../utils/emailTemplates');

const maxage = 3 * 24 * 60 * 60; // 3 days in seconds
const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;
const COOKIE_SAME_SITE = isProduction ? 'None' : 'Lax';
const AUTH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProduction,
    maxAge: maxage * 1000,
    sameSite: COOKIE_SAME_SITE
};
const CLEAR_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProduction,
    maxAge: 1,
    sameSite: COOKIE_SAME_SITE
};

const normaliserUtilisateurSortie = (doc) => {
    const utilisateur = doc.toObject ? doc.toObject({ virtuals: true }) : doc;
    return {
        ...utilisateur,
        name: utilisateur.name || utilisateur.nom,
        block: typeof utilisateur.block === 'boolean' ? utilisateur.block : utilisateur.bloque,
        loginAttempts: typeof utilisateur.loginAttempts === 'number' ? utilisateur.loginAttempts : utilisateur.tentativesConnexion,
        derniereConnexion: utilisateur.derniereConnexion || null,
        isActive: utilisateur.bloque === true ? false : (utilisateur.isActive !== false)
    };
};

const createToken = (utilisateur) => {
    return jwt.sign(
        {
            utilisateurId: utilisateur._id,
            userId: utilisateur._id, // compatibilite descendante
            role: utilisateur.role,
            entrepriseId: utilisateur.entreprise
        },
        JWT_SECRET,
        { expiresIn: maxage }
    );
};

const firstDefined = (...values) => values.find((value) => value !== undefined);

const resolvePasswordPayload = (body = {}) => {
    const hasExplicitNewPassword = [
        body.newPassword,
        body.new_password,
        body.newpassword,
        body.newMotDePasse,
        body.nouveauMotDePasse,
        body.newPass,
        body.passwordNew
    ].some((value) => value !== undefined);

    const newPwd = firstDefined(
        body.newPassword,
        body.new_password,
        body.newpassword,
        body.newMotDePasse,
        body.nouveauMotDePasse,
        body.newPass,
        body.passwordNew,
        body.password,
        body.motDePasse
    );

    let oldPwd = firstDefined(
        body.oldPassword,
        body.old_password,
        body.oldpassword,
        body.currentPassword,
        body.current_password,
        body.currentpassword,
        body.ancienMotDePasse,
        body.oldMotDePasse,
        body.motDePasseActuel,
        body.currentMotDePasse,
        body.oldPass,
        body.currentPass
    );

    // Some UIs send { password, newPassword } where password represents the current one.
    if (oldPwd === undefined && hasExplicitNewPassword) {
        oldPwd = firstDefined(body.password, body.motDePasse);
    }

    return { oldPwd, newPwd };
};

module.exports.getAllUsers = async (req, res) => {
    try {
        const utilisateurs = await utilisateurModel.find({ entreprise: req.entrepriseId }).select('-motDePasse');
        const data = utilisateurs.map(normaliserUtilisateurSortie);
        res.status(200).json({ message: 'Users retrieved successfully', data });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving users', error: error.message });
    }
};

module.exports.getUserById = async (req, res) => {
    try {
        const utilisateurId = req.params.id;
        const utilisateur = await utilisateurModel
            .findOne({ _id: utilisateurId, entreprise: req.entrepriseId })
            .select('-motDePasse');
        if (!utilisateur) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json({ message: 'User retrieved successfully', data: normaliserUtilisateurSortie(utilisateur) });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving user', detail: error.message });
    }
};

module.exports.deleteUser = async (req, res) => {
    try {
        const utilisateurId = req.params.id;
        const utilisateurSupprime = await utilisateurModel.findOneAndDelete({ _id: utilisateurId, entreprise: req.entrepriseId });
        if (!utilisateurSupprime) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json({ message: 'User deleted successfully', data: normaliserUtilisateurSortie(utilisateurSupprime) });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user', detail: error.message });
    }
};

module.exports.updateUser = async (req, res) => {
    try {
        const utilisateurId = req.params.id;
        const utilisateurCourant = req.utilisateur || req.user;
        const isAdmin = utilisateurCourant.role === 'admin';
        const isOwner = utilisateurId.toString() === (req.utilisateurId || req.userId || (req.user && req.user._id.toString()));
        if (!isAdmin && !isOwner) {
            return res.status(403).json({ message: "Access denied" });
        }

        const utilisateur = await utilisateurModel.findOne({ _id: utilisateurId, entreprise: req.entrepriseId });
        if (!utilisateur) {
            return res.status(404).json({ message: "User not found" });
        }

        const {
            name,
            nom,
            email,
            tel,
            telephone,
            photo,
            adresse,
            address,
            competences,
            formation,
            linkedin,
            departement,
            role,
            block,
            bloque,
            loginAttempts,
            tentativesConnexion,
            newPassword,
            new_password,
            nouveauMotDePasse,
            password,
            motDePasse,
            oldPassword,
            old_password,
            oldpassword,
            currentPassword,
            ancienMotDePasse
        } = req.body;

        let hasChanges = false;

        if (nom !== undefined || name !== undefined) {
            utilisateur.nom = nom !== undefined ? nom : name;
            hasChanges = true;
        }
        if (email !== undefined) {
            utilisateur.email = email.toLowerCase();
            hasChanges = true;
        }
        if (tel !== undefined || telephone !== undefined) {
            utilisateur.tel = tel !== undefined ? tel : telephone;
            hasChanges = true;
        }
        if (photo !== undefined) {
            utilisateur.photo = photo;
            hasChanges = true;
        }
        if (adresse !== undefined || address !== undefined) {
            utilisateur.adresse = adresse !== undefined ? adresse : address;
            hasChanges = true;
        }
        if (competences !== undefined) {
            utilisateur.competences = competences;
            hasChanges = true;
        }
        if (formation !== undefined) {
            utilisateur.formation = formation;
            hasChanges = true;
        }
        if (linkedin !== undefined) {
            utilisateur.linkedin = linkedin;
            hasChanges = true;
        }
        if (departement !== undefined) {
            utilisateur.departement = departement;
            hasChanges = true;
        }

        const { oldPwd, newPwd: newPasswordValue } = resolvePasswordPayload(req.body);

        if (newPasswordValue !== undefined) {
            if (!isAdmin) {
                if (!oldPwd) {
                    return res.status(400).json({ message: 'Old password is required to change password' });
                }

                const passwordMatch = await bcrypt.compare(oldPwd, utilisateur.motDePasse || '');
                if (!passwordMatch) {
                    return res.status(400).json({ message: 'Old password is incorrect' });
                }
            }

            utilisateur.motDePasse = newPasswordValue;
            hasChanges = true;
        }

        if (isAdmin) {
            if (role !== undefined) {
                utilisateur.role = role;
                hasChanges = true;
            }

            const blockValue = bloque !== undefined ? bloque : block;
            if (blockValue !== undefined) {
                utilisateur.bloque = Boolean(blockValue);
                if (!utilisateur.bloque) {
                    utilisateur.tentativesConnexion = 0;
                }
                hasChanges = true;
            }

            const attempts = tentativesConnexion !== undefined ? tentativesConnexion : loginAttempts;
            if (attempts !== undefined) {
                utilisateur.tentativesConnexion = attempts;
                hasChanges = true;
            }

            if (req.body.isActive !== undefined) {
                utilisateur.isActive = Boolean(req.body.isActive);
                hasChanges = true;
            }
        }

        if (!hasChanges) {
            return res.status(400).json({ message: 'No data provided for update' });
        }

        await utilisateur.save();

        const utilisateurMisAJour = await utilisateurModel
            .findById(utilisateur._id)
            .select('-motDePasse');

        if (!utilisateurMisAJour) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json({ message: 'User updated successfully', data: normaliserUtilisateurSortie(utilisateurMisAJour) });
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({ message: 'Email already exists' });
        }
        res.status(500).json({ message: 'Error updating user', detail: error.message });
    }
};

module.exports.updateMyProfile = async (req, res) => {
    req.params.id = req.utilisateurId || req.userId || (req.user && req.user._id && req.user._id.toString());
    return module.exports.updateUser(req, res);
};

module.exports.changePassword = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const utilisateurId = req.utilisateurId || req.userId || (req.user && req.user._id && req.user._id.toString());
        if (!utilisateurId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const { oldPwd, newPwd } = resolvePasswordPayload(req.body);

        if (!oldPwd || !newPwd) {
            return res.status(400).json({
                message: 'oldPassword/currentPassword and newPassword/password are required'
            });
        }

        const utilisateur = await utilisateurModel.findOne({
            _id: utilisateurId,
            entreprise: req.entrepriseId
        });

        if (!utilisateur) {
            return res.status(404).json({ message: 'User not found' });
        }

        const passwordMatch = await bcrypt.compare(oldPwd, utilisateur.motDePasse || '');
        if (!passwordMatch) {
            return res.status(400).json({ message: 'Old password is incorrect' });
        }

        utilisateur.motDePasse = newPwd;
        await utilisateur.save();

        return res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Error updating password', detail: error.message });
    }
};

module.exports.createRh = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: "Access denied" });
        }
        const { name, nom, email, password, motDePasse, tel, departement } = req.body;
        const nouvelUtilisateur = new utilisateurModel({
            nom: nom !== undefined ? nom : name,
            email,
            motDePasse: motDePasse !== undefined ? motDePasse : password,
            role: 'rh',
            tel,
            departement,
            entreprise: req.entrepriseId
        });
        await nouvelUtilisateur.save();
        res.status(201).json({ message: 'RH created successfully', data: normaliserUtilisateurSortie(nouvelUtilisateur) });
    } catch (error) {
        res.status(500).json({ message: 'Error creating RH', detail: error.message });
    }
};

module.exports.createAdmin = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: "Access denied" });
        }
        const { name, nom, email, password, motDePasse } = req.body;
        const nouvelUtilisateur = new utilisateurModel({
            nom: nom !== undefined ? nom : name,
            email,
            motDePasse: motDePasse !== undefined ? motDePasse : password,
            role: 'admin',
            entreprise: req.entrepriseId,
            firstLogin: true
        });
        await nouvelUtilisateur.save();
        res.status(201).json({ message: 'Admin created successfully', data: normaliserUtilisateurSortie(nouvelUtilisateur) });
    } catch (error) {
        res.status(500).json({ message: 'Error creating admin', detail: error.message });
    }
};


module.exports.login = async (req, res) => {
    try {
        const { email, password, motDePasse } = req.body;
        const utilisateur = await utilisateurModel.connexion(email, motDePasse !== undefined ? motDePasse : password);
        await utilisateurModel.findByIdAndUpdate(utilisateur._id, {
            derniereConnexion: new Date(),
            isActive: true
        });

        // Superadmin has no entreprise — allow login.
        if (utilisateur.role !== 'superadmin' && !utilisateur.entreprise) {
            return res.status(403).json({ message: "User has no entreprise assigned" });
        }

        // For non-superadmin users, check enterprise statut.
        if (utilisateur.role !== 'superadmin' && utilisateur.entreprise) {
            const Entreprise = require('../models/entreprise.model');
            const entreprise = await Entreprise.findById(utilisateur.entreprise);
            if (entreprise) {
                if (entreprise.statut === 'en_attente') {
                    return res.status(403).json({
                        message: "Votre compte est en attente de validation par l'administrateur de la plateforme."
                    });
                }
                if (entreprise.statut === 'rejetee') {
                    return res.status(403).json({
                        message: `Votre demande d'inscription a été refusée. Motif : ${entreprise.motifRejet || 'Non précisé'}`
                    });
                }
                if (entreprise.statut === 'suspendue') {
                    return res.status(403).json({
                        message: "Votre compte entreprise a été suspendu. Contactez le support."
                    });
                }
            }
        }

        const token = createToken(utilisateur);
        // Session unique: se connecter en RH/Admin invalide la session candidat.
        res.cookie('jwt_candidat', '', CLEAR_COOKIE_OPTIONS);
        res.cookie('jwt', token, AUTH_COOKIE_OPTIONS);
        const donneesUtilisateur = normaliserUtilisateurSortie(utilisateur);
        delete donneesUtilisateur.motDePasse;
        delete donneesUtilisateur.password;
        res.status(200).json({ message: 'Login successful', data: donneesUtilisateur ,token: token});
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
};

module.exports.logout = async (req, res) => {
    try {
        res.cookie("jwt", "", CLEAR_COOKIE_OPTIONS);
        res.status(200).json({ message: "Logout successful" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// -- NOUVEAUX FLUX RH & SETUP --

module.exports.inviteRh = async (req, res) => {
  try {
    const { email } = req.body;
    const entrepriseId = req.entrepriseId;

    const existingUser = await utilisateurModel.findOne({ email, entreprise: entrepriseId });
    if (existingUser && !existingUser.isInvited) {
      return res.status(409).json({ message: "Cet utilisateur existe déjà et est actif dans l'entreprise." });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const invitationToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const invitationTokenExpires = Date.now() + 72 * 3600000; // 72h

    if (existingUser && existingUser.isInvited) {
      existingUser.invitationToken = invitationToken;
      existingUser.invitationTokenExpires = invitationTokenExpires;
      await existingUser.save();
    } else {
      const newUser = new utilisateurModel({
        email,
        role: 'rh',
        entreprise: entrepriseId,
        isInvited: true,
        nom: '', 
        motDePasse: crypto.randomBytes(16).toString('hex'), 
        invitationToken,
        invitationTokenExpires,
      });
      await newUser.save();
    }

    const lien = `${process.env.FRONTEND_URL}/invitation/${rawToken}`;

    await transporter.sendMail({
            from: resolveFromAddress('Talentia ATS'),
      to: email,
      subject: "Vous avez été invité à rejoindre Talentia",
      html: invitationEmailHtml({ nom_entreprise: "l'entreprise", lien, expires_hours: 72 }),
    });

    res.status(201).json({ message: 'Invitation envoyée', email });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de l'invitation", detail: error.message });
  }
};

module.exports.checkInvitation = async (req, res) => {
  try {
    const { token } = req.params;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await utilisateurModel.findOne({
      invitationToken: hashedToken,
      invitationTokenExpires: { $gt: Date.now() },
      isInvited: true
    });

    if (!user) return res.status(404).json({ message: 'Lien invalide ou expiré' });
    res.status(200).json({ email: user.email, valid: true });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la vérification' });
  }
};

module.exports.acceptInvitation = async (req, res) => {
  try {
    const { token } = req.params;
    const { nom, motDePasse, tel } = req.body;
    
    if (!nom || !motDePasse || motDePasse.length < 8) {
        return res.status(400).json({ message: 'Données invalides' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await utilisateurModel.findOne({
      invitationToken: hashedToken,
      invitationTokenExpires: { $gt: Date.now() },
      isInvited: true
    });

    if (!user) return res.status(404).json({ message: 'Lien invalide ou expiré' });

    user.nom = nom;
    user.motDePasse = motDePasse;
    if (tel) user.tel = tel;
    user.isInvited = false;
    user.invitationToken = null;
    user.invitationTokenExpires = null;
    user.firstLogin = false;

    await user.save(); // pre-save hook va hacher le mdp
    res.status(200).json({ message: 'Compte activé avec succès' });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de l'activation", detail: error.message });
  }
};

module.exports.completeSetup = async (req, res) => {
  try {
    const { nom, motDePasse, tel } = req.body;
    const utilisateurId = req.utilisateurId || req.user?._id; 
    
    const user = await utilisateurModel.findById(utilisateurId);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
    
    if (user.firstLogin !== true) {
        return res.status(403).json({ message: 'Setup déjà configuré' });
    }

    user.nom = nom || user.nom;
    if (motDePasse) user.motDePasse = motDePasse;
    if (tel) user.tel = tel;
    user.firstLogin = false;

    await user.save();
    res.status(200).json({ message: 'Profil configuré', data: normaliserUtilisateurSortie(user) });
  } catch (error) {
    res.status(500).json({ message: "Erreur de configuration", detail: error.message });
  }
};
