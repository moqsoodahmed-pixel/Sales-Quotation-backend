// DESTRUCTIVE. Wipes Users, ServiceCategories, Services and CompanySettings,
// then re-seeds from scratch. Development use only - refuses to run when
// NODE_ENV=production unless explicitly overridden.
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const ServiceCategory = require("../models/ServiceCategory");
const Service = require("../models/Service");
const CompanySettings = require("../models/CompanySettings");
const IsoStandard = require("../models/IsoStandard");
const {
  CATEGORIES, SERVICES_BY_CATEGORY, USERS, COMPANY_SETTINGS_DEFAULTS,
  ISO_STANDARDS, ISO_CATEGORY, buildIsoServices,
} = require("./data");

const CONFIRM_TOKEN = "I_UNDERSTAND_THIS_DELETES_ALL_DATA";

const guardProduction = () => {
  if (process.env.NODE_ENV === "production" && process.env.CONFIRM_PRODUCTION_RESET !== CONFIRM_TOKEN) {
    console.error(
      "Refusing to run destructive reset: NODE_ENV=production.\n" +
      `If you really intend to wipe the production database, re-run with:\n` +
      `  CONFIRM_PRODUCTION_RESET=${CONFIRM_TOKEN} npm run seed:reset\n`
    );
    process.exit(1);
  }
};

const run = async () => {
  guardProduction();

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting reset.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB (NODE_ENV=${process.env.NODE_ENV || "development"})`);

  await Promise.all([
    User.deleteMany({}),
    ServiceCategory.deleteMany({}),
    Service.deleteMany({}),
    CompanySettings.deleteMany({}),
    IsoStandard.deleteMany({}),
  ]);
  console.log("Cleared existing data");

  await CompanySettings.create({ _id: "settings", ...COMPANY_SETTINGS_DEFAULTS });
  console.log("Settings seeded");

  await User.create(USERS);
  console.log("Users seeded");

  const cats = await ServiceCategory.insertMany(CATEGORIES);
  const catMap = Object.fromEntries(cats.map((c) => [c.name, c._id]));

  const services = Object.entries(SERVICES_BY_CATEGORY).flatMap(([categoryName, list]) =>
    list.map((s) => ({ ...s, category: catMap[categoryName], gstPercent: 18, isActive: true }))
  );
  await Service.insertMany(services);
  console.log("Services seeded");

  const standardDocs = await IsoStandard.insertMany(ISO_STANDARDS);
  const standardIdByCode = Object.fromEntries(standardDocs.map((s) => [s.standardCode, s._id]));
  const isoCategory = await ServiceCategory.create(ISO_CATEGORY);
  await Service.insertMany(buildIsoServices(isoCategory._id, standardIdByCode));
  console.log("ISO standards & catalogue seeded");

  console.log("\n✅ Development reset complete.\nLogin credentials:");
  for (const u of USERS) console.log(`  ${u.email} / ${u.password} (${u.role})`);
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
