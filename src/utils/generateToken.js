const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Refresh tokens are only ever stored as this SHA-256 hash (Phase 9
// hardening) - the raw token is never persisted, so a database read/leak
// alone cannot be used to forge a session; the attacker would still need
// the exact raw token the client holds.
exports.hashRefreshToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');

// jti ensures every generated token is unique, even when issued within the
// same second (e.g. login immediately followed by a refresh call) - without
// it, two jwt.sign() calls with the same payload/second produce identical
// tokens, which breaks refresh-token rotation/invalidation.
exports.generateAccessToken = (userId) =>
  jwt.sign({ id: userId, jti: crypto.randomUUID() }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

exports.generateRefreshToken = (userId) =>
  jwt.sign({ id: userId, jti: crypto.randomUUID() }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' });

exports.sendTokenResponse = (user, statusCode, res, accessToken, refreshToken) => {
  res.status(statusCode).json({
    success: true,
    accessToken,
    refreshToken,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      isActive: user.isActive,
    },
  });
};
