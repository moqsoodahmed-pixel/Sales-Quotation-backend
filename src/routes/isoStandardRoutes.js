const express = require("express");
const router = express.Router();
const { getStandards, createStandard, updateStandard } = require("../controllers/isoStandardController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router.route("/").get(getStandards).post(authorize("admin", "superadmin"), createStandard);
router.patch("/:id", authorize("admin", "superadmin"), updateStandard);

module.exports = router;
