// Shared ownership-scope filter for dashboard/analytics aggregations across
// every model that uses the established assignedTo/createdBy ownership
// pattern (Lead, Customer, Enquiry, Quotation, IsoEngagement). Returns {} for
// admin/superadmin (no restriction), or the $or ownership clause for sales -
// this MUST be merged into the $match stage before any aggregation runs, so
// an org-wide total is never computed and then hidden client-side.
const salesOwnedFilter = (user) => (
  user.role === "sales" ? { $or: [{ assignedTo: user._id }, { createdBy: user._id }] } : {}
);

module.exports = { salesOwnedFilter };
