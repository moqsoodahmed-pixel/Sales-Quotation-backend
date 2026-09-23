// Single source of truth for role values. Keep in sync with
// frontend/src/constants/roles.js (frontend cannot import backend code
// directly, so the two lists are kept in parallel deliberately).
const ROLES = Object.freeze({
  SUPER_ADMIN: 'superadmin',
  ADMIN: 'admin',
  SALES: 'sales',
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

module.exports = { ROLES, ALL_ROLES };
