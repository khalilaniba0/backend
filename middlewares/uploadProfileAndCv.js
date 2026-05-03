const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Combined middleware for both profile photo and CV uploads
// On Render Free, local filesystem storage is ephemeral.
// Keep multer for now, but migrate uploads to Cloudinary/S3 for durable production storage.

const photoUploadPath = path.join(__dirname, '..', 'public', 'profile-photos');
const cvUploadPath = path.join(__dirname, '..', 'public', 'cv');

const photoMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg'
]);

const cvMimeTypes = new Set([
  'application/pdf'
]);

function ensureUploadDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (file.fieldname === 'photo') {
      ensureUploadDirectory(photoUploadPath);
      cb(null, photoUploadPath);
    } else if (file.fieldname === 'cv_url') {
      ensureUploadDirectory(cvUploadPath);
      cb(null, cvUploadPath);
    } else {
      cb(new Error('Unknown field name'));
    }
  },
  filename(req, file, cb) {
    if (file.fieldname === 'photo') {
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const candidatId = req.candidatId || 'unknown';
      const fileName = `${candidatId}_${Date.now()}${fileExtension}`;
      cb(null, fileName);
    } else if (file.fieldname === 'cv_url') {
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const originalName = file.originalname;
      const baseName = path.basename(originalName, fileExtension);
      let fileName = originalName;
      let fileIndex = 1;

      while (fs.existsSync(path.join(cvUploadPath, fileName))) {
        fileName = `${baseName}_${fileIndex}${fileExtension}`;
        fileIndex++;
      }

      cb(null, fileName);
    }
  }
});

function fileFilter(req, file, cb) {
  if (file.fieldname === 'photo') {
    if (!photoMimeTypes.has(file.mimetype)) {
      return cb(new Error('Only PNG, JPG and JPEG files are allowed for profile photo'));
    }
  } else if (file.fieldname === 'cv_url') {
    if (!cvMimeTypes.has(file.mimetype)) {
      return cb(new Error('Only PDF files are allowed for CV upload'));
    }
  }
  cb(null, true);
}

const uploadProfileAndCv = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: {
      photo: 2 * 1024 * 1024,  // 2MB for photo
      cv_url: 5 * 1024 * 1024  // 5MB for CV
    }
  }
});

module.exports = uploadProfileAndCv;
