const mongoose = require('mongoose');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const isValidEmail = (email) => /^\S+@\S+\.\S+$/.test(email);

// Escapes regex metacharacters in user-supplied search text before it's
// embedded in a Mongo $regex filter - without this, a client could submit a
// pathological pattern (catastrophic-backtracking ReDoS) or metacharacters
// that change what the "search" actually matches. Always pair with a length
// cap (callers slice to ~100 chars) since even an escaped pattern can be
// expensive to evaluate against a large collection if arbitrarily long.
const escapeRegex = (str) => String(str).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

// A ref field may be a raw ObjectId or a populated document - normalize to
// its id string either way.
const idOf = (val) => (val && val._id !== undefined ? val._id : val);

// True for admin/superadmin, or for a sales user who owns the record
// (assigned to them or created by them). Used to enforce 403 on direct
// access to another salesperson's record. Safe to call whether or not the
// record's assignedTo/createdBy refs have been populated.
const ownsOrIsAdmin = (user, record) => {
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  const uid = String(user._id);
  const assignedId = idOf(record.assignedTo);
  const createdId = idOf(record.createdBy);
  return (assignedId && String(assignedId) === uid) || (createdId && String(createdId) === uid);
};

module.exports = { isValidObjectId, isValidEmail, parsePagination, ownsOrIsAdmin, escapeRegex };
