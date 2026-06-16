import boto3
import json
import os
from datetime import datetime

dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
s3 = boto3.client("s3", region_name="us-east-1")

FIGHTERS_TABLE = os.environ["FIGHTERS_TABLE"]
FIGHTS_TABLE = os.environ["FIGHTS_TABLE"]
S3_BUCKET = os.environ["S3_BUCKET"]
S3_KEY = "graph/fight-graph.json"


def scan_table(table_name):
    table = dynamodb.Table(table_name)
    items = []
    last_evaluated_key = None

    while True:
        if last_evaluated_key:
            response = table.scan(ExclusiveStartKey=last_evaluated_key)
        else:
            response = table.scan()

        items.extend(response.get("Items", []))
        last_evaluated_key = response.get("LastEvaluatedKey")

        if not last_evaluated_key:
            break

    return items


def handler(event, context):
    print("Exporting fight graph to S3...")

    fighters = scan_table(FIGHTERS_TABLE)
    fights = scan_table(FIGHTS_TABLE)

    fighter_map = {f["id"]: f["name"] for f in fighters}

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

    json_data = json.dumps(graph, separators=(",", ":"))

    s3.put_object(
        Bucket=S3_BUCKET,
        Key=S3_KEY,
        Body=json_data.encode("utf-8"),
        ContentType="application/json"
    )

    print(f"Graph exported — {len(fighter_map)} fighters, {len(fights)} edges")

    return {
        "status": "success",
        "fighter_count": len(fighter_map),
        "edge_count": len(fights)
    }