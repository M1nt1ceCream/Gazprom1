CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS map_features (
  osm_type text NOT NULL,
  osm_id bigint NOT NULL,
  name text,
  category text,
  tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  geom geometry(Geometry, 4326) NOT NULL,
  PRIMARY KEY (osm_type, osm_id)
);

CREATE INDEX IF NOT EXISTS map_features_geom_gix ON map_features USING gist (geom);
CREATE INDEX IF NOT EXISTS map_features_category_idx ON map_features (category);

CREATE TABLE IF NOT EXISTS import_status (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_success timestamptz,
  feature_count integer NOT NULL DEFAULT 0,
  last_error text
);
INSERT INTO import_status (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
