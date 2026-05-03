const multer = require('multer');
const path = require('path');
const fs = require('fs');

// On Render Free, local filesystem storage is ephemeral.
// Keep multer for now, but migrate uploads to Cloudinary/S3 for durable production storage.
const photoUploadPath = path.join(__dirname, '..', 'public', 'profile-photos');

const allowedMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg'
]);

function ensureUploadDirectory() {
  if (!fs.existsSync(photoUploadPath)) {
    fs.mkdirSync(photoUploadPath, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureUploadDirectory();
    cb(null, photoUploadPath);
  },
  filename(req, file, cb) {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const candidatId = req.candidatId || 'unknown';
    const fileName = `${candidatId}_${Date.now()}${fileExtension}`;
    cb(null, fileName);
  }
});

function fileFilter(req, file, cb) {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(new Error('Only PNG, JPG and JPEG files are allowed for profile photo'));
  }
  return cb(null, true);
}

const uploadProfilePhoto = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
});

module.exports = uploadProfilePhoto;
