const express = require("express");
const router = express.Router();
const {
  getSummary, getQuotationAnalytics, getCrmAnalytics, getIsoAnalytics, getTrends, getSalespeople,
} = require("../controllers/dashboardController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router.get("/summary", getSummary);
router.get("/quotations", getQuotationAnalytics);
router.get("/crm", getCrmAnalytics);
router.get("/iso", getIsoAnalytics);
router.get("/trends", getTrends);
router.get("/salespeople", authorize("admin", "superadmin"), getSalespeople);

module.exports = router;
