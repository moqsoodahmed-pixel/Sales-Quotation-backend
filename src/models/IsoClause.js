const mongoose = require('mongoose');

// A structural framework for a standard's clause hierarchy (e.g. 4, 4.1,
// 4.2, 5, 5.1 ...). LauncherDesk does NOT ship official ISO clause text -
// admins enter/import verified clause information themselves (see Phase 7
// report, section D). No clause data is seeded by default.
const isoClauseSchema = new mongoose.Schema({
  isoStandard: { type: mongoose.Schema.Types.ObjectId, ref: 'IsoStandard', required: true },
  clauseNumber: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  parentClause: { type: mongoose.Schema.Types.ObjectId, ref: 'IsoClause' },
  level: { type: Number, default: 1, min: 1 },
  displayOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

isoClauseSchema.index({ isoStandard: 1, clauseNumber: 1 }, { unique: true });
isoClauseSchema.index({ parentClause: 1 });

module.exports = mongoose.model('IsoClause', isoClauseSchema);
