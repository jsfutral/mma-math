import type { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { randomUUID } from "crypto";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const sns = new SNSClient({});

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body = JSON.parse(event.body ?? "{}");
    const message: string | undefined = body.message;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Feedback message is required." }),
      };
    }

    const item = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      message: message.trim(),
      page: body.page ?? null,
      email: body.email ?? null,
      userAgent: event.headers["User-Agent"] ?? null,
    };

    await ddb.send(
      new PutCommand({
        TableName: process.env.FEEDBACK_TABLE,
        Item: item,
      })
    );

    await sns.send(
      new PublishCommand({
        TopicArn: process.env.TOPIC_ARN,
        Subject: "New TI-MM84 feedback received",
        Message: `New feedback:\n\n${item.message}\n\nPage: ${item.page ?? "n/a"}\nEmail: ${item.email ?? "n/a"}\nTime: ${item.createdAt}`,
      })
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error("Feedback handler error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};