import os
import time
import osmnx as ox
import json
import pandas as pd
from pymongo import MongoClient
from datetime import datetime, UTC

# === MongoDB Setup ===
MONGO_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("MONGODB_DB_NAME", "smarteradb")
COLL_NAME = os.getenv("MONGODB_COLLECTION_NAME", "datapoints")

if not MONGO_URI:
    raise RuntimeError("MONGODB_URI is not set.")

client = MongoClient(MONGO_URI)
db = client[DB_NAME]
collection = db[COLL_NAME]

timestamp = datetime.now(UTC)

config_path = os.path.join(os.path.dirname(__file__), 'var.json')

try:
    with open(config_path, 'r', encoding='utf-8') as f:
        config_data = json.load(f)
except FileNotFoundError:
    raise RuntimeError(f"Configuration file not found at {config_path}")

pilot_places = config_data.get("pilot_places", {})
tags_data = config_data.get("tags_data", [])

if not pilot_places or not tags_data:
    raise ValueError("var.json is missing 'pilot_places' or 'tags_data'.")

tags_df = pd.DataFrame(tags_data)

unique_keys = set([row["value"].split("=")[0] for _, row in tags_df.iterrows()])
batch_tags_dict = {key: True for key in unique_keys}


def insert_datapoint(source, survey, surveyName, region, fromUrl, dimensions, value):
    datapoint = {
        "source": source,
        "survey": survey,
        "surveyName": surveyName,
        "region": region,
        "fromUrl": fromUrl,
        "timestamp": timestamp,
        "dimensions": dimensions,
        "value": value
    }

    existing = collection.find_one({
        "source": source,
        "survey": survey,
        "region": region,
        "dimensions": dimensions,
        # "value": value
    })

    if existing:
        collection.update_one({"_id": existing["_id"]}, {"$set": {"timestamp": timestamp, "value": value}})
    else:
        result = collection.insert_one(datapoint)
        print(f"Inserted new datapoint with ID: {result.inserted_id}")


# === Main processing ===

for pilot, places in pilot_places.items():
    print(f"Elaborazione Pilot: {pilot}")

    try:
        gdf = ox.features_from_place(places, tags=batch_tags_dict)
    except Exception as e:
        if "No matching features" not in str(e):
            print(f"Errore di rete per {pilot}: {e}")
        gdf = pd.DataFrame()  # Previene crash se OSM non trova dati per l'area

    for _, tag_row in tags_df.iterrows():
        tag_name = tag_row["name"]

        if "=all" in tag_row["value"]:
            key = tag_row["value"].split("=")[0]
            val = "all"
        else:
            key, val = tag_row["value"].split("=")

        count = 0

        if not gdf.empty and key in gdf.columns:
            if val == "all":
                count = int(gdf[key].notna().sum())
            else:
                count = int((gdf[key] == val).sum())

        insert_datapoint(
            source="OSM",
            survey="osm_counts",
            surveyName="OSM Counts",
            region=pilot,
            fromUrl="https://www.openstreetmap.org",
            dimensions=[tag_name],
            value=count
        )

    time.sleep(2)  # Pausa di cortesia per OSM

client.close()
print("Done.")