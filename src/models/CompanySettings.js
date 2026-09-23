const mongoose = require('mongoose');

const companySettingsSchema = new mongoose.Schema({
  // Singleton doc
  _id: { type: String, default: 'settings' },
  company: { type: String, default: 'DutyLaunch Solutions Private Limited' },
  cin: { type: String, default: 'U62099KA2025PTC211509' },
  gstin: { type: String, default: '29AAMCD2048Q1ZY' },
  regAdd: { type: String },
  corpAdd: { type: String },
  phone1: { type: String, default: '+91 8458 8458 59' },
  phone2: { type: String, default: '+91 8458 8458 26' },
  email1: { type: String, default: 'contact@launcherdesk.com' },
  email2: { type: String, default: 'contact@dutylaunch.com' },
  website1: { type: String, default: 'www.launcherdesk.com' },
  website2: { type: String, default: 'www.dutylaunch.com' },
  quotPrefix: { type: String, default: 'LD/Q' },
  defaultGST: { type: Number, default: 18 },
  defaultValidity: { type: Number, default: 14 },
  defaultTerms: [{ type: String }],
}, { timestamps: true, _id: false });

// Force singleton
companySettingsSchema.statics.getSettings = async function () {
  let settings = await this.findById('settings');
  if (!settings) {
    settings = await this.create({
      _id: 'settings',
      defaultTerms: [
        'This quotation is valid for 14 days from the date of issue.',
        '50% advance payment is required to initiate the engagement; balance on delivery.',
        'Prices are exclusive of any third-party/government fees unless stated otherwise.',
        'Timelines will be confirmed upon receipt of advance payment and inputs.',
        'All prices are in Indian Rupees (INR) and exclusive of applicable taxes.',
      ],
    });
  }
  return settings;
};

module.exports = mongoose.model('CompanySettings', companySettingsSchema);
