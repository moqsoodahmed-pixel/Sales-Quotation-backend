const express = require("express");
const router = express.Router();
const {
  getCategories, createCategory, updateCategory,
  getServices, getService, createService, updateService, updateServiceStatus, deleteService,
} = require("../controllers/serviceController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router.route("/categories").get(getCategories).post(authorize("admin", "superadmin"), createCategory);
router.patch("/categories/:id", authorize("admin", "superadmin"), updateCategory);
router.route("/").get(getServices).post(authorize("admin", "superadmin"), createService);
router.route("/:id").get(getService).patch(authorize("admin", "superadmin"), updateService).delete(authorize("admin", "superadmin"), deleteService);
router.patch("/:id/status", authorize("admin", "superadmin"), updateServiceStatus);

module.exports = router;
