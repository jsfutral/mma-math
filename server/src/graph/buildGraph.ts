import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: "us-east-1" });

const GRAPH_BUCKET = process.env.GRAPH_BUCKET || "mma-math-frontend-355986452584";
const GRAPH_KEY = "graph/fight-graph.json";

export interface FightGraph {
  edges: Map<string, string[]>;
  fighters: Map<string, string>;
}

async function streamToString(stream: any): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function buildGraph(): Promise<FightGraph> {
  console.log(`Loading graph from s3://${GRAPH_BUCKET}/${GRAPH_KEY}...`);
  const start = Date.now();

  const response = await s3Client.send(new GetObjectCommand({
    Bucket: GRAPH_BUCKET,
    Key: GRAPH_KEY,
  }));

  const json = await streamToString(response.Body);
  const data = JSON.parse(json);

  // Convert plain objects back to Maps
  const fighters = new Map<string, string>(Object.entries(data.fighters));
  const edges = new Map<string, string[]>(Object.entries(data.edges));

  const elapsed = Date.now() - start;
  console.log(`Graph loaded in ${elapsed}ms — ${fighters.size} fighters, ${edges.size} fighters with wins`);

  return { edges, fighters };
}