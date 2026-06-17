import boto3
import requests
import re
from bs4 import BeautifulSoup

dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
fighters_table = dynamodb.Table("mma-math-fighters")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
}

def get_fighter_name(fighter_id):
    """Try to fetch fighter name from Sherdog using just the ID."""
    # We don't have the slug so try a redirect URL
    url = f"https://www.sherdog.com/fighter/{fighter_id}"
    response = requests.get(url, headers=HEADERS, allow_redirects=True)
    if response.status_code != 200:
        return None
    
    soup = BeautifulSoup(response.text, "html.parser")
    name_tag = soup.find("h1", itemprop="name")
    if name_tag:
        span = name_tag.find("span", class_="fn")
        return span.text.strip() if span else None
    return None

def repair_empty_names():
    """Scan fighters table and fix any records with empty names."""
    print("Scanning for fighters with empty names...")
    
    broken = []
    last_evaluated_key = None

    while True:
        scan_kwargs = {
            "FilterExpression": "attribute_not_exists(#n) OR #n = :empty",
            "ExpressionAttributeNames": {"#n": "name"},
            "ExpressionAttributeValues": {":empty": ""}
        }
        
        if last_evaluated_key:
            scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            
        response = fighters_table.scan(**scan_kwargs)
        broken.extend(response.get("Items", []))
        
        last_evaluated_key = response.get("LastEvaluatedKey")
        print(f"  Scanned so far — found {len(broken)} broken fighters...")
        
        if not last_evaluated_key:
            break

    print(f"Found {len(broken)} fighters with missing/empty names")
    
    fixed = 0
    failed = 0
    
    for fighter in broken:
        fighter_id = fighter["id"]
        name = get_fighter_name(fighter_id)
        
        if name:
            fighters_table.update_item(
                Key={"id": fighter_id},
                UpdateExpression="SET #n = :name, name_lower = :lower",
                ExpressionAttributeNames={"#n": "name"},
                ExpressionAttributeValues={
                    ":name": name,
                    ":lower": name.lower()
                }
            )
            print(f"  Fixed: {fighter_id} → {name}")
            fixed += 1
        else:
            print(f"  Failed: {fighter_id} — could not find on Sherdog")
            failed += 1
    
    print(f"\nRepair complete — fixed: {fixed}, failed: {failed}")

if __name__ == "__main__":
    repair_empty_names()