// Single, consistent date-range resolver for every dashboard/analytics
// endpoint. All boundaries are computed in server-local time (this app has
// no per-user timezone setting) and expressed as real Date objects, so
// Mongo comparisons are unambiguous - never mixing a UTC midnight with a
// local "today."
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const MAX_RANGE_DAYS = 3660; // ~10 years - generous but bounded, prevents pathological full-collection scans from a malformed custom range

function resolveDateRange(query) {
  const { range, from, to } = query;
  const now = new Date();

  if (from || to) {
    if (from && isNaN(Date.parse(from))) return { error: "Invalid 'from' date." };
    if (to && isNaN(Date.parse(to))) return { error: "Invalid 'to' date." };
    const start = from ? startOfDay(new Date(from)) : new Date(0);
    const end = to ? endOfDay(new Date(to)) : endOfDay(now);
    if (start > end) return { error: "'from' must not be after 'to'." };
    if ((end - start) / 86400000 > MAX_RANGE_DAYS) return { error: `Date range cannot exceed ${MAX_RANGE_DAYS} days.` };
    return { start, end, label: "Custom Range" };
  }

  switch (range) {
    case "today": return { start: startOfDay(now), end: endOfDay(now), label: "Today" };
    case "yesterday": { const y = addDays(now, -1); return { start: startOfDay(y), end: endOfDay(y), label: "Yesterday" }; }
    case "last7days": return { start: startOfDay(addDays(now, -6)), end: endOfDay(now), label: "Last 7 Days" };
    case "last30days": return { start: startOfDay(addDays(now, -29)), end: endOfDay(now), label: "Last 30 Days" };
    case "this_month": return { start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), end: endOfDay(now), label: "This Month" };
    case "previous_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(start), end: endOfDay(end), label: "Previous Month" };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return { start: startOfDay(new Date(now.getFullYear(), q * 3, 1)), end: endOfDay(now), label: "This Quarter" };
    }
    case "this_year": return { start: startOfDay(new Date(now.getFullYear(), 0, 1)), end: endOfDay(now), label: "This Year" };
    default: return { start: new Date(0), end: endOfDay(now), label: "All Time" };
  }
}

// day for <=31 days, week for <=180 days, month otherwise - keeps trend
// series readable instead of hundreds of daily points on a yearly range.
const trendGranularity = (start, end) => {
  const days = (end - start) / 86400000;
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
};

module.exports = { resolveDateRange, trendGranularity, startOfDay, endOfDay, addDays };
