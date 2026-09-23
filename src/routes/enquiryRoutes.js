const express = require("express");
const router = express.Router();
const {
  listEnquiries, getEnquiry, createEnquiry, updateEnquiry, archiveEnquiry,
} = require("../controllers/enquiryController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.route("/").get(listEnquiries).post(createEnquiry);
router.route("/:id").get(getEnquiry).patch(updateEnquiry).delete(archiveEnquiry);

module.exports = router;
