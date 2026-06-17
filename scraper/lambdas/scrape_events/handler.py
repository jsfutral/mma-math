import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
}

BASE_URL = "https://www.sherdog.com"


def scrape_events_page(url, cutoff_date, tab_id=None):
    """Scrape a single events page and return event URLs within the cutoff date."""
    print(f"Scraping events page: {url}")

    response = requests.get(url, headers=HEADERS)
    if response.status_code != 200:
        print(f"Failed to fetch {url} — status {response.status_code}")
        return [], False

    soup = BeautifulSoup(response.text, "html.parser")

    # Scope to specific tab if provided
    if tab_id:
        container = soup.find("div", id=tab_id)
        if not container:
            print(f"Tab {tab_id} not found on {url}")
            return [], False
    else:
        container = soup

    event_table = container.find("table", class_="new_table event")
    if not event_table:
        print(f"No event table found on {url}")
        return [], False

    event_links = []
    hit_cutoff = False
    rows = event_table.find_all("tr", itemtype="http://schema.org/Event")
    print(f"  Found {len(rows)} total event rows")

    for row in rows:
        date_tag = row.find("meta", itemprop="startDate")
        if not date_tag:
            continue

        try:
            event_date = datetime.strptime(date_tag["content"][:10], "%Y-%m-%d")
        except ValueError:
            continue

        # Stop processing as soon as we hit an event outside the cutoff
        if event_date < cutoff_date:
            print(f"  Hit cutoff at {event_date.date()}, stopping")
            hit_cutoff = True
            break

        onclick = row.get("onclick", "")
        if not onclick:
            continue

        path = onclick.split("'")[1]
        event_url = BASE_URL + path
        print(f"  Found event: {event_url} ({event_date.date()})")
        event_links.append(event_url)

    more_link = container.find("a", href=lambda h: h and "events/recent/" in h and "-page" in h)
    has_more = more_link is not None

    return event_links, has_more, hit_cutoff


def handler(event, context):
    print("Scraping recent events from Sherdog...")

    cutoff_date = datetime.utcnow() - timedelta(days=14)
    all_event_links = []

    page = 1
    while True:
        if page == 1:
            url = f"{BASE_URL}/events"
            links, has_more, hit_cutoff = scrape_events_page(
                url, cutoff_date, tab_id="recentfights_tab"
            )
        else:
            url = f"{BASE_URL}/events/recent/{page}-page"
            links, has_more, hit_cutoff = scrape_events_page(url, cutoff_date)

        all_event_links.extend(links)

        # Stop if we hit an event older than the cutoff
        if hit_cutoff:
            print(f"Reached cutoff date, stopping pagination")
            break

        # Stop if no more pages
        if not has_more:
            break

        page += 1
        print(f"Moving to page {page}...")

    unique_links = list(set(all_event_links))
    print(f"Found {len(unique_links)} unique events in the past 14 days")

    return {"events": unique_links}