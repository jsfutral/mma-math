import requests
from bs4 import BeautifulSoup
import re
import time
import json
import os
import sys
from collections import deque
from ingest import ingest_fighter


CHECKPOINT_FILE = "checkpoint.json"
CHECKPOINT_INTERVAL = 100  # Save state every 100 fighters

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

BASE_URL = "https://www.sherdog.com"


def get_sherdog_id(url_path):
    """Extract the numeric Sherdog ID from a fighter or event URL path."""
    match = re.search(r'-(\d+)$', url_path)
    return match.group(1) if match else None


def scrape_fighter(fighter_id, fighter_slug):
    """
    Scrape a single fighter's profile and fight history from Sherdog.
    
    Args:
        fighter_id: Sherdog numeric ID (e.g. "76836")
        fighter_slug: Sherdog URL slug (e.g. "Islam-Makhachev")
    
    Returns:
        dict with fighter profile and list of fights
    """
    url = f"{BASE_URL}/fighter/{fighter_slug}-{fighter_id}"
    
    print(f"Scraping: {url}")
    
    response = requests.get(url, headers=HEADERS)
    
    if response.status_code != 200:
        print(f"Failed to fetch {url} — status {response.status_code}")
        return None
    
    soup = BeautifulSoup(response.text, "html.parser")
    
    # --- Fighter name ---
    name_tag = soup.find("h1", itemprop="name")
    name = name_tag.find("span", class_="fn").text.strip() if name_tag else "Unknown"
    
    # --- Fight history ---
    fights = []
    
    # Find the fight history table
    fight_table = soup.find("table", class_="new_table fighter")
    
    if not fight_table:
        print(f"No fight table found for fighter {fighter_id}")
        return {"id": fighter_id, "name": name, "fights": fights}
    
    rows = fight_table.find_all("tr")
    
    for row in rows:
        cells = row.find_all("td")
        
        # Skip rows that dont have exactly 6 cells (headers, empty rows etc)
        if len(cells) != 6:
            continue
        
        # Result
        result_span = cells[0].find("span", class_="final_result")
        if not result_span:
            continue
        result = result_span.text.strip().lower()  # "win" or "loss"
        
        # Opponent
        opponent_tag = cells[1].find("a")
        if not opponent_tag:
            continue

        href = opponent_tag.get("href", "")

        # Skip if this isn't a fighter link
        if "/fighter/" not in href:
            continue

        opponent_name = opponent_tag.text.strip()
        opponent_id = get_sherdog_id(href)

        # Guard against unexpected URL formats
        try:
            opponent_slug = opponent_tag["href"].split("/fighter/")[1].rsplit("-", 1)[0]
        except IndexError:
            print(f"Unexpected href format: {href}, skipping")
            continue
        
        # Event and date
        event_tag = cells[2].find("span", itemprop="award")
        event_name = event_tag.text.strip() if event_tag else "Unknown"
        date_tag = cells[2].find("span", class_="sub_line")
        event_date = date_tag.text.strip() if date_tag else "Unknown"
        
        # Method
        method_tag = cells[3].find("b")
        method = method_tag.text.strip() if method_tag else "Unknown"
        
        # Round and time
        fight_round = cells[4].text.strip()
        fight_time = cells[5].text.strip()
        
        fights.append({
            "result": result,
            "opponent_id": opponent_id,
            "opponent_name": opponent_name,
            "opponent_slug": opponent_slug,
            "event_name": event_name,
            "event_date": event_date,
            "method": method,
            "round": fight_round,
            "time": fight_time,
        })
    
    return {
        "id": fighter_id,
        "name": name,
        "fights": fights
    }


def save_checkpoint(visited, queue, all_fighters):
    """Save crawler state to disk so we can resume if interrupted."""
    state = {
        "visited": list(visited),
        "queue": list(queue),
        "all_fighters": all_fighters
    }
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(state, f)
    print(f"Checkpoint saved — {len(visited)} fighters scraped, {len(queue)} in queue")


def load_checkpoint():
    """Load crawler state from disk if a checkpoint exists."""
    if not os.path.exists(CHECKPOINT_FILE):
        return None
    with open(CHECKPOINT_FILE, "r") as f:
        state = json.load(f)
    print(f"Resuming from checkpoint — {len(state['visited'])} fighters already scraped, {len(state['queue'])} in queue")
    return state


def crawl_fighters(seed_id, seed_slug, max_fighters=None):
    """
    BFS crawl starting from a seed fighter, following opponent links
    to discover and scrape the entire fight graph.
    Saves checkpoints periodically so crawl can be resumed if interrupted.
    
    Args:
        seed_id: Sherdog ID of the starting fighter
        seed_slug: Sherdog URL slug of the starting fighter
        max_fighters: optional cap for testing (None = crawl everything)
    
    Returns:
        dict of all scraped fighters keyed by Sherdog ID
    """
    # Try to resume from checkpoint first
    checkpoint = load_checkpoint()
    
    if checkpoint:
        visited = set(checkpoint["visited"])
        queue = deque(checkpoint["queue"])
        all_fighters = checkpoint["all_fighters"]
    else:
        visited = set()
        queue = deque()
        queue.append((seed_id, seed_slug))
        all_fighters = {}
    
    # Track fighters scraped this session only
    newly_scraped = 0


    while queue:
        # Stop early if we hit the cap (useful for testing)
        # Cap applies to this session only, not total visited
        if max_fighters and newly_scraped >= max_fighters:
            print(f"\nReached max_fighters cap of {max_fighters} for this session, stopping.")
            break
        
        fighter_id, fighter_slug = queue.popleft()
        
        # Skip if already scraped
        if fighter_id in visited:
            continue
        
        visited.add(fighter_id)
        
        # Scrape this fighter
        fighter_data = scrape_fighter(fighter_id, fighter_slug)
        
        if not fighter_data:
            continue

        all_fighters[fighter_id] = fighter_data
        ingest_fighter(fighter_data)
        
        newly_scraped += 1

        print(f"Session: {newly_scraped} | Total: {len(visited)} | Queue: {len(queue)}")
        
        # Add all opponents we haven't seen yet to the queue
        for fight in fighter_data["fights"]:
            opponent_id = fight["opponent_id"]
            opponent_slug = fight["opponent_slug"]
            
            if opponent_id and opponent_id not in visited:
                queue.append((opponent_id, opponent_slug))
        
        # Save checkpoint every N fighters
        if len(visited) % CHECKPOINT_INTERVAL == 0:
            save_checkpoint(visited, queue, all_fighters)
        
        # Be polite to Sherdog's servers
        #time.sleep(.2) # removing for now due to natural delays from data parsing
    
    # Save final checkpoint when done
    save_checkpoint(visited, queue, all_fighters)
    
    return all_fighters


if __name__ == "__main__":

    session_max = int(sys.argv[1]) if len(sys.argv) > 1 else 10  # Default to 10 fighters 

    # Test crawl with a small cap first
    print("Starting crawl from Islam Makhachev...")
    fighters = crawl_fighters("76836", "Islam-Makhachev", max_fighters=session_max)
    
    print(f"\nCrawl complete! Total fighters scraped: {len(fighters)}")
    for fid, fdata in list(fighters.items())[-session_max:]:
        print(f"  {fdata['name']} (ID: {fid}) — {len(fdata['fights'])} fights")