const QuotationSequence = require('../models/QuotationSequence');
const CompanySettings = require('../models/CompanySettings');

const generateQuotationNumber = async () => {
  const settings = await CompanySettings.getSettings();
  const prefix = settings.quotPrefix || 'LD/Q';
  const year = new Date().getFullYear();

  const seq = await QuotationSequence.findOneAndUpdate(
    { prefix, year },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const padded = String(seq.seq).padStart(3, '0');
  return `${prefix}/${year}/${padded}`;
};

module.exports = generateQuotationNumber;
