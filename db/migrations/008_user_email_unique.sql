CREATE UNIQUE INDEX users_email_ci_idx
  ON users (lower(email));
