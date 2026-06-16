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


def extract_fighter(result_span):
    """
    Given a span.final_result, walk up the DOM to find
    the fighter's name and Sherdog URL.
    """
    # Walk up to find the nearest ancestor with itemprop="url"
    parent = result_span.parent
    while parent:
        link = parent.find("a", itemprop="url")
        if link:
            name_tag = link.find("span", itemprop="name")
            name = name_tag.get_text(separator=" ").strip() if name_tag else link.text.strip()
            href = link.get("href", "")
            fighter_id = get_sherdog_id(href)
            return {"id": fighter_id, "name": name, "href": href}
        parent = parent.parent
    return None


def process_sub_event(sub_event):
    """
    Extract winner and loser from a subEvent element.
    Works for both main event div and regular fight tr structures.
    """
    win_span = sub_event.find("span", class_="final_result win")
    loss_span = sub_event.find("span", class_="final_result loss")

    if not win_span or not loss_span:
        return None, None

    winner = extract_fighter(win_span)
    loser = extract_fighter(loss_span)

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