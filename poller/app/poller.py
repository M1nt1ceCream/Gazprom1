import json
import logging
import os
import time
from pathlib import Path

import psycopg
import requests
from shapely.geometry import LineString, Point, Polygon, mapping, shape

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("obsbay-poller")


def bbox_string():
    south = float(os.getenv("BBOX_SOUTH", "68.0"))
    west = float(os.getenv("BBOX_WEST", "66.0"))
    north = float(os.getenv("BBOX_NORTH", "74.5"))
    east = float(os.getenv("BBOX_EAST", "74.0"))
    if not south < north or not west < east:
        raise ValueError("Invalid bbox: expected south < north and west < east")
    return f"{south},{west},{north},{east}"


def read_query():
    path = Path(os.getenv("OVERPASS_QUERY_FILE", "/app/config/overpass.ql"))
    return path.read_text(encoding="utf-8").replace("{{bbox}}", bbox_string())


def element_geometry(element):
    lon, lat = element.get("lon"), element.get("lat")
    if element["type"] == "node" and lon is not None and lat is not None:
        return Point(lon, lat)
    coords = [(p["lon"], p["lat"]) for p in element.get("geometry", []) if "lon" in p and "lat" in p]
    if len(coords) >= 4 and coords[0] == coords[-1] and any(
        key in element.get("tags", {}) for key in ("building", "landuse", "natural", "water", "leisure", "amenity", "area")
    ):
        try:
            polygon = Polygon(coords)
            if polygon.is_valid and not polygon.is_empty:
                return polygon
        except Exception:
            pass
    if len(coords) >= 2:
        return LineString(coords)
    center = element.get("center")
    if center:
        return Point(center["lon"], center["lat"])
    return None


def category(tags):
    for key in ("seamark:type", "man_made", "industrial", "waterway", "natural", "landuse", "public_transport", "amenity"):
        if key in tags:
            return f"{key}: {tags[key]}"
    return "Прочее"


def fetch():
    url = os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
    response = requests.post(url, data={"data": read_query()}, timeout=(20, 240), headers={"User-Agent": "ObBayMap/0.1 (self-hosted map importer)"})
    response.raise_for_status()
    body = response.json()
    elements = body.get("elements", [])
    features = []
    for item in elements:
        geom = element_geometry(item)
        if geom is None or geom.is_empty:
            continue
        tags = item.get("tags", {})
        features.append((item["type"], int(item["id"]), tags.get("name"), category(tags), json.dumps(tags, ensure_ascii=False), json.dumps(mapping(geom))))
    return features


def save_snapshot(features):
    dsn = os.environ["DATABASE_URL"]
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE TEMP TABLE incoming_features (LIKE map_features INCLUDING DEFAULTS) ON COMMIT DROP")
            cur.executemany(
                """INSERT INTO incoming_features (osm_type, osm_id, name, category, tags, geom)
                   VALUES (%s, %s, %s, %s, %s::jsonb, ST_SetSRID(ST_GeomFromGeoJSON(%s),4326))""",
                features,
            )
            cur.execute("""INSERT INTO map_features (osm_type, osm_id, name, category, tags, updated_at, geom)
                SELECT osm_type, osm_id, name, category, tags, now(), geom FROM incoming_features
                ON CONFLICT (osm_type, osm_id) DO UPDATE SET name=excluded.name, category=excluded.category,
                tags=excluded.tags, updated_at=now(), geom=excluded.geom""")
            cur.execute("""DELETE FROM map_features old WHERE NOT EXISTS
                (SELECT 1 FROM incoming_features new WHERE new.osm_type=old.osm_type AND new.osm_id=old.osm_id)""")
            cur.execute("""UPDATE import_status SET last_success=now(), feature_count=%s, last_error=NULL WHERE id=1""", (len(features),))
        conn.commit()


def run_once():
    started = time.monotonic()
    features = fetch()
    save_snapshot(features)
    LOG.info("Updated snapshot: %d features in %.1fs", len(features), time.monotonic() - started)


def record_error(error):
    try:
        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            conn.execute("UPDATE import_status SET last_error=%s WHERE id=1", (str(error)[:1000],))
    except Exception:
        LOG.exception("Could not record import error")


if __name__ == "__main__":
    run_once()
