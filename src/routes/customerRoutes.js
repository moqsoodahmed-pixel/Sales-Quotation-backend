const express = require("express");
const router = express.Router();
const {
  listCustomers, getCustomer, createCustomer, updateCustomer, archiveCustomer,
  createEnquiryFromCustomer,
} = require("../controllers/customerController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.route("/").get(listCustomers).post(createCustomer);
router.route("/:id").get(getCustomer).patch(updateCustomer).delete(archiveCustomer);
router.post("/:id/enquiry", createEnquiryFromCustomer);

module.exports = router;
