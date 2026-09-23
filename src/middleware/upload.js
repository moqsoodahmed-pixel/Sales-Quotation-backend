const multer = require('multer');
const { ALLOWED_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES } = require('../config/documentEnums');

// Buffered in memory (documents are capped at MAX_DOCUMENT_SIZE_MB, small
// enough to hold briefly) so the controller can run the magic-byte
// signature check against the actual bytes before anything touches disk.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES[file.mimetype]) {
    return cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES, files: 1 },
  fileFilter,
});

module.exports = upload;
