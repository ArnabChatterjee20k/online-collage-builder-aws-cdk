import {
  GetObjectCommand,
  GetObjectCommandInput,
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import {
  SendMessageCommand,
  SendMessageCommandInput,
  SQSClient,
} from "@aws-sdk/client-sqs";
import * as crypto from "crypto";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEvent, Handler } from "aws-lambda";
const s3Client = new S3Client();
const S3_ORIGINAL_IMAGE_BUCKET = process.env.originalImageBucketName as string;
const S3_TRANSFORMED_IMAGE_BUCKET = process.env
  .transformedImageBucket as string;
const QUEUE_URL = process.env.queueURL;
const sqsClient = new SQSClient();
export const handler: Handler = async (event: APIGatewayProxyEvent) => {
  try {
    const method = event.httpMethod;
    const uuid = event.pathParameters?.uuid;
    if (!uuid) return { statusCode: 400, message: "Required uuid" };
    if (method === "GET") {
      console.info(`Received uuid ${uuid}`);
      const listParams: GetObjectCommandInput = {
        Bucket: S3_TRANSFORMED_IMAGE_BUCKET,
        Key: uuid,
      };
      const is_file = await fileExists(listParams);
      if (!is_file)
        return getResponse(404, { message: "file does not exists" });
      const getCommand = new GetObjectCommand(listParams);
      const url = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
      return getResponse(200, { url, is_file });
    }

    //for starting the collage process
    if (method === "POST") {
      // api payload
      const body = JSON.parse(event.body as string);
      const layout = body.layout;
      const queueParams: SendMessageCommandInput = {
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify({ layout, uuid }),
      };
      const messageEnque = new SendMessageCommand(queueParams);
      const result = await sqsClient.send(messageEnque);
      // TODO: db save for consistency
      return getResponse(201, { status: "processing", uuid });
    }

    // for getting url to upload
    if (method === "PUT") {
      const uploadParams: PutObjectCommandInput = {
        Bucket: S3_ORIGINAL_IMAGE_BUCKET,
        Key: `${uuid}/${crypto.randomUUID().split("-")[0]}`,
      };
      // TODO: validate the payload
      const putCommand = new PutObjectCommand(uploadParams);
      const url = await getSignedUrl(s3Client, putCommand, { expiresIn: 3600 });
      return getResponse(200, { url });
    }
  } catch (error) {
    console.error("Error handling request:", error);
  }
};

function getResponse(statusCode: number, data: Record<string, any>) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  };
}

async function fileExists(listParams: GetObjectCommandInput) {
  try {
    console.info("Sending HeadObjectCommand with params:", listParams);
    const headCommand = new HeadObjectCommand(listParams);
    const data = await s3Client.send(headCommand);
    console.info("HeadObjectCommand result:", data);
    return true;
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      console.warn("File not found:", listParams.Key);
    } else {
      console.error("Error during file existence check:", error);
    }
    return false;
  }
}
