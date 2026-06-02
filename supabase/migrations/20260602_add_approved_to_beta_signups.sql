ALTER TABLE beta_signups
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;
