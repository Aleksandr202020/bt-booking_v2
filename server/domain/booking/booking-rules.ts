export const APP_TIMEZONE = 'Europe/Riga' as const;

export const OPENING_HOUR = 9;
export const CLOSING_HOUR = 21;
export const SLOT_MINUTES = 60;

export const WORKING_SLOTS = Array.from(
  { length: CLOSING_HOUR - OPENING_HOUR },
  (_, index) => `${String(OPENING_HOUR + index).padStart(2, '0')}:00`,
) as readonly string[];

export const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed'] as const;
export const HISTORICAL_BOOKING_STATUSES = ['completed'] as const;
export const NON_BLOCKING_STATUSES = [
  'cancelled_customer',
  'cancelled_admin',
  'no_show',
] as const;

export const BOOKING_ERROR_CODES = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_SLOT: 'INVALID_SLOT',
  BOOKING_DATE_OUT_OF_RANGE: 'BOOKING_DATE_OUT_OF_RANGE',
  CAR_NOT_FOUND: 'CAR_NOT_FOUND',
  CAR_NOT_OWNED: 'CAR_NOT_OWNED',
  CLIENT_BANNED: 'CLIENT_BANNED',
  HOLIDAY: 'HOLIDAY',
  SLOT_BLOCKED: 'SLOT_BLOCKED',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  BOOKING_LIMIT_REACHED: 'BOOKING_LIMIT_REACHED',
  CAR_BOOKING_LIMIT_REACHED: 'CAR_BOOKING_LIMIT_REACHED',
} as const;

export type BookingErrorCode =
  (typeof BOOKING_ERROR_CODES)[keyof typeof BOOKING_ERROR_CODES];
