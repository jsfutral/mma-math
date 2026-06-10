import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';

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
  }
}