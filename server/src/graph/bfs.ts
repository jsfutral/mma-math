import type { FightGraph } from "./buildGraph";

export interface ChainLink {
  winnerId: string;
  winnerName: string;
  loserId: string;
  loserName: string;
}

export interface ChainResult {
  found: boolean;
  chain: ChainLink[];
  message?: string;
}

export function findChain(
  graph: FightGraph,
  fromId: string,
  toId: string
): ChainResult {
  // Edge cases
  if (fromId === toId) {
    return { found: false, chain: [], message: "Fighter A and Fighter B are the same person" };
  }

  if (!graph.fighters.has(fromId)) {
    return { found: false, chain: [], message: `Fighter ${fromId} not found in database` };
  }

  if (!graph.fighters.has(toId)) {
    return { found: false, chain: [], message: `Fighter ${toId} not found in database` };
  }

  // BFS
  // Queue contains fighter IDs to visit
  const queue: string[] = [fromId];

  // Track how we got to each fighter (for path reconstruction)
  const cameFrom = new Map<string, string>();
  cameFrom.set(fromId, "");

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Found the target - reconstruct the path
    if (current === toId) {
      return {
        found: true,
        chain: reconstructChain(graph, cameFrom, fromId, toId),
      };
    }

    // Visit all fighters this fighter has beaten
    const neighbors = graph.edges.get(current) || [];
    for (const neighbor of neighbors) {
      if (!cameFrom.has(neighbor)) {
        cameFrom.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  // Queue exhausted, no path found
  return {
    found: false,
    chain: [],
    message: `No MMA math chain found between these fighters`,
  };
}

function reconstructChain(
  graph: FightGraph,
  cameFrom: Map<string, string>,
  fromId: string,
  toId: string
): ChainLink[] {
  const chain: ChainLink[] = [];
  let current = toId;

  // Walk backwards from target to source
  while (current !== fromId) {
    const previous = cameFrom.get(current)!;
    chain.unshift({
      winnerId: previous,
      winnerName: graph.fighters.get(previous) || "Unknown",
      loserId: current,
      loserName: graph.fighters.get(current) || "Unknown",
    });
    current = previous;
  }

  return chain;
}