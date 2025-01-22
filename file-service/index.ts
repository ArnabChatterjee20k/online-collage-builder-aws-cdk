import {
  GetObjectCommand,
  GetObjectCommandInput,
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import { DeleteMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Handler, SQSEvent } from "aws-lambda";
import sharp from "sharp";
// const s3Client = new S3Client();
const S3_ORIGINAL_IMAGE_BUCKET = process.env.originalImageBucketName as string;
const S3_TRANSFORMED_IMAGE_BUCKET = process.env
  .transformedImageBucket as string;
const QUEUE_URL = process.env.queueURL;
const s3Client = new S3Client({
  // required for local dev
  forcePathStyle: true,
});

const sqsClient = new SQSClient();
interface Message {
  layout: "horizontal" | "vertical";
  uuid: string;
}

export const handler: Handler = async (event: SQSEvent) => {
  try {
    const { layout, uuid } = JSON.parse(event.Records[0].body) as Message;
    const receiptHandle = event.Records[0].receiptHandle;
    const buffers = await getImageBuffers(uuid);
    if (buffers.length === 0) {
      console.warn({
        message: "No images found",
        uuid: uuid,
        status: "warning",
      });
    }
    const collage = await createCollage(layout, buffers);
    console.info(`New collage of size ${collage.length}`)
    const newImage = await uploadImage(uuid, collage);
    if (!newImage) {
      console.warn({ message: "Not uploaded", uuid: uuid, status: "warning" });
    }
    // if (newImage) {
    //   const command = new DeleteMessageCommand({
    //     QueueUrl: QUEUE_URL,
    //     ReceiptHandle: receiptHandle,
    //   });
    //   await sqsClient.send(command);
    // }
  } catch (error) {
    console.error("Error handling request:", error);
  }
};

async function getImageBuffers(prefix: string) {
  console.log("Fetching objects with prefix:", prefix);
  console.log({ S3_ORIGINAL_IMAGE_BUCKET });
  const imagesByUUIDParam: ListObjectsV2CommandInput = {
    Bucket: S3_ORIGINAL_IMAGE_BUCKET,
    Prefix: `${prefix}`,
  };

  try {
    const imagesByUUIDCommand = new ListObjectsV2Command(imagesByUUIDParam);
    const imagesByUUID = await s3Client.send(imagesByUUIDCommand);

    console.info("ListObjectsV2 response:", imagesByUUID);

    if (!imagesByUUID?.Contents || imagesByUUID.Contents.length === 0) {
      console.warn("No images found for prefix:", prefix);
      return [];
    }

    const imagePromises = imagesByUUID.Contents.map(async (file) => {
      if (file?.Key) {
        console.log("Fetching image for Key:", file.Key);
        return getImage(prefix, file.Key);
      }
    });

    const images = (await Promise.all(imagePromises)).filter(
      (image) => image !== undefined
    );

    console.log("Fetched images count:", images.length);

    const imageBuffers = (
      await Promise.all(images.map((i) => i?.transformToByteArray()))
    ).map((i) => (i as Uint8Array<ArrayBufferLike>).buffer);

    return imageBuffers;
  } catch (error) {
    console.error("Error fetching objects:", error);
    return [];
  }
}

async function uploadImage(key: string, body: Buffer) {
  console.log({ key, S3_TRANSFORMED_IMAGE_BUCKET });
  const listParams: PutObjectCommandInput = {
    Bucket: S3_TRANSFORMED_IMAGE_BUCKET,
    Key: key.endsWith(".png") ? key : `${key}.png`, // Ensure key has .png extension
    Body: body,
    ContentType: "image/png", // Set the correct content type
    Metadata: {
      "Content-Type": "image/png",
      transformed: "true",
    },
  };
  const putObject = new PutObjectCommand(listParams);
  const res = await s3Client.send(putObject);
  return res.$metadata.httpStatusCode === 200;
}

async function getImage(prefix: string, id: string) {
  console.log(`Fetching object with Key: ${id}`);

  const listParam: GetObjectCommandInput = {
    Bucket: S3_ORIGINAL_IMAGE_BUCKET,
    Key: id, // Use id directly if prefix is part of the key
  };

  try {
    const command = new GetObjectCommand(listParam);
    const res = await s3Client.send(command);

    if (!res.Body) {
      console.warn("No body returned for object:", id);
      return null;
    }

    return res.Body; // This returns a ReadableStream
  } catch (error) {
    console.error("Error fetching image:", error);
    return null;
  }
}

async function createCollage(
  orientation: Message["layout"],
  images: ArrayBufferLike[]
) {
  // First, get dimensions of all images
  const imageDimensions = await Promise.all(
    images.map((buffer) => sharp(buffer).metadata())
  );

  // Log the dimensions of the images
  imageDimensions.forEach((metadata, index) => {
    console.log(
      `Image ${index + 1} - Width: ${metadata.width}, Height: ${
        metadata.height
      }`
    );
  });

  // Calculate target dimensions for each image and overall collage
  const targetSize = 500; // Base size for each image
  const processedImages = await Promise.all(
    images.map(async (buffer, index) => {
      const resizedBuffer = await sharp(buffer)
        .resize(targetSize, targetSize, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255 },
        })
        .toBuffer();
      return resizedBuffer;
    })
  );

  // Calculate collage dimensions
  const collageWidth =
    orientation === "horizontal" ? targetSize * images.length : targetSize;
  const collageHeight =
    orientation === "horizontal" ? targetSize : targetSize * images.length;

  // Create composite array
  const compositeArray = processedImages.map((buffer, index) => ({
    input: buffer,
    top: orientation === "horizontal" ? 0 : index * targetSize,
    left: orientation === "horizontal" ? index * targetSize : 0,
  }));

  // Create the final collage as PNG
  const finalImageBuffer = await sharp({
    create: {
      width: collageWidth,
      height: collageHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(compositeArray as sharp.OverlayOptions[])
    .png() // Explicitly convert to PNG format
    .toBuffer();

  // Log final image dimensions for verification
  const finalMetadata = await sharp(finalImageBuffer).metadata();
  console.log(
    `Final Collage - Width: ${finalMetadata.width}, Height: ${finalMetadata.height}`
  );

  return finalImageBuffer;
}
