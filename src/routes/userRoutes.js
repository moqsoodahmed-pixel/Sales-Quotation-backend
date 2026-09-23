const express = require("express");
const router = express.Router();
const {
  getAllUsers, createUser, getUser, updateUser,
  resetPassword, deleteUser, getUserStats,
} = require("../controllers/userController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect, authorize("admin", "superadmin"));

router.route("/").get(getAllUsers).post(createUser);
router.get("/stats", getUserStats);
router.route("/:id").get(getUser).put(updateUser);
router.put("/:id/reset-password", resetPassword);
router.delete("/:id", authorize("superadmin"), deleteUser);

module.exports = router;
