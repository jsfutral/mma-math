import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
}

BASE_URL = "https://www.sherdog.com"


def handler(event, context):
    """
    Scrape Sherdog's recent events page and return
    a list of event URLs from the past 14 days.
    """
    print("Scraping recent events from Sherdog...")

    url = f"{BASE_URL}/events/recent"
    response = requests.get(url, headers=HEADERS)

    if response.status_code != 200:
        raise Exception(f"Failed to fetch events page: {response.status_code}")

    soup = BeautifulSoup(response.text, "html.parser")

    # Find the events table
    event_table = soup.find("table", class_="new_table event")
    if not event_table:
        raise Exception("Could not find events table on Sherdog page")

    event_links = []
    cutoff_date = datetime.utcnow() - timedelta(days=14)

    rows = event_table.find_all("tr", itemtype="http://schema.org/Event")
    print(f"Found {len(rows)} total event rows")

    for row in rows:
        # Get event date
        date_tag = row.find("meta", itemprop="startDate")
        if not date_tag:
            continue

        try:
            event_date = datetime.strptime(date_tag["content"][:10], "%Y-%m-%d")
        except ValueError:
            continue

        # Only include events from past 14 days
        if event_date < cutoff_date:
            continue

        # Get event URL from the onclick attribute
        onclick = row.get("onclick", "")
        if not onclick:
            continue

        # Extract path from onclick="document.location='/events/...'"
        path = onclick.split("'")[1]
        event_url = BASE_URL + path

        print(f"  Found event: {event_url} ({event_date.date()})")
        event_links.append(event_url)

    print(f"Found {len(event_links)} events in the past 14 days")

    return {"events": event_links}