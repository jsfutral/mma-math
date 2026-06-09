import type { APIGatewayProxyHandler } from "aws-lambda";
import { buildGraph, type FightGraph } from "../graph/buildGraph";
import { findChain } from "../graph/bfs";

// Module scope - loaded once on cold start
let graph: FightGraph | null = null;

async function getGraph(): Promise<FightGraph> {
  if (!graph) {
    console.log("Cold start - building graph...");
    graph = await buildGraph();
  }
  return graph;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const fromId = event.queryStringParameters?.from;
    const toId = event.queryStringParameters?.to;

    if (!fromId || !toId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required parameters: from and to" }),
      };
    }

    // Get or build the graph
    const fightGraph = await getGraph();

    // Find the chain
    const result = findChain(fightGraph, fromId, toId);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error("Chain handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};