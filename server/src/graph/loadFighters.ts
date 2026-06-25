import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: "us-east-1" });

const GRAPH_BUCKET = process.env.GRAPH_BUCKET || "mma-math-frontend-355986452584";
const GRAPH_KEY = "graph/fight-graph.json";

export interface FighterInfo {
  name: string;
  fightCount: number;
}

async function streamToString(stream: any): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function loadFighters(): Promise<Map<string, FighterInfo>> {
  console.log("Loading fighters from S3...");
  const start = Date.now();

  const response = await s3Client.send(new GetObjectCommand({
    Bucket: GRAPH_BUCKET,
    Key: GRAPH_KEY,
  }));

  const json = await streamToString(response.Body);
  const data = JSON.parse(json);

  const fightCounts = new Map<string, number>();
  for (const [winnerId, losers] of Object.entries(data.edges || {})) {
    const loserIds = Array.isArray(losers) ? losers : [];
    fightCounts.set(winnerId, (fightCounts.get(winnerId) ?? 0) + loserIds.length);
    for (const loserId of loserIds) {
      fightCounts.set(loserId, (fightCounts.get(loserId) ?? 0) + 1);
    }
  }

  const fighters = new Map<string, FighterInfo>(
    Object.entries(data.fighters).map(([id, name]) => [
      id,
      {
        name: String(name),
        fightCount: fightCounts.get(id) ?? 0,
      },
    ])
  );

  const elapsed = Date.now() - start;
  console.log(`Loaded ${fighters.size} fighters in ${elapsed}ms`);

  return fighters;
}