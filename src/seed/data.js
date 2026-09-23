const { ROLES } = require('../config/roles');

const CATEGORIES = [
  { name: "Company Registration", colour: "#1D4ED8", order: 1 },
  { name: "Licences & Registrations", colour: "#0369A1", order: 2 },
  { name: "Legal & IP", colour: "#6D28D9", order: 3 },
  { name: "Compliance", colour: "#0F766E", order: 4 },
  { name: "Accounting & Payroll", colour: "#B45309", order: 5 },
  { name: "Technology", colour: "#0891B2", order: 6 },
  { name: "Digital Marketing & Growth", colour: "#BE185D", order: 7 },
  { name: "Expansion & Funding", colour: "#047857", order: 8 },
];

// name -> partial service data; `category` is resolved to a real ObjectId by
// the seed script after categories are created/looked up.
const SERVICES_BY_CATEGORY = {
  "Company Registration": [
    { name: "Private Limited Company Registration", defaultPrice: 8500, billingType: "One Time", description: "Complete Pvt. Ltd. incorporation including DIN, DSC, MoA, AoA, and Certificate of Incorporation." },
    { name: "LLP Registration", defaultPrice: 7000, billingType: "One Time", description: "LLP registration with ROC. Includes LLP Agreement and Certificate." },
    { name: "OPC Registration", defaultPrice: 6500, billingType: "One Time" },
    { name: "Startup India / DPIIT Recognition", defaultPrice: 4200, billingType: "One Time" },
  ],
  "Licences & Registrations": [
    { name: "GST Registration", defaultPrice: 1499, billingType: "One Time" },
    { name: "MSME / Udyam Registration", defaultPrice: 499, billingType: "One Time" },
    { name: "ISO 9001 Certification", defaultPrice: 2500, billingType: "One Time" },
    { name: "Import Export Code (IEC)", defaultPrice: 1000, billingType: "One Time" },
    { name: "Class 3 DSC – Organisation", defaultPrice: 2200, billingType: "One Time" },
  ],
  "Legal & IP": [
    { name: "Trademark Registration", defaultPrice: 4000, govtFee: 4500, billingType: "One Time" },
    { name: "NDA / Confidentiality Agreement", defaultPrice: 3000, billingType: "One Time" },
  ],
  "Compliance": [
    { name: "Annual ROC Compliance", defaultPrice: 15000, billingType: "Annual" },
    { name: "GST Return Filing", defaultPrice: 1000, billingType: "Monthly" },
    { name: "TDS Return Filing", defaultPrice: 2000, billingType: "Quarterly" },
  ],
  "Accounting & Payroll": [
    { name: "Bookkeeping & Accounting", defaultPrice: 5000, billingType: "Monthly" },
    { name: "Payroll Management", defaultPrice: 3000, billingType: "Monthly" },
    { name: "HRMS Setup", defaultPrice: 18000, billingType: "One Time" },
  ],
  "Technology": [
    { name: "Static Website Development", defaultPrice: 4999, billingType: "One Time" },
    { name: "Business Website Development", defaultPrice: 15000, billingType: "One Time" },
    { name: "E-Commerce Website", defaultPrice: 35000, billingType: "One Time" },
    { name: "CRM Setup & Lead Management", defaultPrice: 25000, billingType: "One Time" },
    { name: "WhatsApp Business API Setup", defaultPrice: 3000, billingType: "One Time" },
    { name: "WhatsApp Chatbot", defaultPrice: 10000, billingType: "One Time" },
    { name: "Custom Software / SaaS Development", isCustomQuote: true, billingType: "Custom Quote" },
  ],
  "Digital Marketing & Growth": [
    { name: "SEO & Search Marketing", defaultPrice: 15000, billingType: "Monthly" },
    { name: "Google Ads Management", defaultPrice: 8000, billingType: "Monthly" },
    { name: "Social Media Management", defaultPrice: 8000, billingType: "Monthly" },
    { name: "Branding & Logo Design", defaultPrice: 3500, billingType: "One Time" },
  ],
  "Expansion & Funding": [
    { name: "UAE Business Setup", isCustomQuote: true, billingType: "Custom Quote" },
    { name: "Startup India Seed Funding Application", defaultPrice: 12000, billingType: "One Time" },
  ],
};

const USERS = [
  { name: "Super Admin", email: "superadmin@launcherdesk.com", password: "Admin@123", role: ROLES.SUPER_ADMIN },
  { name: "Admin User", email: "admin@launcherdesk.com", password: "Admin@123", role: ROLES.ADMIN },
  { name: "Sales – Rahul", email: "rahul@launcherdesk.com", password: "Sales@123", role: ROLES.SALES },
  { name: "Sales – Priya", email: "priya@launcherdesk.com", password: "Sales@123", role: ROLES.SALES },
];

