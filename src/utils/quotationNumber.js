const QuotationSequence = require('../models/QuotationSequence');
const CompanySettings = require('../models/CompanySettings');

// Builds numbers like LD/Q3/2026/001:
//   prefix  = company short form, e.g. "LD"  (settings.quotPrefix)
//   quarter = Q1 (Jan-Mar) / Q2 (Apr-Jun) / Q3 (Jul-Sep) / Q4 (Oct-Dec),
//             derived from the current month at creation time
//   year    = current calendar year at creation time
//   seq     = 3-digit running number, shared across every sales person,
//             atomically incremented per (prefix, year, quarter) so it
//             restarts at 001 automatically each new quarter
const generateQuotationNumber = async () => {
  const settings = await CompanySettings.getSettings();
  // Short company code only, e.g. "LD" - NOT "LD/Q" (the "/Q<n>/" segment
  // is built below from the current quarter, so the stored prefix must not
  // already contain it).
  const prefix = (settings.quotPrefix || 'LD').replace(/\/Q$/i, '').replace(/\/+$/, '');

  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1; // 1-4

  const seqDoc = await QuotationSequence.findOneAndUpdate(
    { prefix, year, quarter },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const padded = String(seqDoc.seq).padStart(3, '0');
  return `${prefix}/Q${quarter}/${year}/${padded}`;
};

module.exports = generateQuotationNumber;