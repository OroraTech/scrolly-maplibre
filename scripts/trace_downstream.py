"""Trace a river route downstream from a point, for an animated paths layer.

Reads HydroRIVERS (https://www.hydrosheds.org/products/hydrorivers), finds the
river reach nearest the starting point, and follows NEXT_DOWN to the outlet.
Writes one GeoJSON LineString per reach. Each vertex gets a timestamp equal to
its distance in kilometres downstream of the start, so the reaches share one
clock and the flow moves as a single front.

Usage:
    python scripts/trace_downstream.py HydroRIVERS_v10_na.shp LON LAT out.geojson

Requires pyshp (pip install pyshp).
"""

import argparse
import json
import math

import shapefile


def distance_km(a, b):
    """Great-circle distance between two [lon, lat] points."""
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(h))


def nearest_reach(reader, point, search_degrees):
    lon, lat = point
    bbox = [lon - search_degrees, lat - search_degrees, lon + search_degrees, lat + search_degrees]
    best = None
    for shape_record in reader.iterShapeRecords(bbox=bbox):
        for vertex in shape_record.shape.points:
            d = distance_km(point, vertex)
            if best is None or d < best[0]:
                best = (d, shape_record)
    if best is None:
        raise SystemExit(f"No river reach within {search_degrees} degrees of {point}")
    return best[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("shapefile", help="Path to a HydroRIVERS .shp file")
    parser.add_argument("lon", type=float)
    parser.add_argument("lat", type=float)
    parser.add_argument("output", help="GeoJSON file to write")
    parser.add_argument("--search", type=float, default=0.1, help="Search radius for the start reach, in degrees")
    parser.add_argument("--precision", type=int, default=4, help="Decimal places to keep in coordinates")
    args = parser.parse_args()

    reader = shapefile.Reader(args.shapefile)
    fields = [f[0] for f in reader.fields[1:]]
    id_index = fields.index("HYRIV_ID")
    next_index = fields.index("NEXT_DOWN")

    # Map reach id to record number, and record number to the next reach downstream.
    record_of = {}
    next_down = {}
    for i, record in enumerate(reader.iterRecords(fields=["HYRIV_ID", "NEXT_DOWN"])):
        record_of[record[0]] = i
        next_down[i] = record[1]

    start = nearest_reach(reader, (args.lon, args.lat), args.search)
    current = record_of[start.record[id_index]]

    features = []
    clock = 0.0
    while True:
        shape = reader.shape(current)
        record = reader.record(current)
        coords = [[round(x, args.precision), round(y, args.precision)] for x, y in shape.points]
        timestamps = [clock]
        for a, b in zip(coords, coords[1:]):
            timestamps.append(timestamps[-1] + distance_km(a, b))
        clock = timestamps[-1]

        features.append({
            "type": "Feature",
            "properties": {
                "id": record[id_index],
                "order": record["ORD_FLOW"],
                "discharge": record["DIS_AV_CMS"],
                # Line width that grows with the log of average discharge (m3/s)
                "width": round(1 + math.log10(1 + record["DIS_AV_CMS"]), 2),
                "timestamps": [round(t, 2) for t in timestamps],
            },
            "geometry": {"type": "LineString", "coordinates": coords},
        })

        downstream = next_down[current]
        if downstream == 0:
            break
        current = record_of[downstream]

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))

    end = features[-1]["geometry"]["coordinates"][-1]
    print(f"{len(features)} reaches, {clock:.0f} km, ending at {end}")


if __name__ == "__main__":
    main()
