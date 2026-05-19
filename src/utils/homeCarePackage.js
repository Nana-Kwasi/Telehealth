import { PACKAGE_DURATION_TYPES } from '../constants/homeCareConstants';

export { PACKAGE_DURATION_TYPES };

export function isPackageDuration(durationType) {
  return PACKAGE_DURATION_TYPES.includes(durationType);
}

/** YYYY-MM-DD */
export function isValidBookingYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

function utcNoonMs(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

/** 1-based day index inside [startDate, visitDate] inclusive */
export function packageInclusiveDayNumber(startDate, visitDate) {
  const start = utcNoonMs(startDate);
  const visit = utcNoonMs(visitDate);
  if (!Number.isFinite(start) || !Number.isFinite(visit)) return null;
  return Math.floor((visit - start) / 86400000) + 1;
}

/** Weeks since start (1-based), capped for display */
export function packageWeekOrdinal(startDate, visitDate) {
  const dayNum = packageInclusiveDayNumber(startDate, visitDate);
  if (dayNum == null) return null;
  return Math.ceil(dayNum / 7);
}

export function packageSpanDaysInclusive(startDate, endDate) {
  const a = packageInclusiveDayNumber(startDate, endDate);
  return a;
}

export function localTodayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
