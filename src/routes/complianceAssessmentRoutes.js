const express = require("express");
const router = express.Router();
const {
  listAssessments, getAssessment, createAssessment, updateAssessment,
  addAssessmentEvidence, removeAssessmentEvidence,
} = require("../controllers/complianceAssessmentController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.route("/").get(listAssessments).post(createAssessment);
router.route("/:id").get(getAssessment).patch(updateAssessment);
router.post("/:id/evidence", addAssessmentEvidence);
router.delete("/:id/evidence/:documentId", removeAssessmentEvidence);

module.exports = router;
