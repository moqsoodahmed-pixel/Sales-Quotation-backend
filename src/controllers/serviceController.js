const Service = require("../models/Service");
const ServiceCategory = require("../models/ServiceCategory");
const IsoStandard = require("../models/IsoStandard");
const { isValidObjectId, parsePagination } = require("../utils/validators");
const { PRICING_TYPES, CURRENCIES } = require("../config/serviceEnums");

exports.getCategories = async (req, res) => {
  const cats = await ServiceCategory.find({ isActive: true }).sort({ order: 1, name: 1 });
  res.json({ success: true, data: cats });
};

exports.createCategory = async (req, res) => {
  if (!req.body.name) return res.status(400).json({ success: false, message: "Category name is required." });
  const cat = await ServiceCategory.create(req.body);
  res.status(201).json({ success: true, data: cat });
};

exports.updateCategory = async (req, res) => {
  const cat = await ServiceCategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!cat) return res.status(404).json({ success: false, message: "Category not found." });
  res.json({ success: true, data: cat });
};

// @desc List/search the catalogue
// @route GET /api/services
exports.getServices = async (req, res) => {
  const { category, standard, pricingType, search, active } = req.query;
  const filter = {};

  // Sales/anyone below admin can only ever browse the active catalogue -
  // the ?active= override is honored only for admin/superadmin so a sales
  // user can't fetch inactive services into a quotation via query tampering.
  const canSeeInactive = req.user.role === "admin" || req.user.role === "superadmin";
  if (canSeeInactive && active !== undefined) filter.isActive = active === "true";
  else filter.isActive = true;

  if (category) {
    if (!isValidObjectId(category)) return res.status(400).json({ success: false, message: "Invalid category id." });
    filter.category = category;
  }
  if (standard) {
    if (!isValidObjectId(standard)) return res.status(400).json({ success: false, message: "Invalid standard id." });
    filter.standard = standard;
  }
  if (pricingType) {
    if (!PRICING_TYPES.includes(pricingType)) return res.status(400).json({ success: false, message: "Invalid pricing type." });
    filter.pricingType = pricingType;
  }

  if (search) {
    const rx = { $regex: String(search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ name: rx }, { description: rx }, { shortDescription: rx }, { serviceCode: rx }];
  }

  const { page, limit, skip } = parsePagination(req.query);

  const [items, total] = await Promise.all([
    Service.find(filter)
      .populate("category", "name colour")
      .populate("standard", "standardCode standardName edition family")
      .sort({ displayOrder: 1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Service.countDocuments(filter),
  ]);

  res.json({ success: true, data: items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
};

// @desc Get single service (still readable even if later deactivated, so
// historical enquiry/quotation references never break)
// @route GET /api/services/:id
exports.getService = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid service id." });

  const service = await Service.findById(req.params.id)
    .populate("category", "name colour")
    .populate("standard", "standardCode standardName edition family description scope");
  if (!service) return res.status(404).json({ success: false, message: "Service not found." });

  res.json({ success: true, data: service });
};

const validateServiceBody = async (body, { isUpdate = false, existingId = null } = {}) => {
  const { serviceCode, category, standard, pricingType, currency, defaultPrice, gstPercent, name } = body;

  if (!isUpdate && !name) return "Service name is required.";
  if (!isUpdate && !category) return "Category is required.";
  if (category && !isValidObjectId(category)) return "Invalid category id.";
  if (standard && !isValidObjectId(standard)) return "Invalid standard id.";
  if (pricingType && !PRICING_TYPES.includes(pricingType)) return "Invalid pricing type.";
  if (currency && !CURRENCIES.includes(currency)) return "Invalid currency.";
  if (defaultPrice !== undefined && defaultPrice !== null && (isNaN(+defaultPrice) || +defaultPrice < 0)) return "Invalid base price.";
  if (gstPercent !== undefined && (isNaN(+gstPercent) || +gstPercent < 0 || +gstPercent > 28)) return "Invalid tax rate.";

  if (serviceCode) {
    const existing = await Service.findOne({ serviceCode: String(serviceCode).toUpperCase().trim() });
    if (existing && String(existing._id) !== String(existingId)) return "Service code already exists.";
  }

  if (category) {
    const cat = await ServiceCategory.findById(category);
    if (!cat) return "Category not found.";
  }
  if (standard) {
    const std = await IsoStandard.findById(standard);
    if (!std) return "ISO standard not found.";
  }

  return null;
};

// @desc Create service
// @route POST /api/services
exports.createService = async (req, res) => {
  const error = await validateServiceBody(req.body);
  if (error) return res.status(400).json({ success: false, message: error });

  const service = await Service.create(req.body);
  res.status(201).json({ success: true, data: service });
};

// @desc Update service
// @route PATCH /api/services/:id
exports.updateService = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid service id." });

  const error = await validateServiceBody(req.body, { isUpdate: true, existingId: req.params.id });
  if (error) return res.status(400).json({ success: false, message: error });

  const service = await Service.findById(req.params.id);
  if (!service) return res.status(404).json({ success: false, message: "Service not found." });

  Object.assign(service, req.body);
  await service.save();
  res.json({ success: true, data: service });
};

// @desc Activate/deactivate a service (soft delete equivalent). Historical
// references from enquiries/quotations remain readable regardless.
// @route PATCH /api/services/:id/status
exports.updateServiceStatus = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid service id." });
  if (typeof req.body.isActive !== "boolean") return res.status(400).json({ success: false, message: "isActive (boolean) is required." });

  const service = await Service.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true });
  if (!service) return res.status(404).json({ success: false, message: "Service not found." });

  res.json({ success: true, data: service });
};

// @desc Deactivate a service (legacy alias, kept for backward compatibility)
// @route DELETE /api/services/:id
exports.deleteService = async (req, res) => {
  const service = await Service.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!service) return res.status(404).json({ success: false, message: "Service not found." });
  res.json({ success: true, message: "Service deactivated." });
};
