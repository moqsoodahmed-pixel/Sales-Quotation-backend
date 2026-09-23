const express = require("express");
const router = express.Router();
const { listClauses, createClause, updateClause } = require("../controllers/isoClauseController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router.route("/").get(listClauses).post(authorize("admin", "superadmin"), createClause);
router.patch("/:id", authorize("admin", "superadmin"), updateClause);

module.exports = router;
