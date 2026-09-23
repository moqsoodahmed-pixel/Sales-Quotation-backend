const express = require("express");
const router = express.Router();
const {
  listQuotations, getQuotation, createQuotation, updateQuotation,
  transitionQuotation, duplicateQuotation, deleteQuotation, getAnalytics,
  createRevision, getRevisions, getHistory,
  generateAndDownloadPdf, downloadLatestPdf,
} = require("../controllers/quotationController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.get("/analytics", getAnalytics);
router.route("/").get(listQuotations).post(createQuotation);
router.route("/:id").get(getQuotation).put(updateQuotation).delete(deleteQuotation);
router.patch("/:id/status", transitionQuotation);
router.post("/:id/duplicate", duplicateQuotation);
router.post("/:id/revise", createRevision);
router.get("/:id/revisions", getRevisions);
router.get("/:id/history", getHistory);
router.post("/:id/pdf", generateAndDownloadPdf);
router.get("/:id/pdf", downloadLatestPdf);

module.exports = router;
