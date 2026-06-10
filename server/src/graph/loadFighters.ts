import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: "us-east-1" });

const GRAPH_BUCKET = process.env.GRAPH_BUCKET || "mma-math-frontend-355986452584";
const GRAPH_KEY = "graph/fight-graph.json";

export interface FighterEntry {
  id: string;
  name: string;
}

async function streamToString(stream: any): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function loadFighters(): Promise<Map<string, string>> {
  console.log("Loading fighters from S3...");
  const start = Date.now();

  const response = await s3Client.send(new GetObjectCommand({
    Bucket: GRAPH_BUCKET,
    Key: GRAPH_KEY,
  }));

  const json = await streamToString(response.Body);
  const data = JSON.parse(json);

  const fighters = new Map<string, string>(Object.entries(data.fighters));

  const elapsed = Date.now() - start;
  console.log(`Loaded ${fighters.size} fighters in ${elapsed}ms`);

  return fighters;
}