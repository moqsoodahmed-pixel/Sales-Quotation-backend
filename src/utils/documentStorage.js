// Local-disk storage abstraction for uploaded documents. Kept behind a small
// module boundary (saveFile/readFile/deleteFile/resolvePath) so a future
// swap to S3/cloud storage only touches this file, not every caller.
//
// Security properties:
// - Storage keys are always server-generated (crypto.randomBytes), never
//   derived from the client-supplied filename - the original filename is
//   kept only as display metadata, never used to build a filesystem path.
// - Every path is resolved and verified to stay inside the storage root
//   before any read/write/delete, closing off path traversal even if a
//   caller ever passed an unexpected key.
// - The storage root lives outside any directory served by express.static
//   (this app mounts none), and files are only ever served through the
//   authenticated download controller - never a public static route.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const STORAGE_ROOT = path.resolve(process.env.DOCUMENT_STORAGE_DIR || path.join(process.cwd(), 'uploads'));

const ensureStorageRoot = () => {
  if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
};
ensureStorageRoot();

// Resolves a stored filename to an absolute path and guarantees it cannot
// escape STORAGE_ROOT, regardless of what the key contains.
const resolvePath = (storedFilename) => {
  const resolved = path.resolve(STORAGE_ROOT, storedFilename);
  if (!resolved.startsWith(STORAGE_ROOT + path.sep) && resolved !== STORAGE_ROOT) {
    throw new Error('Invalid storage key.');
  }
  return resolved;
};

// Generates a random, collision-resistant storage key. The extension comes
// from the server's own allow-list mapping (see documentEnums.js), never
// from the client-supplied filename/extension.
const generateStorageKey = (ext) => `${crypto.randomBytes(24).toString('hex')}.${ext}`;

const saveFile = async (buffer, ext) => {
  const storedFilename = generateStorageKey(ext);
  await fsp.writeFile(resolvePath(storedFilename), buffer, { mode: 0o600 });
  return storedFilename;
};

const readFile = (storedFilename) => fsp.readFile(resolvePath(storedFilename));

const deleteFile = async (storedFilename) => {
  try { await fsp.unlink(resolvePath(storedFilename)); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
};

module.exports = { saveFile, readFile, deleteFile, resolvePath, STORAGE_ROOT };
