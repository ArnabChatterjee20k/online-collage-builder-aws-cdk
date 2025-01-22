import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apiGateway from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as path from "path";
export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'InfraQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });

    // s3
    const OriginalImageBucketName = this.node.tryGetContext(
      "originalImageBucketName"
    );
    const TransformedImageBucketName = this.node.tryGetContext(
      "transformedImageBucket"
    );

    let originalImageBucket;
    let transformedImageBucket;

    if (OriginalImageBucketName) {
      originalImageBucket = s3.Bucket.fromBucketName(
        this,
        "for-orignial-images",
        OriginalImageBucketName
      );
    } else {
      originalImageBucket = new s3.Bucket(this, "for-orignial-images", {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        autoDeleteObjects: true,
      });
    }

    if (TransformedImageBucketName) {
      transformedImageBucket = s3.Bucket.fromBucketName(
        this,
        "for-transformed-images",
        TransformedImageBucketName
      );
    } else {
      transformedImageBucket = new s3.Bucket(this, "for-transformed-images", {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        autoDeleteObjects: true,
      });
    }
    // cache policy for transformedImageBucket
    const cachePolicy = new cloudfront.CachePolicy(this, "CollageCache", {
      defaultTtl: cdk.Duration.hours(1),
      minTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.hours(2),
    });
    const distribution = new cloudfront.Distribution(
      this,
      "CollageCloudFrontDistribution",
      {
        defaultBehavior: {
          cachePolicy: cachePolicy,
          // to redirect HTTP to HTTPS
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          origin: new origins.OriginGroup({
            primaryOrigin: origins.S3BucketOrigin.withOriginAccessControl(
              transformedImageBucket
            ),
            // we can use a separate bucket or http request
            fallbackOrigin: origins.S3BucketOrigin.withOriginAccessControl(
              transformedImageBucket
            ),
          }),
        },
      }
    );
    new cdk.CfnOutput(this, "CloudFrontDomainName", {
      value: distribution.domainName,
    });

    // queues
    const queue = new sqs.Queue(this, "Image-Queue", {
      visibilityTimeout: cdk.Duration.seconds(300),
    });
    const queueURL = queue.queueUrl;

    // lambda env
    const lambdaEnv = {
      originalImageBucketName: originalImageBucket.bucketName,
      transformedImageBucket: transformedImageBucket.bucketName,
      queueURL: queueURL,
    };
    // lambda functions and gateway
    const userAPILambdaFunction = new lambda.Function(
      this,
      "APIServiceLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.handler",
        environment: lambdaEnv,
        code: lambda.Code.fromAsset(path.join(__dirname, "../../user-api")),
        logRetention: cdk.aws_logs.RetentionDays.ONE_DAY,
        tracing: lambda.Tracing.ACTIVE, // Enables Lambda X-Ray tracing (helps debug)
      }
    );

    const fileServiceLambdaFunction = new lambda.Function(
      this,
      "FileServiceLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.handler",
        environment: lambdaEnv,
        code: lambda.Code.fromAsset(path.join(__dirname, "../../file-service")),
      }
    );
    // attaching s3 access policy to the lambda
    const iamPolicyStatements = [
      new cdk.aws_iam.PolicyStatement({
        actions: [
          "s3:GetObject", // Read objects
          "s3:ListBucket", // List objects (necessary for navigating the bucket)
          "s3:PutObject", // Write objects
          "s3:DeleteObject", // Delete objects
        ],
        resources: [
          // ARNs for bucket-level operations (needed for ListBucket)
          `arn:aws:s3:::${originalImageBucket.bucketName}`,
          `arn:aws:s3:::${transformedImageBucket.bucketName}`,
          // ARNs for object-level operations
          `arn:aws:s3:::${originalImageBucket.bucketName}/*`,
          `arn:aws:s3:::${transformedImageBucket.bucketName}/*`,
        ],
      }),
    ];
    queue.grantSendMessages(userAPILambdaFunction);
    queue.grantConsumeMessages(fileServiceLambdaFunction);

    const readWritePolicy = new cdk.aws_iam.Policy(this, "read-write-polic", {
      statements: iamPolicyStatements,
    });
    userAPILambdaFunction.role?.attachInlinePolicy(readWritePolicy);
    fileServiceLambdaFunction.role?.attachInlinePolicy(readWritePolicy);

    // setting trigger for queue
    new lambda.EventSourceMapping(this, "QueueTrigger", {
      target: fileServiceLambdaFunction,
      eventSourceArn: queue.queueArn,
      batchSize: 1,
    });

    const api = new apiGateway.RestApi(this, "APIServiceREST", {
      restApiName: "User-API",
    });

    // for adding endpoints
    const users = api.root.addResource("user");
    const userImages = users.addResource("{uuid}");

    // adding endpoints to the lambda
    userImages.addMethod(
      "GET",
      new apiGateway.LambdaIntegration(userAPILambdaFunction)
    ); // Trigger Lambda on GET /images/{uuid}
    userImages.addMethod(
      "POST",
      new apiGateway.LambdaIntegration(userAPILambdaFunction)
    ); // Trigger Lambda on GET /images/{uuid}
    userImages.addMethod(
      "PUT",
      new apiGateway.LambdaIntegration(userAPILambdaFunction)
    ); // Trigger Lambda on GET /images/{uuid}
  }
}
