CREATE UNIQUE INDEX cars_registration_number_ci_idx
  ON cars (lower(registration_number));