const IsoStandard = require("../models/IsoStandard");
const { isValidObjectId } = require("../utils/validators");
const { STANDARD_STATUSES, CERTIFICATION_DISCLAIMER } = require("../config/serviceEnums");

// @desc List ISO standards
// @route GET /api/iso-standards
exports.getStandards = async (req, res) => {
  const { status, family } = req.query;
  const filter = {};
  if (status) {
    if (!STANDARD_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid status." });
    filter.status = status;
  } else {
    filter.status = "ACTIVE";
  }
  if (family) filter.family = family;

  const standards = await IsoStandard.find(filter).sort({ displayOrder: 1, standardCode: 1 });
  res.json({ success: true, data: standards, disclaimer: CERTIFICATION_DISCLAIMER });
};

// @desc Create ISO standard
// @route POST /api/iso-standards
exports.createStandard = async (req, res) => {
  const { standardCode, standardName, edition } = req.body;
  if (!standardCode || !standardName || !edition) {
    return res.status(400).json({ success: false, message: "standardCode, standardName and edition are required." });
  }

  const existing = await IsoStandard.findOne({ standardCode: standardCode.toUpperCase().trim() });
  if (existing) return res.status(400).json({ success: false, message: "This standard code already exists." });

  const standard = await IsoStandard.create(req.body);
  res.status(201).json({ success: true, data: standard });
};

// @desc Update ISO standard
// @route PATCH /api/iso-standards/:id
exports.updateStandard = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid standard id." });
  if (req.body.status && !STANDARD_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ success: false, message: "Invalid status." });
  }

  const standard = await IsoStandard.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!standard) return res.status(404).json({ success: false, message: "Standard not found." });

  res.json({ success: true, data: standard });
};
