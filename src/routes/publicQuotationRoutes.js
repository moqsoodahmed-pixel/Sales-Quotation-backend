const express = require("express");
const router = express.Router();
const { getPublicQuotation, acceptPublicQuotation, rejectPublicQuotation } = require("../controllers/publicQuotationController");

// No `protect` middleware - these are customer-facing, token-authenticated
// endpoints. Security comes from the unguessable 256-bit token (hashed at
// rest), not from a login session. Rate limiting is applied in server.js.
router.get("/:token", getPublicQuotation);
router.post("/:token/accept", acceptPublicQuotation);
router.post("/:token/reject", rejectPublicQuotation);

module.exports = router;
