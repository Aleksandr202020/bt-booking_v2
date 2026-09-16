# BT Automazgātava — Business Rules

## Core

- Physical capacity: one wash bay.
- One booking occupies exactly one hour.
- Timezone: `Europe/Riga`.
- Working day: 09:00–21:00.
- Customer slots: 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00, 20:00.
- Every slot is returned by availability; unavailable slots are disabled rather than hidden.

## Pricing

| Category | Price |
|---|---:|
| passenger | €25 |
| crossover | €30 |
| minivan | €35 |
| commercial | €35 |

Prices are calculated on the server and stored as a booking snapshot in cents.

## Booking ownership and conflicts

- A car belongs to exactly one customer.
- A customer can book only their own car.
- `pending` and `confirmed` occupy a slot.
- `completed` is historical and never makes a past slot bookable.
- `cancelled_customer`, `cancelled_admin`, and `no_show` do not occupy a future slot.
- PostgreSQL has a partial unique index that prevents two active bookings for the same date/time.
- A database conflict is translated to `409 SLOT_UNAVAILABLE`; SQL details are never returned to clients.

## Blocked time and holidays

- A blocked slot prevents booking for that exact date/time.
- A whole-day block has no time and prevents all slots for that date.
- An active holiday prevents customer booking for the date.
- Admin manages blocked time and holidays.

## Admin

- Every admin endpoint requires an authenticated server session with role `admin`.
- Manual admin booking uses the same booking engine as customer booking.
- Editing date/time reruns working-hours, holiday, block, and conflict validation.
- Ban prevents new bookings but preserves historical records.

## Availability

Availability is calculated only on the server. The API returns all working slots with states including:

- `available`
- `booked`
- `blocked`
- `past`
- `holiday`
- `outside_booking_window`

The frontend never decides whether a slot is actually bookable.
