import boto3
import json
import os
from datetime import datetime

# DynamoDB and S3 clients
dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
s3 = boto3.client("s3", region_name="us-east-1")

FIGHTERS_TABLE = "mma-math-fighters"
FIGHTS_TABLE = "mma-math-fights"
S3_BUCKET = os.environ.get("S3_BUCKET")  # set this before running
S3_KEY = "graph/fight-graph.json"


def scan_table(table_name):
    """Scan an entire DynamoDB table, handling pagination."""
    table = dynamodb.Table(table_name)
    items = []
    last_evaluated_key = None

    while True:
        if last_evaluated_key:
            response = table.scan(ExclusiveStartKey=last_evaluated_key)
        else:
            response = table.scan()

        items.extend(response.get("Items", []))
        print(f"  Scanned {len(items)} items from {table_name}...")

        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break

    return items


def build_and_export():
    print("Starting graph export...")
    start = datetime.utcnow()

    # Scan both tables
    print("\nScanning fighters table...")
    fighters = scan_table(FIGHTERS_TABLE)

    print("\nScanning fights table...")
    fights = scan_table(FIGHTS_TABLE)

    # Build compact graph
    print("\nBuilding graph...")

    fighter_map = {}
    for fighter in fighters:
        fighter_map[fighter["id"]] = fighter["name"]

    edges = {}
    for fight in fights:
        winner_id = fight.get("winnerId")
        loser_id = fight.get("loserId")
        if not winner_id or not loser_id:
            continue
        if winner_id not in edges:
            edges[winner_id] = []
        edges[winner_id].append(loser_id)

    graph = {
        "fighters": fighter_map,
        "edges": edges,
        "metadata": {
            "fighter_count": len(fighter_map),
            "edge_count": len(fights),
            "exported_at": datetime.utcnow().isoformat()
        }
    }

    print(f"Graph built — {len(fighter_map)} fighters, {len(fights)} edges")

    # Serialize to JSON
    print("\nSerializing to JSON...")
    json_data = json.dumps(graph, separators=(",", ":"))  # compact, no whitespace
    size_mb = len(json_data.encode("utf-8")) / 1024 / 1024
    print(f"Serialized size: {size_mb:.2f} MB")

    # Upload to S3
    print(f"\nUploading to s3://{S3_BUCKET}/{S3_KEY}...")
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=S3_KEY,
        Body=json_data.encode("utf-8"),
        ContentType="application/json"
    )

    elapsed = (datetime.utcnow() - start).seconds
    print(f"\nExport complete in {elapsed}s!")
    print(f"  Fighters: {len(fighter_map)}")
    print(f"  Edges: {len(fights)}")
    print(f"  File size: {size_mb:.2f} MB")
    print(f"  S3 location: s3://{S3_BUCKET}/{S3_KEY}")


if __name__ == "__main__":
    if not S3_BUCKET:
        print("Error: S3_BUCKET environment variable not set")
        print("Run: export S3_BUCKET=your-bucket-name")
        exit(1)
    
    build_and_export()