const COMPANY_SETTINGS_DEFAULTS = {
  company: "DutyLaunch Solutions Private Limited",
  cin: "U62099KA2025PTC211509",
  gstin: "29AAMCD2048Q1ZY",
  regAdd: "Aspire Coworks, No. 472/7, Balaji Arcade, 2nd & 3rd Floor, A.V.S. Compound, 20th L Cross Road, AVS Layout, Ejipura, Koramangala 4th Block, Bengaluru, Karnataka – 560095",
  corpAdd: "#63, Office No 225 and 226 2nd Floor, Plazzo Mall, Ibrahim Sahib Street, Comercial Street, Bangalore 560001",
  phone1: "+91 8458 8458 59", phone2: "+91 8458 8458 26",
  email1: "contact@launcherdesk.com", email2: "contact@dutylaunch.com",
  website1: "www.launcherdesk.com", website2: "www.dutylaunch.com",
  quotPrefix: "LD/Q", defaultGST: 18, defaultValidity: 14,
  defaultTerms: [
    "This quotation is valid for 14 days from the date of issue.",
    "50% advance payment is required to initiate the engagement; balance on delivery.",
    "Prices are exclusive of any third-party/government fees unless stated otherwise.",
    "Timelines will be confirmed upon receipt of advance payment and inputs.",
    "All prices are in Indian Rupees (INR) and exclusive of applicable taxes.",
  ],
};

// Clearly-marked development-only CRM sample data. Never inserted in a way
// that could collide with or overwrite real records (matched by email).
const DEMO_LEADS = [
  { name: "[DEMO] Ravi Kumar", companyName: "[DEMO] Kumar Textiles", email: "demo.ravi@example.com", phone: "9800000001", source: "WEBSITE", priority: "HIGH", requirement: "Private Limited registration + GST" },
  { name: "[DEMO] Anjali Singh", companyName: "[DEMO] Singh Exports", email: "demo.anjali@example.com", phone: "9800000002", source: "REFERRAL", priority: "MEDIUM", requirement: "ISO 9001 certification" },
];

const DEMO_CUSTOMER = {
  companyName: "[DEMO] Bright Future Pvt Ltd",
  contactPerson: "[DEMO] Suresh Rao",
  email: "demo.suresh@example.com",
  phone: "9800000003",
  industry: "Retail",
  status: "ACTIVE",
};

const DEMO_ENQUIRY_SUBJECT = "[DEMO] Website + digital marketing package";

// --- Phase 3: ISO standard & service catalogue ---
//
// Editions below reflect the editions given in the Phase 3 spec. These are
// the editions LauncherDesk's catalogue is seeded with; re-verify against
// the current authoritative ISO/IEC listings before relying on them for a
// real commercial catalogue, and update here (not by hand-editing seeded
// records) if a standard is revised.
const ISO_STANDARDS = [
  { standardCode: "ISO-9001", standardName: "ISO 9001", edition: "2026", family: "Quality Management", description: "Requirements for a quality management system focused on consistent products/services and customer satisfaction.", scope: "Organizations of any size or sector seeking structured quality management." },
  { standardCode: "ISO-27001", standardName: "ISO/IEC 27001", edition: "2022", family: "Information Security", description: "Requirements for establishing, implementing, maintaining and improving an information security management system (ISMS).", scope: "Organizations managing information security risk." },
  { standardCode: "ISO-20000-1", standardName: "ISO/IEC 20000-1", edition: "2018", family: "IT Service Management", description: "Requirements for an IT service management system (SMS).", scope: "IT service providers." },
  { standardCode: "ISO-14001", standardName: "ISO 14001", edition: "2026", family: "Environmental Management", description: "Requirements for an environmental management system to improve environmental performance.", scope: "Organizations managing environmental responsibilities." },
  { standardCode: "ISO-45001", standardName: "ISO 45001", edition: "2018", family: "Occupational Health & Safety", description: "Requirements for an occupational health and safety management system.", scope: "Organizations seeking to reduce workplace risk." },
  { standardCode: "ISO-50001", standardName: "ISO 50001", edition: "2018", family: "Energy Management", description: "Requirements for an energy management system to improve energy performance.", scope: "Organizations seeking systematic energy management." },
  { standardCode: "ISO-22301", standardName: "ISO 22301", edition: "2019", family: "Business Continuity", description: "Requirements for a business continuity management system.", scope: "Organizations preparing for and recovering from disruptions." },
  { standardCode: "ISO-37001", standardName: "ISO 37001", edition: "2025", family: "Anti-Bribery", description: "Requirements for an anti-bribery management system.", scope: "Organizations seeking to prevent, detect and address bribery." },
  { standardCode: "ISO-27701", standardName: "ISO/IEC 27701", edition: "2025", family: "Privacy Information Management", description: "Extension to ISO/IEC 27001 for privacy information management (PIMS).", scope: "Organizations acting as PII controllers/processors." },
  { standardCode: "ISO-42001", standardName: "ISO/IEC 42001", edition: "2023", family: "AI Management", description: "Requirements for an artificial intelligence management system (AIMS) covering governance, risk and impact management.", scope: "Organizations developing, providing or using AI systems." },
  { standardCode: "ISO-22000", standardName: "ISO 22000", edition: "2018", family: "Food Safety", description: "Requirements for a food safety management system across the food chain.", scope: "Organizations in the food supply chain." },
  { standardCode: "ISO-13485", standardName: "ISO 13485", edition: "2016", family: "Medical Devices", description: "Requirements for a quality management system specific to medical devices.", scope: "Organizations involved in the medical device lifecycle." },
  { standardCode: "ISO-21001", standardName: "ISO 21001", edition: "2018", family: "Educational Organizations", description: "Requirements for a management system for educational organizations.", scope: "Organizations providing educational products/services." },
  { standardCode: "ISO-55001", standardName: "ISO 55001", edition: "2014", family: "Asset Management", description: "Requirements for an asset management system.", scope: "Organizations managing physical or other assets." },
  { standardCode: "ISO-39001", standardName: "ISO 39001", edition: "2012", family: "Road Traffic Safety", description: "Requirements for a road traffic safety management system.", scope: "Organizations interacting with the road traffic system." },
];

