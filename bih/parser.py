#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import json
import sys
from datetime import datetime, timezone

import pandas as pd
from pymongo import MongoClient
from pymongo.errors import BulkWriteError, OperationFailure

excel_dir = os.path.join(os.getcwd(), "excel_data")
if not os.path.isdir(excel_dir):
    print(f"[ERROR] The subfolder 'excel_data' does not exist in: {os.getcwd()}", file=sys.stderr)
    sys.exit(1)

MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:22000")
DB_NAME = os.getenv("MONGODB_DB_NAME", "smarteradb")
COLL_NAME = os.getenv("MONGODB_COLLECTION_NAME", "datapoints")

if not MONGO_URI:
    print("[ERROR] MONGODB_URI not defined.", file=sys.stderr)
    sys.exit(1)

client = MongoClient(MONGO_URI, maxPoolSize=50, retryWrites=True)
db = client[DB_NAME]
collection = db[COLL_NAME]

en_pattern = re.compile(r"^EN([_-]\d+)?$", re.IGNORECASE)
time_pattern = re.compile(r"^\d{4}((-)?(Q[1-4]|[1-4]Q|0[1-9]|1[0-2]))?$")

def read_xls_first_sheet_with_xlrd(path: str):
    try:
        import xlrd  
    except ImportError as e:
        raise ImportError(
            "xlrd==1.2.0 is required for .xls. Install with: pip install xlrd==1.2.0"
        ) from e

    book = xlrd.open_workbook(path)
    sheet = book.sheet_by_index(0)

    headers = []
    for c in range(sheet.ncols):
        val = sheet.cell_value(0, c)
        headers.append(str(val).strip() if val is not None else f"col_{c}")

    rows = []
    for r in range(1, sheet.nrows):
        rows.append([sheet.cell_value(r, c) for c in range(sheet.ncols)])

    df = pd.DataFrame(rows, columns=headers)
    return df, book.sheet_names()[0]

def read_first_sheet_any(path: str):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".xls":
        return read_xls_first_sheet_with_xlrd(path)
    elif ext in (".xlsx", ".xlsm"):
        df = pd.read_excel(path, sheet_name=0, dtype=object, engine="openpyxl")
        sheet_name = pd.ExcelFile(path, engine="openpyxl").sheet_names[0]
        return df, sheet_name
    else:
        raise ValueError(f"Unsupported extension: {ext} ({os.path.basename(path)})")

def to_float_or_none(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    if s == "" or s.lower() == "nan":
        return None
    try:
        return float(s.replace(",", "."))
    except Exception:
        return None

def build_datapoints_for_file(fname: str, df: pd.DataFrame, sheet_name: str, run_ts: str):
    df.columns = [str(c).strip() for c in df.columns]

    en_cols = [c for c in df.columns if en_pattern.match(c)]
    if not en_cols:
        en_cols = [c for c in df.columns if en_pattern.match(c.replace(" ", ""))]

    time_cols = [c for c in df.columns if time_pattern.match(c)]

    datapoints = []
    for _, row in df.iterrows():
        en_values = []
        for c in en_cols:
            v = row.get(c, None)
            if pd.isna(v):
                en_values.append(None)
            else:
                en_values.append(v if isinstance(v, (int, float, str)) else str(v))

        for tcol in time_cols:
            v = row.get(tcol, None)
            num = to_float_or_none(v)
            if num is None:
                continue
            datapoints.append({
                "source": "Agency for Statistics of BiH",
                "survey": fname,
                "surveyName": sheet_name,
                "region": "bih",
                "fromUrl": fname,
                "timestamp": run_ts,
                "dimensions": en_values + [tcol],
                "value": num,
            })
    return datapoints

def main():
    run_ts = datetime.now(timezone.utc).isoformat()

    count_before = collection.count_documents({"region": "bih"})
    print(f"[CLEANUP] found {count_before} region='bih' documents.")
    if count_before > 0:
        result = collection.delete_many({"region": "bih"})
        print(f"[CLEANUP] deleted {result.deleted_count} documents.")

    all_datapoints = []

    for fname in sorted(os.listdir(excel_dir)):
        ext = os.path.splitext(fname)[1].lower()
        if ext not in (".xlsx", ".xlsm", ".xls"):
            continue
        path = os.path.join(excel_dir, fname)
        try:
            df, sheet_name = read_first_sheet_any(path)
        except Exception as e:
            print(f"[WARN] skipped '{fname}': {e}", file=sys.stderr)
            continue

        all_datapoints.extend(build_datapoints_for_file(fname, df, str(sheet_name), run_ts))

    out_file = os.path.join(os.getcwd(), "datapoints.json")
    try:
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(all_datapoints, f, ensure_ascii=False, indent=2)
        print(f"[JSON] {len(all_datapoints)} records → {out_file}")
    except Exception as e:
        print(f"[ERROR] JSON write failed: {e}", file=sys.stderr)
        sys.exit(1)

    #try:
    #    collection.create_index(
    #        [("survey", 1), ("surveyName", 1), ("region", 1), ("dimensions", 1)],
    #        unique=True,
    #        name="uniq_survey_sheet_region_dims",
    #        partialFilterExpression={"dimensions": {"$type": "array"}},
    #    )
    #except OperationFailure as e:
    #    print(f"[INFO] Index notice: {e}", file=sys.stderr)

    if not all_datapoints:
        print("[INFO] There is no data to insert into Mongo..")
        sys.exit(0)

    try:
        result = collection.insert_many(all_datapoints, ordered=False)
        inserted = len(result.inserted_ids)
        print(f"[Mongo] New ones inserted: {inserted}")
    except BulkWriteError as bwe:
        details = bwe.details or {}
        inserted = details.get("nInserted", 0)
        write_errors = details.get("writeErrors", [])
        dup_count = sum(1 for err in write_errors if err.get("code") == 11000)
        other_errs = [err for err in write_errors if err.get("code") != 11000]
        print(f"[Mongo] New ones inserted: {inserted}, skipped duplicates: {dup_count}")
        if other_errs:
            print(f"[WARN] Other records failed: {len(other_errs)} (first): {other_errs[0]}", file=sys.stderr)

    sys.exit(0)

if __name__ == "__main__":
    main()
