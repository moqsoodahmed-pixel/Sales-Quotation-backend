const IsoClause = require("../models/IsoClause");
const IsoStandard = require("../models/IsoStandard");
const { isValidObjectId } = require("../utils/validators");

// @desc List clauses for a standard
// @route GET /api/iso-clauses?isoStandard=...
exports.listClauses = async (req, res) => {
  const { isoStandard, isActive } = req.query;
  const filter = {};
  if (isoStandard) {
    if (!isValidObjectId(isoStandard)) return res.status(400).json({ success: false, message: "Invalid ISO standard id." });
    filter.isoStandard = isoStandard;
  }
  filter.isActive = isActive === "false" ? false : true;

  const clauses = await IsoClause.find(filter).sort({ displayOrder: 1, clauseNumber: 1 });
  res.json({ success: true, data: clauses });
};

// @desc Create a clause (admin/superadmin - administrators enter/import
//       their own verified clause text; LauncherDesk ships no official
//       ISO clause content by default)
// @route POST /api/iso-clauses
exports.createClause = async (req, res) => {
  const { isoStandardId, clauseNumber, title, parentClause } = req.body;
  if (!isoStandardId || !isValidObjectId(isoStandardId)) return res.status(400).json({ success: false, message: "A valid ISO standard is required." });
  if (!clauseNumber || !title) return res.status(400).json({ success: false, message: "Clause number and title are required." });

  const standard = await IsoStandard.findById(isoStandardId);
  if (!standard) return res.status(404).json({ success: false, message: "ISO standard not found." });

  const existing = await IsoClause.findOne({ isoStandard: isoStandardId, clauseNumber });
  if (existing) return res.status(400).json({ success: false, message: "This clause number already exists for this standard." });

  let parent = null;
  if (parentClause) {
    if (!isValidObjectId(parentClause)) return res.status(400).json({ success: false, message: "Invalid parent clause id." });
    parent = await IsoClause.findOne({ _id: parentClause, isoStandard: isoStandardId });
    if (!parent) return res.status(400).json({ success: false, message: "Parent clause must belong to the same ISO standard." });
  }

  const clause = await IsoClause.create({
    isoStandard: isoStandardId, clauseNumber, title,
    description: req.body.description, parentClause: parent?._id,
    level: parent ? parent.level + 1 : 1,
    displayOrder: req.body.displayOrder,
  });

  res.status(201).json({ success: true, data: clause });
};

// @desc Update a clause (admin/superadmin)
// @route PATCH /api/iso-clauses/:id
exports.updateClause = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid clause id." });
  const clause = await IsoClause.findById(req.params.id);
  if (!clause) return res.status(404).json({ success: false, message: "Clause not found." });

  const { isoStandard, ...safeBody } = req.body;
  Object.assign(clause, safeBody);
  await clause.save();
  res.json({ success: true, data: clause });
};
