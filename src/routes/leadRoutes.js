const express = require("express");
const router = express.Router();
const {
  listLeads, getLead, createLead, updateLead, archiveLead,
  convertLead, createEnquiryFromLead,
} = require("../controllers/leadController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.route("/").get(listLeads).post(createLead);
router.route("/:id").get(getLead).patch(updateLead).delete(archiveLead);
router.post("/:id/convert", convertLead);
router.post("/:id/enquiry", createEnquiryFromLead);

module.exports = router;
