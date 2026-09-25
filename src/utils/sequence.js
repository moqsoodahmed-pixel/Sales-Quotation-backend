const QuotationSequence = require("../models/QuotationSequence");

// One counter document per (prefix, year, quarter) combination, e.g.
// { prefix: 'LD', year: 2026, quarter: 3 } -> seq: 7. Because the quarter
// is part of the lookup key, the sequence automatically starts fresh at 1
// the moment a new quarter begins - no cron job or manual reset needed.
// The counter is global (not scoped to a user), so it does not matter which
// sales person creates the record: whoever creates the next one within
// the same quarter gets the next number in line.
function getQuarter(date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

async function nextNumber(type, prefix) {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = getQuarter(now);

  const counter = await QuotationSequence.findOneAndUpdate(
    { prefix, year, quarter },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const seq = String(counter.seq).padStart(4, "0");
  return `${prefix}-${year}-Q${quarter}-${seq}`;
}

module.exports = { nextNumber };
