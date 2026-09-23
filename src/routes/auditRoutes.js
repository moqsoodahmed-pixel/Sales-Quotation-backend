const express = require("express");
const router = express.Router();
const {
  listAudits, getAudit, createAudit, updateAudit,
  transitionAudit, getAuditHistory, addAuditEvidence, removeAuditEvidence,
} = require("../controllers/auditController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.route("/").get(listAudits).post(createAudit);
router.route("/:id").get(getAudit).patch(updateAudit);
router.post("/:id/transition", transitionAudit);
router.get("/:id/history", getAuditHistory);
router.post("/:id/evidence", addAuditEvidence);
router.delete("/:id/evidence/:documentId", removeAuditEvidence);

module.exports = router;
