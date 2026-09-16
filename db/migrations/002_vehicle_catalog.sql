CREATE TABLE vehicle_makes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'ss.com',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make_id UUID NOT NULL REFERENCES vehicle_makes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category car_category NOT NULL DEFAULT 'passenger',
  source TEXT NOT NULL DEFAULT 'ss.com',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (make_id, name)
);

CREATE INDEX vehicle_models_make_id_idx ON vehicle_models(make_id);
CREATE INDEX vehicle_models_category_idx ON vehicle_models(category);

INSERT INTO vehicle_makes (name) VALUES
  ('Alfa Romeo'), ('Audi'), ('BMW'), ('Chevrolet'), ('Chrysler'), ('Citroen'),
  ('Cupra'), ('Dacia'), ('Dodge'), ('Fiat'), ('Ford'), ('Honda'), ('Hyundai'),
  ('Jaguar'), ('Jeep'), ('Kia'), ('Lancia'), ('Land Rover'), ('Lexus'), ('Mazda'),
  ('Mercedes'), ('Mini'), ('Mitsubishi'), ('Nissan'), ('Opel'), ('Peugeot'),
  ('Porsche'), ('Renault'), ('Saab'), ('Seat'), ('Skoda'), ('Smart'), ('Subaru'),
  ('Suzuki'), ('Tesla'), ('Toyota'), ('Volkswagen'), ('Volvo'), ('Gaz'),
  ('Moskvich'), ('Vaz'), ('Citas markas')
ON CONFLICT (name) DO NOTHING;

-- Explicit business classifications for models where the wash price category
-- is known independently of generic body-style inference.
INSERT INTO vehicle_models (make_id, name, category)
SELECT id, 'Kamiq', 'crossover' FROM vehicle_makes WHERE name = 'Skoda'
ON CONFLICT (make_id, name) DO UPDATE SET category = EXCLUDED.category;

INSERT INTO vehicle_models (make_id, name, category)
SELECT id, 'Zafira', 'crossover' FROM vehicle_makes WHERE name = 'Opel'
ON CONFLICT (make_id, name) DO UPDATE SET category = EXCLUDED.category;

INSERT INTO vehicle_models (make_id, name, category)
SELECT id, 'Caddy', 'commercial' FROM vehicle_makes WHERE name = 'Volkswagen'
ON CONFLICT (make_id, name) DO UPDATE SET category = EXCLUDED.category;

INSERT INTO vehicle_models (make_id, name, category)
SELECT id, 'Berlingo', 'commercial' FROM vehicle_makes WHERE name = 'Citroen'
ON CONFLICT (make_id, name) DO UPDATE SET category = EXCLUDED.category;

INSERT INTO vehicle_models (make_id, name, category)
SELECT id, 'V-Class', 'minivan' FROM vehicle_makes WHERE name = 'Mercedes'
ON CONFLICT (make_id, name) DO UPDATE SET category = EXCLUDED.category;
