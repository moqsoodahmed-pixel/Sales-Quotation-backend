const express = require("express");
const router = express.Router();
const {
  createDocument, listDocuments, getDocument, downloadDocument, updateDocument, deactivateDocument,
} = require("../controllers/documentController");
const { protect } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.use(protect);

router.route("/").get(listDocuments).post(upload.single("file"), createDocument);
router.route("/:id").get(getDocument).patch(updateDocument).delete(deactivateDocument);
router.get("/:id/download", downloadDocument);

module.exports = router;
