import type { APIGatewayProxyHandler } from "aws-lambda";
import { loadFighters, type FighterInfo } from "../graph/loadFighters";

// Module scope - loaded once on cold start
let fighters: Map<string, FighterInfo> | null = null;

async function getFighters(): Promise<Map<string, FighterInfo>> {
  if (!fighters) {
    fighters = await loadFighters();
  }
  return fighters;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const query = event.queryStringParameters?.q?.toLowerCase().trim();

    if (!query || query.length < 2) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Query must be at least 2 characters" }),
      };
    }

    const fighterMap = await getFighters();

    // Search fighters by name
    const results: { id: string; name: string; fightCount: number }[] = [];

    for (const [id, fighterInfo] of fighterMap) {
      if (fighterInfo.name.toLowerCase().includes(query)) {
        results.push({ id, name: fighterInfo.name, fightCount: fighterInfo.fightCount });
      }
    }

    results.sort((a, b) => b.fightCount - a.fightCount || a.name.localeCompare(b.name));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ results: results.slice(0, 20) }),
    };

  } catch (error) {
    console.error("Search handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};