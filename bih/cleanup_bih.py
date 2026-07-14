#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
from pymongo import MongoClient

MONGO_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("MONGODB_DB_NAME", "smarteradb")
COLL_NAME = os.getenv("MONGODB_COLLECTION_NAME", "datapoints")

if not MONGO_URI:
    print("[ERROR] MONGODB_URI is not defined.", file=sys.stderr)
    sys.exit(1)

def main():
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    collection = db[COLL_NAME]

    count_before = collection.count_documents({"region": "bih"})
    print(f"[INFO] {count_before} bih documents'.")

    if count_before == 0:
        print("[INFO] no bih documents in db.")
        sys.exit(0)

    result = collection.delete_many({"region": "bih"})
    print(f"[INFO] deleted {result.deleted_count} documents.")

    sys.exit(0)

if __name__ == "__main__":
    main()
