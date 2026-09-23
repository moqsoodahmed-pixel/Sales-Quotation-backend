const IsoEngagement = require('../models/IsoEngagement');
const { ownsOrIsAdmin } = require('./validators');

// An engagement is owned the same way a Customer/Lead/Enquiry is (Phase 2
// precedent): assignedTo/createdBy, checked via the existing ownsOrIsAdmin
// primitive - deliberately not a second ownership system.
const canAccessEngagement = (user, engagement) => ownsOrIsAdmin(user, engagement);

// Audit/AuditFinding/CorrectiveAction have no assignedTo/createdBy of their
// own - they inherit ownership from their parent engagement. This resolves
// the set of engagement ids a sales user owns, for scoping list queries in
// one query rather than an ownership check per child record.
const ownedEngagementIds = async (user) => {
  const owned = await IsoEngagement.find({ $or: [{ assignedTo: user._id }, { createdBy: user._id }] }).select('_id');
  return owned.map((e) => e._id);
};

module.exports = { canAccessEngagement, ownedEngagementIds };
