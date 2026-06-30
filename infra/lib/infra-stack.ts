import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -----------------------------------------------
    // DynamoDB Tables
    // -----------------------------------------------

    // Stores fighters (id, name, etc.)
    const fightersTable = new dynamodb.Table(this, 'FightersTable', {
      tableName: 'mma-math-fighters',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Stores fight results (fighterId, opponentId, result, date, etc.)
    const fightsTable = new dynamodb.Table(this, 'FightsTable', {
      tableName: 'mma-math-fights',
      partitionKey: { name: 'winnerId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'loserId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Stores cached chain results
    const cacheTable = new dynamodb.Table(this, 'CacheTable', {
      tableName: 'mma-math-cache',
      partitionKey: { name: 'cacheKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // -----------------------------------------------
    // S3 Bucket (React frontend)
    // -----------------------------------------------

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `mma-math-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // -----------------------------------------------
    // Lambda Functions
    // -----------------------------------------------

    // Chain finder - core BFS algorithm
    const chainLambda = new nodejs.NodejsFunction(this, 'ChainLambda', {
      functionName: 'mma-math-chain',
      entry: '../server/src/handlers/chain.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      projectRoot: '../',
      depsLockFilePath: '../server/package-lock.json',
      environment: {
        FIGHTERS_TABLE: fightersTable.tableName,
        FIGHTS_TABLE: fightsTable.tableName,
        CACHE_TABLE: cacheTable.tableName,
        GRAPH_BUCKET: siteBucket.bucketName,
      },
    });

    // Fighter search - powers the autocomplete
    const searchLambda = new nodejs.NodejsFunction(this, 'SearchLambda', {
      functionName: 'mma-math-search',
      entry: '../server/src/handlers/search.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      projectRoot: '../',
      depsLockFilePath: '../server/package-lock.json',
     environment: {
        FIGHTERS_TABLE: fightersTable.tableName,
        GRAPH_BUCKET: siteBucket.bucketName,
      },
    });

    // Grant Lambda functions access to DynamoDB tables
    fightersTable.grantReadData(chainLambda);
    fightsTable.grantReadData(chainLambda);
    cacheTable.grantReadWriteData(chainLambda);
    fightersTable.grantReadData(searchLambda);

    // Grant chain Lambda read access to S3 graph file
    siteBucket.grantRead(chainLambda);
    siteBucket.grantRead(searchLambda);

    

    // -----------------------------------------------
    // API Gateway
    // -----------------------------------------------

    const api = new apigateway.RestApi(this, 'MmaMathApi', {
      restApiName: 'mma-math-api',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // GET /chain?from=Jon+Jones&to=Nate+Diaz
    const chainResource = api.root.addResource('chain');
    chainResource.addMethod('GET', new apigateway.LambdaIntegration(chainLambda));

    // GET /fighters/search?q=jones
    const fightersResource = api.root.addResource('fighters');
    const searchResource = fightersResource.addResource('search');
    searchResource.addMethod('GET', new apigateway.LambdaIntegration(searchLambda));

    // -----------------------------------------------
    // CloudFront Distribution
    // -----------------------------------------------

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // -----------------------------------------------
    // Weekly Refresh Lambdas
    // -----------------------------------------------

    const refreshScrapeEventsLambda = new lambda.Function(this, 'RefreshScrapeEventsLambda', {
      functionName: 'mma-math-refresh-scrape-events',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../scraper/lambdas/scrape_events', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
    });

    const refreshScrapeEventLambda = new lambda.Function(this, 'RefreshScrapeEventLambda', {
      functionName: 'mma-math-refresh-scrape-event',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../scraper/lambdas/scrape_event', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        FIGHTERS_TABLE: fightersTable.tableName,
        FIGHTS_TABLE: fightsTable.tableName,
      },
    });

    const refreshExportGraphLambda = new lambda.Function(this, 'RefreshExportGraphLambda', {
      functionName: 'mma-math-refresh-export-graph',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../scraper/lambdas/export_graph'),
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      environment: {
        FIGHTERS_TABLE: fightersTable.tableName,
        FIGHTS_TABLE: fightsTable.tableName,
        S3_BUCKET: siteBucket.bucketName,
      },
    });

    const refreshInvalidateCacheLambda = new lambda.Function(this, 'RefreshInvalidateCacheLambda', {
      functionName: 'mma-math-refresh-invalidate-cache',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../scraper/lambdas/invalidate_cache'),
      timeout: cdk.Duration.minutes(2),
      memorySize: 128,
      environment: {
        CLOUDFRONT_DISTRIBUTION_ID: distribution.distributionId,
      },
    });

    // Grant permissions
    fightersTable.grantReadWriteData(refreshScrapeEventLambda);
    fightsTable.grantReadWriteData(refreshScrapeEventLambda);
    fightersTable.grantReadData(refreshExportGraphLambda);
    fightsTable.grantReadData(refreshExportGraphLambda);
    siteBucket.grantReadWrite(refreshExportGraphLambda);

    // -----------------------------------------------
    // Step Functions State Machine
    // -----------------------------------------------

    // Step 1 - Scrape events page
    const scrapeEventsStep = new tasks.LambdaInvoke(this, 'ScrapeEvents', {
      lambdaFunction: refreshScrapeEventsLambda,
      outputPath: '$.Payload',
    });

    // Step 2 - Fan out to one Lambda per event (Map state)
    const scrapeEventStep = new tasks.LambdaInvoke(this, 'ScrapeEvent', {
      lambdaFunction: refreshScrapeEventLambda,
      outputPath: '$.Payload',
    });

    const fanOutStep = new sfn.Map(this, 'FanOutToEvents', {
      itemsPath: '$.events',
      maxConcurrency: 10,
      parameters: {
        'event_url.$': '$$.Map.Item.Value',
      },
    }).itemProcessor(scrapeEventStep);

    // Step 3 - Export graph to S3
    const exportGraphStep = new tasks.LambdaInvoke(this, 'ExportGraph', {
      lambdaFunction: refreshExportGraphLambda,
      outputPath: '$.Payload',
    });

    // Step 4 - Invalidate CloudFront cache
    const invalidateCacheStep = new tasks.LambdaInvoke(this, 'InvalidateCache', {
      lambdaFunction: refreshInvalidateCacheLambda,
      outputPath: '$.Payload',
    });

    // Chain the steps together
    const definition = scrapeEventsStep
      .next(fanOutStep)
      .next(exportGraphStep)
      .next(invalidateCacheStep);

    const stateMachine = new sfn.StateMachine(this, 'WeeklyRefreshStateMachine', {
      stateMachineName: 'mma-math-weekly-refresh',
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.hours(1),
    });

    // Grant CloudFront invalidation permission
    refreshInvalidateCacheLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
      })
    );

    // -----------------------------------------------
    // CloudWatch Scheduled Rule - Every Sunday 6AM UTC
    // -----------------------------------------------

    new events.Rule(this, 'WeeklyRefreshRule', {
      ruleName: 'mma-math-weekly-refresh',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '6',
        weekDay: 'SUN',
      }),
      targets: [new targets.SfnStateMachine(stateMachine)],
    });

    // -----------------------------------------------
    // Outputs
    // -----------------------------------------------

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: distribution.distributionDomainName,
      description: 'CloudFront URL for the frontend',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: siteBucket.bucketName,
      description: 'S3 bucket for frontend deployment',
    });

    // -----------------------------------------------
    // Feedback feature - DynamoDB table, SNS topic, and Lambda function
    // -----------------------------------------------
    const feedbackTable = new dynamodb.Table(this, 'FeedbackTable', {
      tableName: 'feedback',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const feedbackTopic = new sns.Topic(this, 'FeedbackTopic', {
      topicName: 'feedback-notifications',
    });
    feedbackTopic.addSubscription(
      new subscriptions.EmailSubscription('jonathanfutral@gmail.com')
    );

    const feedbackFn = new nodejs.NodejsFunction(this, 'FeedbackLambda', {
      functionName: 'mma-math-feedback',
      entry: '../server/src/handlers/feedback.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      projectRoot: '../',
      depsLockFilePath: '../server/package-lock.json',
      environment: {
        FEEDBACK_TABLE: feedbackTable.tableName,
        TOPIC_ARN: feedbackTopic.topicArn,
      },
    });

    feedbackTable.grantWriteData(feedbackFn);
    feedbackTopic.grantPublish(feedbackFn);

    const feedbackResource = api.root.addResource('feedback');
    feedbackResource.addMethod('POST', new apigateway.LambdaIntegration(feedbackFn));

  }
}