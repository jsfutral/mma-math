import requests
from bs4 import BeautifulSoup
import re
import time

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
        opponent_name = opponent_tag.text.strip()
        opponent_id = get_sherdog_id(opponent_tag["href"])
        opponent_slug = opponent_tag["href"].split("/fighter/")[1].rsplit("-", 1)[0]
        
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


# --- Quick test ---
if __name__ == "__main__":
    result = scrape_fighter("76836", "Islam-Makhachev")
    
    if result:
        print(f"\nFighter: {result['name']} (ID: {result['id']})")
        print(f"Total fights scraped: {len(result['fights'])}")
        print("\nFight history:")
        for fight in result["fights"]:
            print(f"  {fight['result'].upper()} vs {fight['opponent_name']} | {fight['event_name']} | {fight['event_date']} | {fight['method']}")