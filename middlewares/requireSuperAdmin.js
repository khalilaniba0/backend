const requireSuperAdmin = (req, res, next) => {
  const role = req.role || (req.utilisateur && req.utilisateur.role) || (req.user && req.user.role);
  if (role !== 'superadmin') {
    return res.status(403).json({ message: "Accès réservé au superadmin" });
  }
  next();
};

module.exports = requireSuperAdmin;
