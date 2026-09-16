# BT Automazgātava — Production Booking System

Production booking system for a single-bay manual car wash in Riga.

## Architecture principle

Build from business rules and data integrity first: database → constraints → API → authentication/authorization → booking engine → availability → tests → frontend → admin → CI → audit.

## Core invariants

- Timezone: `Europe/Riga`.
- Working day: 09:00–21:00.
- Booking slots: 09:00 through 20:00, one hour each.
- One physical wash bay means one active booking per slot.
- PostgreSQL physically prevents double booking with a partial unique index.
- Price is calculated server-side and stored as a snapshot in the booking.
- Car ownership is enforced server-side and by a composite database foreign key.
- Availability is a single backend source of truth and returns all working slots with explicit states.
- Admin manual bookings use the same booking engine.
- Passwords are stored as Argon2id hashes; sessions are server-side with hashed opaque tokens.

## Vehicle catalog

The customer car make/model catalog is based on the current passenger-car structure published by SS.COM Latvia. The application does not depend on SS.COM during booking; `catalog:sync` creates a local database snapshot. Explicit business classifications include Škoda Kamiq → crossover, Opel Zafira → crossover, Volkswagen Caddy → commercial, Citroen Berlingo → commercial, and Mercedes V-Class → minivan.

Source: https://www.ss.com/lv/transport/cars/

## Development

1. Configure `DATABASE_URL`.
2. Run `npm install`.
3. Run `npm run db:migrate`.
4. Run `npm run catalog:sync` when a fresh SS.COM catalog snapshot is required.
5. Run `npm run dev`.
6. Run `npm run typecheck`, `npm run test`, and `npm run build` before committing a phase.

## Current status

Foundation, database migrations, authentication/session primitives, vehicle catalog, booking engine, availability API, customer car/booking APIs, admin manual booking, blocked slots, holidays, ban/unban, and CI foundation are implemented. Frontend and full integration/concurrency test suite remain later phases.
