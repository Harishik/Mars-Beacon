-- Postgres DDL generated from main.py models (plain columns; PostGIS not required).

CREATE TABLE dataset (
	id VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	mission VARCHAR, 
	instrument VARCHAR, 
	product_id VARCHAR, 
	resolution_m FLOAT, 
	acquired VARCHAR, 
	licence VARCHAR, 
	credit VARCHAR, 
	url VARCHAR, 
	tag VARCHAR, 
	kind VARCHAR, 
	meta JSON NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE image_cache (
	id SERIAL NOT NULL, 
	cache_key VARCHAR NOT NULL, 
	payload JSON NOT NULL, 
	fetched_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (cache_key)
);

CREATE TABLE job (
	id SERIAL NOT NULL, 
	type VARCHAR NOT NULL, 
	params JSON NOT NULL, 
	status VARCHAR NOT NULL, 
	log TEXT NOT NULL, 
	result_site_id VARCHAR, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	finished_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE plan (
	id SERIAL NOT NULL, 
	share_id VARCHAR NOT NULL, 
	site_id VARCHAR, 
	site_hash VARCHAR NOT NULL, 
	assumptions JSON, 
	seed INTEGER, 
	events JSON, 
	plan JSON NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (share_id)
);

CREATE TABLE site (
	id VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	body VARCHAR NOT NULL, 
	bbox JSON NOT NULL, 
	crs VARCHAR NOT NULL, 
	manifest_url VARCHAR, 
	site_hash VARCHAR NOT NULL, 
	placeholder BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE spaceweather_cache (
	id SERIAL NOT NULL, 
	kind VARCHAR NOT NULL, 
	start_date VARCHAR NOT NULL, 
	end_date VARCHAR NOT NULL, 
	payload JSON NOT NULL, 
	fetched_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	source_url VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE layer (
	id SERIAL NOT NULL, 
	site_id VARCHAR NOT NULL, 
	key VARCHAR NOT NULL, 
	dataset_id VARCHAR NOT NULL, 
	kind VARCHAR NOT NULL, 
	file_path VARCHAR, 
	note TEXT, 
	PRIMARY KEY (id), 
	FOREIGN KEY(site_id) REFERENCES site (id) ON DELETE CASCADE, 
	FOREIGN KEY(dataset_id) REFERENCES dataset (id)
);

CREATE TABLE pov_image (
	id SERIAL NOT NULL, 
	site_id VARCHAR NOT NULL, 
	mission VARCHAR NOT NULL, 
	instrument VARCHAR, 
	sol INTEGER, 
	x_m FLOAT NOT NULL, 
	y_m FLOAT NOT NULL, 
	z_m FLOAT, 
	heading_deg FLOAT, 
	pitch_deg FLOAT, 
	url VARCHAR NOT NULL, 
	credit VARCHAR NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(site_id) REFERENCES site (id) ON DELETE CASCADE
);

CREATE TABLE target (
	id SERIAL NOT NULL, 
	site_id VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	type VARCHAR NOT NULL, 
	lon FLOAT NOT NULL, 
	lat FLOAT NOT NULL, 
	sol INTEGER, 
	source_dataset_id VARCHAR, 
	PRIMARY KEY (id), 
	FOREIGN KEY(site_id) REFERENCES site (id) ON DELETE CASCADE, 
	FOREIGN KEY(source_dataset_id) REFERENCES dataset (id)
);

-- Optional PostGIS (the API runs this itself on startup when the extension is available; shown here for manual use).
-- Mars coordinates use SRID 0 because Mars has no Earth CRS.
-- CREATE EXTENSION IF NOT EXISTS postgis;
-- ALTER TABLE site ADD COLUMN IF NOT EXISTS geom geometry(Polygon, 0);
-- ALTER TABLE target ADD COLUMN IF NOT EXISTS geom geometry(Point, 0);
-- CREATE INDEX IF NOT EXISTS site_geom_gix ON site USING GIST (geom);
-- CREATE INDEX IF NOT EXISTS target_geom_gix ON target USING GIST (geom);
