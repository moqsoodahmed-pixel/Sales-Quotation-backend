const Counter = require('../models/Counter');

// Atomically generates the next number in a named sequence, e.g.
// nextNumber('lead', 'LD') -> "LD-000001", "LD-000002", ...
const nextNumber = async (counterName, prefix, padLength = 6) => {
  const counter = await Counter.findOneAndUpdate(
    { _id: counterName },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}-${String(counter.seq).padStart(padLength, '0')}`;
};

module.exports = { nextNumber };
