import boto3
import os
from datetime import datetime

# Initialize DynamoDB client
dynamodb = boto3.resource("dynamodb", region_name="us-east-1")

fighters_table = dynamodb.Table("mma-math-fighters")
fights_table = dynamodb.Table("mma-math-fights")


def ingest_fighter(fighter_data):
    """
    Write a single fighter and their fight history to DynamoDB.
    
    Args:
        fighter_data: dict returned by scrape_fighter()
    """
    fighter_id = fighter_data["id"]
    fighter_name = fighter_data["name"]
    fights = fighter_data["fights"]

    # --- Write fighter to fighters table ---
    fighters_table.put_item(Item={
        "id": fighter_id,
        "name": fighter_name,
        "name_lower": fighter_name.lower(),  # for case-insensitive search later
        "last_updated": datetime.utcnow().isoformat(),
    })

    print(f"  Ingested fighter: {fighter_name} (ID: {fighter_id})")

    # --- Write each win as an edge in the fights table ---
    wins = [f for f in fights if f["result"] == "win"]

    for fight in wins:
        # Skip fights with no opponent ID (Unknown Fighter etc.)
        if not fight["opponent_id"]:
            continue

        fights_table.put_item(Item={
            "winnerId": fighter_id,
            "loserId": fight["opponent_id"],
            "winnerName": fighter_name,
            "loserName": fight["opponent_name"],
            "event": fight["event_name"],
            "date": fight["event_date"],
            "method": fight["method"],
            "round": fight["round"],
            "time": fight["time"],
        })

    print(f"  Ingested {len(wins)} wins as graph edges")


def ingest_all(all_fighters):
    """
    Ingest all scraped fighters into DynamoDB.
    
    Args:
        all_fighters: dict of fighter_id -> fighter_data
    """
    print(f"\nStarting ingest of {len(all_fighters)} fighters...")

    for fighter_id, fighter_data in all_fighters.items():
        try:
            ingest_fighter(fighter_data)
        except Exception as e:
            print(f"  Failed to ingest {fighter_data['name']}: {e}")
            continue

    print("\nIngest complete!")


if __name__ == "__main__":
    # Test with checkpoint data
    import json

    if not os.path.exists("checkpoint.json"):
        print("No checkpoint found — run scraper.py first")
        exit(1)

    with open("checkpoint.json") as f:
        checkpoint = json.load(f)

    all_fighters = checkpoint["all_fighters"]
    print(f"Loaded {len(all_fighters)} fighters from checkpoint")
    ingest_all(all_fighters)