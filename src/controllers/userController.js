const User = require("../models/User");
const logger = require("../utils/logger");
const { escapeRegex } = require("../utils/validators");

// This is a small, admin-only staff directory (not a public/bulk-growth
// collection like customers or documents) - a hard cap rather than full
// pagination keeps the existing flat-array response contract the frontend
// already relies on, while still bounding worst-case query/response size.
const MAX_USERS_RETURNED = 500;

// @desc    Get all users (admin/superadmin)
// @route   GET /api/users
// @access  admin, superadmin
exports.getAllUsers = async (req, res) => {
  const { role, isActive, search } = req.query;
  const filter = {};

  // superadmin sees all; admin cannot see superadmins
  if (req.user.role === "admin") {
    filter.role = { $in: ["admin", "sales"] };
  }
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === "true";
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const users = await User.find(filter)
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 })
    .limit(MAX_USERS_RETURNED);

  res.json({ success: true, count: users.length, data: users });
};

// @desc    Create user (admin/superadmin)
// @route   POST /api/users
// @access  admin, superadmin
exports.createUser = async (req, res) => {
  const { name, email, password, role, phone } = req.body;

  // admin cannot create superadmin
  if (req.user.role === "admin" && role === "superadmin") {
    return res.status(403).json({ success: false, message: "Admins cannot create superadmin accounts." });
  }

  const user = await User.create({
    name, email, password, role: role || "sales", phone,
    createdBy: req.user._id,
  });

  logger.info(`New user created: ${email} [${role}] by ${req.user.email}`);
  res.status(201).json({ success: true, data: user });
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  admin, superadmin
exports.getUser = async (req, res) => {
  const user = await User.findById(req.params.id).populate("createdBy", "name email");
  if (!user) return res.status(404).json({ success: false, message: "User not found." });
  // Consistent with getAllUsers: admins cannot view superadmin accounts.
  if (req.user.role === "admin" && user.role === "superadmin") {
    return res.status(404).json({ success: false, message: "User not found." });
  }
  res.json({ success: true, data: user });
};

// @desc    Update user (admin/superadmin)
// @route   PUT /api/users/:id
// @access  admin, superadmin
exports.updateUser = async (req, res) => {
  const { name, phone, role, isActive } = req.body;
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ success: false, message: "User not found." });

  // admin cannot modify superadmin
  if (req.user.role === "admin" && target.role === "superadmin") {
    return res.status(403).json({ success: false, message: "Admins cannot modify superadmin accounts." });
  }
  if (req.user.role === "admin" && role === "superadmin") {
    return res.status(403).json({ success: false, message: "Admins cannot promote to superadmin." });
  }

  if (name !== undefined) target.name = name;
  if (phone !== undefined) target.phone = phone;
  if (role !== undefined) target.role = role;
  if (isActive !== undefined) target.isActive = isActive;
  await target.save();

  res.json({ success: true, data: target });
};

// @desc    Reset user password (admin/superadmin)
// @route   PUT /api/users/:id/reset-password
// @access  admin, superadmin
exports.resetPassword = async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
  }

  const user = await User.findById(req.params.id).select("+password");
  if (!user) return res.status(404).json({ success: false, message: "User not found." });

  if (req.user.role === "admin" && user.role === "superadmin") {
    return res.status(403).json({ success: false, message: "Cannot reset superadmin password." });
  }

  user.password = newPassword;
  await user.save();
  logger.info(`Password reset for ${user.email} by ${req.user.email}`);
  res.json({ success: true, message: "Password reset successfully." });
};

// @desc    Delete (deactivate) user
// @route   DELETE /api/users/:id
// @access  superadmin only
exports.deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: "User not found." });
  if (user._id.equals(req.user._id)) {
    return res.status(400).json({ success: false, message: "You cannot delete yourself." });
  }
  user.isActive = false;
  await user.save();
  res.json({ success: true, message: "User deactivated successfully." });
};

// @desc    Get sales team summary (admin/superadmin) — who created how many quotations
// @route   GET /api/users/stats
// @access  admin, superadmin
exports.getUserStats = async (req, res) => {
  const Quotation = require("../models/Quotation");

  const salesUsers = await User.find({ role: "sales" }).select("name email phone isActive lastLogin");

  const stats = await Promise.all(salesUsers.map(async (u) => {
    const total = await Quotation.countDocuments({ createdBy: u._id, isDeleted: false });
    const accepted = await Quotation.countDocuments({ createdBy: u._id, status: "Accepted", isDeleted: false });
    const totalValue = await Quotation.aggregate([
      { $match: { createdBy: u._id, isDeleted: false } },
      { $group: { _id: null, sum: { $sum: "$total" } } },
    ]);
    return {
      user: u,
      totalQuotations: total,
      acceptedQuotations: accepted,
      totalValue: totalValue[0]?.sum || 0,
    };
  }));

  res.json({ success: true, data: stats });
};
