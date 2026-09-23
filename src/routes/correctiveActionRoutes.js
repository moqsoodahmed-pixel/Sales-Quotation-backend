const express = require("express");
const router = express.Router();
const {
  listCorrectiveActions, getCorrectiveAction, createCorrectiveAction, updateCorrectiveAction,
  transitionCorrectiveAction, getCorrectiveActionHistory, addCorrectiveActionEvidence, removeCorrectiveActionEvidence,
} = require("../controllers/correctiveActionController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.route("/").get(listCorrectiveActions).post(createCorrectiveAction);
router.route("/:id").get(getCorrectiveAction).patch(updateCorrectiveAction);
router.post("/:id/transition", transitionCorrectiveAction);
router.get("/:id/history", getCorrectiveActionHistory);
router.post("/:id/evidence", addCorrectiveActionEvidence);
router.delete("/:id/evidence/:documentId", removeCorrectiveActionEvidence);

module.exports = router;
