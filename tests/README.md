# Booking test coverage

These tests document and exercise the critical booking invariants used by the application:

- pricing by vehicle category
- 09:00–20:00 hourly slots
- holiday rejection
- active booking statuses
- cancellation freeing a slot
- car ownership authorization
- admin authorization
- banned customer rejection
- single active booking per slot

The database unique constraint remains the authoritative protection against concurrent double booking; endpoint/database concurrency tests should be added where the application test harness exposes the real PostgreSQL transaction boundary.
