const Service = require("../models/Service");

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Builds server-trusted line items from raw client input. For any item that
// references a catalogue service (serviceId), the service must exist and be
// active, and its name/code/category/billingType/tax config are snapshotted
// from the catalogue - never trusted from the client. unitPrice may be
// supplied by the client (sales enters the actual quoted price), except for
// CUSTOM_QUOTE services where it is mandatory and must be > 0.
// Items with no serviceId are accepted as free-form legacy items (matches
// the pre-Phase-4 API contract) and are validated the same way otherwise.
async function buildQuotationItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: "At least one line item is required." };
  }

  const items = [];
  let subtotal = 0;

  for (const raw of rawItems) {
    const qty = Number(raw.qty ?? raw.quantity ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { error: `Invalid quantity for item "${raw.name || raw.serviceId || "unknown"}".` };
    }

    let snapshot = {
      name: raw.name,
      description: raw.description,
      categoryName: raw.categoryName,
      billingType: raw.billingType || "One Time",
      gstPercent: raw.gstPercent ?? 18,
      taxApplicable: raw.taxApplicable !== false,
      serviceCode: raw.serviceCode,
      unitPrice: raw.unitPrice,
    };

    if (raw.serviceId) {
      const service = await Service.findById(raw.serviceId).populate("category", "name");
      if (!service) return { error: `Service not found: ${raw.serviceId}` };
      if (!service.isActive) return { error: `Service "${service.name}" is not currently available for new quotations.` };

      snapshot = {
        name: service.name,
        description: raw.description ?? service.shortDescription,
        categoryName: service.category?.name,
        billingType: service.billingType,
        gstPercent: service.gstPercent,
        taxApplicable: service.taxApplicable !== false,
        serviceCode: service.serviceCode,
        unitPrice: raw.unitPrice !== undefined && raw.unitPrice !== null ? raw.unitPrice : service.defaultPrice,
      };

      if (service.pricingType === "CUSTOM_QUOTE") {
        const provided = Number(raw.unitPrice);
        if (!Number.isFinite(provided) || provided <= 0) {
          return { error: `"${service.name}" is a custom-quote service - enter the agreed quoted price before saving.` };
        }
        snapshot.unitPrice = provided;
      }
    }

    if (!snapshot.name) return { error: "Every line item must have a service name." };

    const unitPrice = Number(snapshot.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { error: `Invalid unit price for "${snapshot.name}".` };
    }

    const lineAmount = round2(qty * unitPrice);
    subtotal = round2(subtotal + lineAmount);

    items.push({
      serviceId: raw.serviceId || undefined,
      serviceCode: snapshot.serviceCode,
      name: snapshot.name,
      description: snapshot.description,
      categoryName: snapshot.categoryName,
      billingType: snapshot.billingType,
      qty,
      unitPrice,
      gstPercent: snapshot.gstPercent,
      taxApplicable: snapshot.taxApplicable,
      lineAmount,
      note: raw.note,
    });
  }

  return { items, subtotal };
}

// Computes discount, per-line tax (distributed proportionally to each
// line's share of the subtotal, using each line's OWN tax rate rather than
// one hardcoded GST%), and the grand total. Never trusts a client-submitted
// subtotal/tax/total - everything here is derived from the validated items.
function applyDiscountAndTax({ items, subtotal, discountType, discountValue, govtFeeTotal }) {
  const type = discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
  const rawValue = Number(discountValue ?? 0);
  if (!Number.isFinite(rawValue) || rawValue < 0) return { error: "Invalid discount value." };

  let discountAmount;
  if (type === "PERCENTAGE") {
    if (rawValue > 100) return { error: "Percentage discount cannot exceed 100%." };
    discountAmount = round2(subtotal * (rawValue / 100));
  } else {
    if (rawValue > subtotal) return { error: "Fixed discount cannot exceed the subtotal." };
    discountAmount = round2(rawValue);
  }

  const govtFee = Number(govtFeeTotal ?? 0);
  if (!Number.isFinite(govtFee) || govtFee < 0) return { error: "Invalid government fee amount." };

  let gstAmount = 0;
  const finalItems = items.map((item) => {
    const lineDiscountShare = subtotal > 0 ? round2((item.lineAmount / subtotal) * discountAmount) : 0;
    const lineTaxable = Math.max(0, round2(item.lineAmount - lineDiscountShare));
    const taxAmount = item.taxApplicable ? round2(lineTaxable * ((item.gstPercent || 0) / 100)) : 0;
    gstAmount = round2(gstAmount + taxAmount);
    return { ...item, taxAmount, lineTotal: round2(lineTaxable + taxAmount) };
  });

  const taxableAmount = Math.max(0, round2(subtotal - discountAmount));
  const total = round2(taxableAmount + gstAmount + govtFee);

  return { items: finalItems, discountType: type, discountValue: rawValue, discountAmount, taxableAmount, gstAmount, govtFeeTotal: govtFee, total };
}

module.exports = { buildQuotationItems, applyDiscountAndTax, round2 };
