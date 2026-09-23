const express = require("express");
const router = express.Router();
const {
  listFindings, getFinding, createFinding, updateFinding,
  transitionFinding, getFindingHistory, addFindingEvidence, removeFindingEvidence,
} = require("../controllers/auditFindingController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.route("/").get(listFindings).post(createFinding);
router.route("/:id").get(getFinding).patch(updateFinding);
router.post("/:id/transition", transitionFinding);
router.get("/:id/history", getFindingHistory);
router.post("/:id/evidence", addFindingEvidence);
router.delete("/:id/evidence/:documentId", removeFindingEvidence);

module.exports = router;
