import type { APIGatewayProxyHandler } from "aws-lambda";
import { loadFighters } from "../graph/loadFighters";

// Module scope - loaded once on cold start
let fighters: Map<string, string> | null = null;

async function getFighters(): Promise<Map<string, string>> {
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
    const results: { id: string; name: string }[] = [];

    for (const [id, name] of fighterMap) {
      if (name.toLowerCase().includes(query)) {
        results.push({ id, name });
        // Cap at 20 results
        if (results.length >= 20) break;
      }
    }

    // Sort by name length — shorter names are usually more relevant
    results.sort((a, b) => a.name.length - b.name.length);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ results }),
    };

  } catch (error) {
    console.error("Search handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};