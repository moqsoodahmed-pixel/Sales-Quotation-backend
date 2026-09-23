// Single source of truth for CRM enum values (mirrored in
// frontend/src/constants/crm.js since the two apps can't share a module).
const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'];
const LEAD_SOURCES = ['WEBSITE', 'WHATSAPP', 'PHONE', 'EMAIL', 'REFERRAL', 'SOCIAL_MEDIA', 'ADVERTISEMENT', 'DIRECT', 'OTHER'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const CUSTOMER_STATUSES = ['PROSPECT', 'ACTIVE', 'INACTIVE'];
const ENQUIRY_STATUSES = ['NEW', 'IN_PROGRESS', 'QUALIFIED', 'PROPOSAL_REQUIRED', 'CONVERTED', 'CLOSED', 'LOST'];

module.exports = { LEAD_STATUSES, LEAD_SOURCES, PRIORITIES, CUSTOMER_STATUSES, ENQUIRY_STATUSES };
