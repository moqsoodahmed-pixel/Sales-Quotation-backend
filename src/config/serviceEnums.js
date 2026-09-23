// Single source of truth for service-catalogue enum values (mirrored in
// frontend/src/constants/catalogue.js).
const PRICING_TYPES = ['FIXED', 'STARTING_FROM', 'CUSTOM_QUOTE'];
const CURRENCIES = ['INR']; // extend here when multi-currency is needed
const STANDARD_STATUSES = ['ACTIVE', 'INACTIVE'];

// Shown wherever certification-related services are presented. Kept in one
// place so it is never silently hardcoded/duplicated across the catalogue -
// LauncherDesk provides implementation/readiness support, not certification
// itself.
const CERTIFICATION_DISCLAIMER =
  "Certification is subject to the independent certification body's audit and certification decision.";

module.exports = { PRICING_TYPES, CURRENCIES, STANDARD_STATUSES, CERTIFICATION_DISCLAIMER };
