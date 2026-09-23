const CompanySettings = require("../models/CompanySettings");

exports.getSettings = async (req, res) => {
  const settings = await CompanySettings.getSettings();
  res.json({ success: true, data: settings });
};

exports.updateSettings = async (req, res) => {
  const settings = await CompanySettings.findByIdAndUpdate("settings", req.body, {
    new: true, upsert: true, runValidators: true,
  });
  res.json({ success: true, data: settings });
};
