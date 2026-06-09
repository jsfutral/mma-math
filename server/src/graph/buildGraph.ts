import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const FIGHTS_TABLE = process.env.FIGHTS_TABLE || "mma-math-fights";
const FIGHTERS_TABLE = process.env.FIGHTERS_TABLE || "mma-math-fighters";

export interface Fighter {
  id: string;
  name: string;
}

export interface FightGraph {
  // adjacency list: winnerId -> array of loserIds
  edges: Map<string, string[]>;
  // fighter lookup: id -> name
  fighters: Map<string, string>;
}

async function scanTable(tableName: string): Promise<any[]> {
  const items: any[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  // DynamoDB scan is paginated - keep scanning until no more pages
  do {
    const response = await docClient.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    if (response.Items) {
      items.push(...response.Items);
    }

    lastEvaluatedKey = response.LastEvaluatedKey;

    console.log(`Scanned ${items.length} items from ${tableName}...`);

  } while (lastEvaluatedKey);

  return items;
}

export async function buildGraph(): Promise<FightGraph> {
  console.log("Building fight graph from DynamoDB...");

  const [fights, fighters] = await Promise.all([
    scanTable(FIGHTS_TABLE),
    scanTable(FIGHTERS_TABLE),
  ]);

  // Build fighter name lookup
  const fighterMap = new Map<string, string>();
  for (const fighter of fighters) {
    fighterMap.set(fighter.id, fighter.name);
  }

  // Build adjacency list
  const edges = new Map<string, string[]>();
  for (const fight of fights) {
    const { winnerId, loserId } = fight;
    if (!winnerId || !loserId) continue;

    if (!edges.has(winnerId)) {
      edges.set(winnerId, []);
    }
    edges.get(winnerId)!.push(loserId);
  }

  console.log(`Graph built — ${fighterMap.size} fighters, ${fights.length} edges`);

  return { edges, fighters: fighterMap };
}