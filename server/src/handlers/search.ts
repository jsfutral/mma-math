import type { APIGatewayProxyHandler } from "aws-lambda";
import { FighterGraph, loadFighters } from "../graph/loadFighters";

// Module scope - loaded once on cold start
let fighters: FighterGraph | null = null;

async function getFighters(): Promise<FighterGraph> {
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

    const graph = await getFighters();

    // Search fighters by name, prioritize by win count, and limit to 20 results
    const results = Object.entries(graph.fighters)
    .filter(([_, name]) => 
        (name as string).toLowerCase().includes(query.toLowerCase())
    )
    .sort(([idA], [idB]) => {
        const winsA = graph.winCounts[idA] ?? 0;
        const winsB = graph.winCounts[idB] ?? 0;
        return winsB - winsA; // descending
    })
    .slice(0, 20)
    .map(([id, name]) => ({ id, name }));

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