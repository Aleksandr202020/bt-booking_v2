# Architecture

## Layers

1. Business rules
2. PostgreSQL schema and constraints
3. Domain modules
4. Nitro server API
5. Authentication and authorization
6. Booking engine
7. Availability engine
8. Automated tests
9. Customer UI
10. Admin UI
11. CI/CD
12. Security and production audit

## Data integrity

The database is the final authority for relationships and uniqueness. Application checks provide clear errors and business validation; database constraints provide concurrency-safe integrity.

A booking references both `user_id` and `car_id`, and the database uses a composite foreign key to ensure that the selected car belongs to the booking customer.

Active-slot uniqueness is enforced by a PostgreSQL partial unique index for `pending` and `confirmed` bookings.

## Sessions

The browser receives an opaque session token in a secure `httpOnly` cookie. Only a hash of the token is stored in PostgreSQL.

## Vehicle catalog

Vehicle makes/models are versioned application seed data. The source snapshot is SS.COM Latvia's passenger-car catalog. SS.COM is not a runtime dependency.

The catalog phase will keep the make/model names as source data while separately storing the wash category used for pricing.

## Deployment

Nuxt 3 + Nitro is configured for Vercel. PostgreSQL remains an external managed database. Secrets are provided only through environment variables.
