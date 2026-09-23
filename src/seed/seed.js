// Safe, idempotent seed. Running this any number of times must not create
// duplicates and must not touch records that already exist (so admin edits
// and production data are never overwritten). Use `npm run seed:reset` for a
// destructive development-only reset.
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const ServiceCategory = require("../models/ServiceCategory");
const Service = require("../models/Service");
const CompanySettings = require("../models/CompanySettings");
const Lead = require("../models/Lead");
const Customer = require("../models/Customer");
const Enquiry = require("../models/Enquiry");
const IsoStandard = require("../models/IsoStandard");
const { nextNumber } = require("../utils/sequence");
const {
  CATEGORIES, SERVICES_BY_CATEGORY, USERS, COMPANY_SETTINGS_DEFAULTS,
  DEMO_LEADS, DEMO_CUSTOMER, DEMO_ENQUIRY_SUBJECT,
  ISO_STANDARDS, ISO_CATEGORY, buildIsoServices,
} = require("./data");

const seedCategories = async () => {
  const catMap = {};
  for (const cat of CATEGORIES) {
    const doc = await ServiceCategory.findOneAndUpdate(
      { name: cat.name },
      { $setOnInsert: cat },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    catMap[cat.name] = doc._id;
  }
  console.log(`Categories: ${CATEGORIES.length} ensured (existing ones left untouched)`);
  return catMap;
};

const seedServices = async (catMap) => {
  let created = 0;
  let skipped = 0;
  for (const [categoryName, services] of Object.entries(SERVICES_BY_CATEGORY)) {
    const categoryId = catMap[categoryName];
    for (const svc of services) {
      const existing = await Service.findOne({ name: svc.name });
      if (existing) { skipped++; continue; }
      await Service.create({ ...svc, category: categoryId, gstPercent: 18, isActive: true });
      created++;
    }
  }
  console.log(`Services: ${created} created, ${skipped} already existed`);
};

const seedUsers = async () => {
  let created = 0;
  let skipped = 0;
  for (const u of USERS) {
    const existing = await User.findOne({ email: u.email.toLowerCase() });
    if (existing) { skipped++; continue; }
    // User.create triggers the pre('save') hash hook - never hash here.
    await User.create(u);
    created++;
  }
  console.log(`Users: ${created} created, ${skipped} already existed (passwords never touched)`);
};

const seedCompanySettings = async () => {
  const result = await CompanySettings.findByIdAndUpdate(
    "settings",
    { $setOnInsert: { _id: "settings", ...COMPANY_SETTINGS_DEFAULTS } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`Company settings: ${result ? "ensured" : "unchanged"} (existing custom settings preserved)`);
};

// Optional dev-only CRM sample data (clearly marked "[DEMO]"), matched by
// email so re-running never duplicates or overwrites it. Skipped entirely
// if no seed user exists yet to attribute the records to.
const seedCrmDemoData = async () => {
  const owner = await User.findOne({ email: USERS[0].email.toLowerCase() });
  if (!owner) { console.log("CRM demo data: skipped (no seed user found)"); return; }

  let leadsCreated = 0;
  for (const l of DEMO_LEADS) {
    const existing = await Lead.findOne({ email: l.email });
    if (existing) continue;
    const leadNumber = await nextNumber("lead", "LD");
    await Lead.create({ ...l, leadNumber, createdBy: owner._id, assignedTo: owner._id });
    leadsCreated++;
  }

  let customerCreated = false;
  let customer = await Customer.findOne({ email: DEMO_CUSTOMER.email });
  if (!customer) {
    const customerNumber = await nextNumber("customer", "CUS");
    customer = await Customer.create({ ...DEMO_CUSTOMER, customerNumber, createdBy: owner._id, assignedTo: owner._id });
    customerCreated = true;
  }

  let enquiryCreated = false;
  const existingEnquiry = await Enquiry.findOne({ subject: DEMO_ENQUIRY_SUBJECT, customer: customer._id });
  if (!existingEnquiry) {
    const enquiryNumber = await nextNumber("enquiry", "ENQ");
    await Enquiry.create({
      enquiryNumber, subject: DEMO_ENQUIRY_SUBJECT, customer: customer._id,
      status: "NEW", priority: "MEDIUM", createdBy: owner._id, assignedTo: owner._id,
    });
    enquiryCreated = true;
  }

  console.log(`CRM demo data: ${leadsCreated} lead(s) created, customer ${customerCreated ? "created" : "already existed"}, enquiry ${enquiryCreated ? "created" : "already existed"}`);
};

// ISO standards are matched by standardCode. Same insert-only-if-missing
// idiom as the rest of this file: the seed OWNS a standard/service record
// only at creation time. Once it exists, re-running the seed never touches
// it again - so an admin's pricing/description edits always survive.
const seedIsoStandards = async () => {
  const standardIdByCode = {};
  let created = 0;
  for (const std of ISO_STANDARDS) {
    const existing = await IsoStandard.findOne({ standardCode: std.standardCode });
    if (existing) { standardIdByCode[std.standardCode] = existing._id; continue; }
    const doc = await IsoStandard.create(std);
    standardIdByCode[std.standardCode] = doc._id;
    created++;
  }
  console.log(`ISO standards: ${created} created, ${ISO_STANDARDS.length - created} already existed`);
  return standardIdByCode;
};

const seedIsoCatalogue = async (standardIdByCode) => {
  const category = await ServiceCategory.findOneAndUpdate(
    { name: ISO_CATEGORY.name },
    { $setOnInsert: ISO_CATEGORY },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const services = buildIsoServices(category._id, standardIdByCode);
  let created = 0;
  let skipped = 0;
  for (const svc of services) {
    const existing = await Service.findOne({ serviceCode: svc.serviceCode });
    if (existing) { skipped++; continue; }
    await Service.create(svc);
    created++;
  }
  console.log(`ISO catalogue services: ${created} created, ${skipped} already existed`);
};

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting seed.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const catMap = await seedCategories();
  await seedServices(catMap);
  await seedUsers();
  await seedCompanySettings();
  const standardIdByCode = await seedIsoStandards();
  await seedIsoCatalogue(standardIdByCode);
  await seedCrmDemoData();

  console.log("\n✅ Safe seed complete (no existing data was modified or deleted).");
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
