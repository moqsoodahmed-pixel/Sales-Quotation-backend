const express = require("express");
const router = express.Router();
const {
  listEngagements, getEngagement, createEngagement, updateEngagement,
  transitionEngagement, getEngagementHistory, getEngagementDashboard,
} = require("../controllers/isoEngagementController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.route("/").get(listEngagements).post(createEngagement);
router.route("/:id").get(getEngagement).patch(updateEngagement);
router.post("/:id/transition", transitionEngagement);
router.get("/:id/history", getEngagementHistory);
router.get("/:id/dashboard", getEngagementDashboard);

module.exports = router;
