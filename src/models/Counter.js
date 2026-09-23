const mongoose = require('mongoose');

// Generic named counter for human-readable business numbers (LD-000001,
// CUS-000001, ENQ-000001, ...). findOneAndUpdate with $inc + upsert is
// atomic, so concurrent requests never collide on the same number.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Counter', counterSchema);
