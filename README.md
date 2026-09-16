# BT Automazgātava — Production Booking System

Production booking system for a single-bay manual car wash in Riga.

## Architecture principle

Build from business rules and data integrity first: database → constraints → API → authentication/authorization → booking engine → availability → tests → frontend → admin → CI → audit.

Critical invariants:

- Timezone: `Europe/Riga`.
- Working day: 09:00–21:00.
- Booking slots: 09:00 through 20:00, one hour each.
- One physical wash bay means one active booking per slot.
- PostgreSQL must physically prevent double booking.
- Price is calculated server-side and stored as a snapshot in the booking.
- A car always belongs to a customer; ownership is enforced server-side and by database relationships where practical.
- Availability is a single backend source of truth and returns all working slots with states such as available, booked, blocked, past, holiday, and outside booking window.
- Admin manual bookings use the same booking engine and validation rules.

## Vehicle catalog

The customer car make/model catalog is based on the current passenger-car make/model structure published by SS.COM Latvia (`ss.com/lv/transport/cars/`). The catalog is treated as application seed data, not as a live dependency on SS.COM.

The current SS.COM make list includes Alfa Romeo, Audi, BMW, Chevrolet, Chrysler, Citroen, Cupra, Dacia, Dodge, Fiat, Ford, Honda, Hyundai, Jaguar, Jeep, Kia, Lancia, Land Rover, Lexus, Mazda, Mercedes, Mini, Mitsubishi, Nissan, Opel, Peugeot, Porsche, Renault, Saab, Seat, Skoda, Smart, Subaru, Suzuki, Tesla, Toyota, Volkswagen, Volvo, Gaz, Moskvich, Vaz, plus a generic other-make option.

Source snapshot: https://www.ss.com/lv/transport/cars/

The model catalog will be imported into versioned seed data during the cars/catalog phase. It will not be fetched from SS.COM at booking time.

## Status

Phase 1 — repository initialization and architecture foundation.
