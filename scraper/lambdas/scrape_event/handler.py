import requests
import boto3
import os
import re
from bs4 import BeautifulSoup
from datetime import datetime

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
}

BASE_URL = "https://www.sherdog.com"

dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
fighters_table = dynamodb.Table(os.environ["FIGHTERS_TABLE"])
fights_table = dynamodb.Table(os.environ["FIGHTS_TABLE"])


def get_sherdog_id(href):
    match = re.search(r'-(\d+)$', href)
    return match.group(1) if match else None


def extract_fighter_from_performer(performer):
    """
    Extract fighter info from an itemprop="performer" element.
    Works for both main event (div.fighter) and undercard (td) structures.
    """
    # Get fighter link for ID
    link = performer.find("a", itemprop="url")
    if not link:
        return None

    href = link.get("href", "")
    if "/fighter/" not in href:
        return None

    fighter_id = get_sherdog_id(href)

    # Get name from span[itemprop="name"] anywhere within performer
    # Main event: name is in h3 > a > span[itemprop="name"]
    # Undercard: name is in a[itemprop="url"] > span[itemprop="name"]
    # Both have span[itemprop="name"] somewhere inside performer
    name_tag = performer.find("span", itemprop="name")
    if name_tag:
        name = name_tag.get_text(separator=" ").strip()
    else:
        name = link.get_text(separator=" ").strip()

    if not name or not fighter_id:
        return None

    # Get result
    result_span = performer.find("span", class_="final_result")
    result = result_span.text.strip().lower() if result_span else None

    return {"id": fighter_id, "name": name, "result": result}


def process_sub_event(sub_event):
    """
    Extract winner and loser from a subEvent element.
    Uses itemprop="performer" containers which exist in both
    main event and undercard HTML structures.
    """
    performers = sub_event.find_all(attrs={"itemprop": "performer"})

    if len(performers) < 2:
        return None, None

    fighters = []
    for performer in performers[:2]:
        fighter = extract_fighter_from_performer(performer)
        if fighter:
            fighters.append(fighter)

    if len(fighters) < 2:
        return None, None

    winner = next((f for f in fighters if f.get("result") == "win"), None)
    loser = next((f for f in fighters if f.get("result") == "loss"), None)

    return winner, loser


def handler(event, context):
    """
    Scrape a single Sherdog event page and update
    DynamoDB with any new fighters and fight results.
    """
    event_url = event.get("event_url")
    print(f"Scraping event: {event_url}")

    response = requests.get(event_url, headers=HEADERS)
    if response.status_code != 200:
        print(f"Failed to fetch event: {response.status_code}")
        return {"status": "failed", "url": event_url}

    soup = BeautifulSoup(response.text, "html.parser")

    fighters_updated = 0
    fights_updated = 0

    # Find all subEvents — covers both main event and regular fights
    sub_events = soup.find_all(itemprop="subEvent")
    print(f"Found {len(sub_events)} fights on this event page")

    for sub_event in sub_events:
        winner, loser = process_sub_event(sub_event)

        if not winner or not loser:
            print("  Skipping fight — could not extract winner/loser")
            continue

        if not winner["id"] or not loser["id"]:
            print(f"  Skipping fight — missing fighter ID: {winner} vs {loser}")
            continue

        print(f"  {winner['name']} beat {loser['name']}")

        # Update fighters table
        fighters_table.put_item(Item={
            "id": winner["id"],
            "name": winner["name"],
            "name_lower": winner["name"].lower(),
            "last_updated": datetime.utcnow().isoformat(),
        })

        fighters_table.put_item(Item={
            "id": loser["id"],
            "name": loser["name"],
            "name_lower": loser["name"].lower(),
            "last_updated": datetime.utcnow().isoformat(),
        })

        fighters_updated += 2

        # Update fights table
        fights_table.put_item(Item={
            "winnerId": winner["id"],
            "loserId": loser["id"],
            "winnerName": winner["name"],
            "loserName": loser["name"],
            "event": event_url,
            "date": datetime.utcnow().isoformat(),
        })

        fights_updated += 1

    print(f"Updated {fighters_updated} fighters, {fights_updated} fights")

    return {
        "status": "success",
        "url": event_url,
        "fighters_updated": fighters_updated,
        "fights_updated": fights_updated
    }