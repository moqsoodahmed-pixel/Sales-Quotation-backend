const express = require("express");
const router = express.Router();
const {
  listNotifications, getUnreadCount, markRead, markAllRead, getPreferences, updatePreference,
} = require("../controllers/notificationController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.get("/", listNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllRead);
router.patch("/:id/read", markRead);
router.get("/preferences", getPreferences);
router.patch("/preferences", updatePreference);

module.exports = router;