const ISO_CATEGORY = { name: "ISO Certification & Compliance", colour: "#0F766E", order: 9 };

// Standards commercially significant enough to warrant the full engagement
// lineup; the rest get a lighter two-service lineup (see buildIsoServices).
const FULL_LINEUP_CODES = ["ISO-9001", "ISO-27001", "ISO-14001", "ISO-45001", "ISO-22301", "ISO-27701", "ISO-42001"];

const { CERTIFICATION_DISCLAIMER } = require("../config/serviceEnums");

const buildIsoServices = (categoryId, standardDocsByCode) => {
  const services = [];

  for (const std of ISO_STANDARDS) {
    const standardId = standardDocsByCode[std.standardCode];
    const label = `${std.standardName}:${std.edition}`;
    const prefix = std.standardCode.replace(/^ISO-/, "ISO").replace(/-/g, "");

    const lineup = FULL_LINEUP_CODES.includes(std.standardCode)
      ? [
          { serviceCode: `${prefix}-GAP`, name: `${label} Gap Assessment`, shortDescription: `Assessment of current practices against ${label} requirements to identify gaps before implementation.`, pricingType: "FIXED", defaultPrice: 15000, billingType: "One Time" },
          ...(std.standardCode === "ISO-27001" ? [{ serviceCode: `${prefix}-RISK`, name: `${label} Risk Assessment Support`, shortDescription: `Support conducting an information security risk assessment aligned with ${label}.`, pricingType: "STARTING_FROM", defaultPrice: 20000, billingType: "One Time" }] : []),
          { serviceCode: `${prefix}-IMPL`, name: `${label} Implementation Support`, shortDescription: `Hands-on support to design and implement a management system aligned with ${label}.`, pricingType: "STARTING_FROM", defaultPrice: 45000, billingType: "One Time" },
          { serviceCode: `${prefix}-DOC`, name: `${label} Documentation Support`, shortDescription: `Preparation of the policies, procedures and records needed for ${label} conformance.`, pricingType: "STARTING_FROM", defaultPrice: 20000, billingType: "One Time" },
          { serviceCode: `${prefix}-AUDIT`, name: `${label} Internal Audit / Readiness Support`, shortDescription: `Internal audit and readiness review ahead of the certification body's audit.`, pricingType: "FIXED", defaultPrice: 12000, billingType: "One Time" },
          { serviceCode: `${prefix}-CERT`, name: `${label} Certification Audit Preparation`, shortDescription: `End-to-end preparation and support through the certification body's audit stages. ${CERTIFICATION_DISCLAIMER}`, pricingType: "CUSTOM_QUOTE", defaultPrice: null, billingType: "Custom Quote" },
        ]
      : [
          { serviceCode: `${prefix}-IMPL`, name: `${label} Implementation Support`, shortDescription: `Support to establish practices and documentation aligned with ${label}.`, pricingType: "STARTING_FROM", defaultPrice: 35000, billingType: "One Time" },
          { serviceCode: `${prefix}-CERT`, name: `${label} Certification Readiness Support`, shortDescription: `Readiness review and audit preparation ahead of the certification body's assessment. ${CERTIFICATION_DISCLAIMER}`, pricingType: "CUSTOM_QUOTE", defaultPrice: null, billingType: "Custom Quote" },
        ];

    for (const svc of lineup) {
      services.push({
        ...svc,
        category: categoryId,
        standard: standardId,
        edition: std.edition,
        isCustomQuote: svc.pricingType === "CUSTOM_QUOTE",
        gstPercent: 18,
        taxApplicable: true,
        currency: "INR",
        isActive: true,
      });
    }
  }

  return services;
};

module.exports = {
  CATEGORIES, SERVICES_BY_CATEGORY, USERS, COMPANY_SETTINGS_DEFAULTS,
  DEMO_LEADS, DEMO_CUSTOMER, DEMO_ENQUIRY_SUBJECT,
  ISO_STANDARDS, ISO_CATEGORY, buildIsoServices,
};
