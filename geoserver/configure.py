import os
import time

import requests

base = os.getenv("GEOSERVER_URL", "http://geoserver:8080/geoserver").rstrip("/")
auth = (os.getenv("GEOSERVER_ADMIN_USER", "admin"), os.environ["GEOSERVER_ADMIN_PASSWORD"])
session = requests.Session()
session.auth = auth
session.headers["Content-Type"] = "application/json"


def wait_for_server():
    for attempt in range(90):
        try:
            response = session.get(f"{base}/rest/about/version.json", timeout=5)
            if response.ok:
                return
        except requests.RequestException:
            pass
        time.sleep(5)
    raise RuntimeError("GeoServer did not become ready")


def create_if_missing(collection_url, resource_url, body):
    existing = session.get(resource_url, timeout=20)
    if existing.ok:
        return
    if existing.status_code != 404:
        existing.raise_for_status()
    response = session.post(collection_url, json=body, timeout=20)
    response.raise_for_status()


wait_for_server()
create_if_missing(f"{base}/rest/workspaces", f"{base}/rest/workspaces/obsbay.json", {"workspace": {"name": "obsbay"}})
store_url = f"{base}/rest/workspaces/obsbay/datastores"
create_if_missing(store_url, f"{store_url}/obsbay.json", {"dataStore": {"name": "obsbay", "type": "PostGIS", "enabled": True, "connectionParameters": {"entry": [
    {"@key": "host", "$": "db"}, {"@key": "port", "$": "5432"},
    {"@key": "database", "$": os.getenv("POSTGRES_DB", "obsbay")},
    {"@key": "user", "$": os.getenv("POSTGRES_USER", "obsbay")},
    {"@key": "passwd", "$": os.environ["POSTGRES_PASSWORD"]},
    {"@key": "dbtype", "$": "postgis"}, {"@key": "schema", "$": "public"},
    {"@key": "Expose primary keys", "$": "true"}
]}}})
feature_url = f"{base}/rest/workspaces/obsbay/datastores/obsbay/featuretypes"
create_if_missing(feature_url, f"{feature_url}/map_features.json", {"featureType": {"name": "map_features", "nativeName": "map_features", "srs": "EPSG:4326", "enabled": True}})
print("GeoServer workspace and obsbay:map_features layer are configured")
