// Single source of truth for the document/evidence repository (mirrored in
// frontend/src/constants/documentTypes.js).
const DOCUMENT_TYPES = {
  // Customer documents
  COMPANY_REGISTRATION: 'COMPANY_REGISTRATION',
  GST_DOCUMENT: 'GST_DOCUMENT',
  PAN_DOCUMENT: 'PAN_DOCUMENT',
  ADDRESS_PROOF: 'ADDRESS_PROOF',
  OTHER_CUSTOMER_DOCUMENT: 'OTHER_CUSTOMER_DOCUMENT',
  // Quotation documents
  QUOTATION_PDF: 'QUOTATION_PDF',
  SUPPORTING_DOCUMENT: 'SUPPORTING_DOCUMENT',
  CUSTOMER_ATTACHMENT: 'CUSTOMER_ATTACHMENT',
  // ISO evidence (foundation only - no compliance workflow, see Phase 7)
  POLICY: 'POLICY',
  PROCEDURE: 'PROCEDURE',
  RECORD: 'RECORD',
  AUDIT_EVIDENCE: 'AUDIT_EVIDENCE',
  CERTIFICATE: 'CERTIFICATE',
  SUPPORTING_EVIDENCE: 'SUPPORTING_EVIDENCE',
  OTHER_ISO_DOCUMENT: 'OTHER_ISO_DOCUMENT',
};

const ALL_DOCUMENT_TYPES = Object.values(DOCUMENT_TYPES);

// documentType -> the one field it's expected to be attached to isn't
// enforced (a document may reasonably attach to more than one relation,
// e.g. a QUOTATION_PDF also linked to its customer), but createDocument
// requires at least one of customer/enquiry/quotation/service/isoStandard.

// Accepted upload formats: extension -> allowed MIME type(s) + a magic-byte
// signature checker so a renamed/mislabeled executable can't slip through
// on extension or client-supplied Content-Type alone.
const ALLOWED_MIME_TYPES = {
  'application/pdf': { ext: 'pdf', check: (buf) => buf.slice(0, 4).toString('latin1') === '%PDF' },
  'application/msword': { ext: 'doc', check: (buf) => buf.slice(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) },
  'application/vnd.ms-excel': { ext: 'xls', check: (buf) => buf.slice(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', check: (buf) => buf.slice(0, 4).toString('latin1') === 'PK\x03\x04' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', check: (buf) => buf.slice(0, 4).toString('latin1') === 'PK\x03\x04' },
  'image/jpeg': { ext: 'jpg', check: (buf) => buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  'image/png': { ext: 'png', check: (buf) => buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
};

const MAX_DOCUMENT_SIZE_MB = Number(process.env.MAX_DOCUMENT_SIZE_MB) || 10;
const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024;

// Days before expiry a document is considered "expiring soon" (display-only,
// no automated notifications in this phase).
const EXPIRING_SOON_WINDOW_DAYS = 30;

module.exports = {
  DOCUMENT_TYPES, ALL_DOCUMENT_TYPES, ALLOWED_MIME_TYPES,
  MAX_DOCUMENT_SIZE_MB, MAX_DOCUMENT_SIZE_BYTES, EXPIRING_SOON_WINDOW_DAYS,
};
