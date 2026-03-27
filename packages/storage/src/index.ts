import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function getS3Client() {
  if (!client) {
    client = new S3Client({
      endpoint: getRequiredEnv("S3_ENDPOINT"),
      region: process.env.S3_REGION ?? "us-east-1",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: getRequiredEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: getRequiredEnv("S3_SECRET_ACCESS_KEY"),
      },
    });
  }

  return client;
}

export function getBucketName() {
  return getRequiredEnv("S3_BUCKET");
}

export async function createPresignedUploadUrl(input: {
  key: string;
  contentType: string;
}) {
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: input.key,
    ContentType: input.contentType,
  });

  const url = await getSignedUrl(getS3Client(), command, {
    expiresIn: 60 * 15,
  });

  return { url, key: input.key, bucket: getBucketName() };
}

export async function putJson(key: string, value: unknown) {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      ContentType: "application/json",
      Body: JSON.stringify(value),
    }),
  );
}

function isNotFoundError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const maybeMetadata = error as Error & {
    $metadata?: { httpStatusCode?: number };
    name?: string;
  };

  return (
    maybeMetadata.name === "NoSuchKey" ||
    maybeMetadata.$metadata?.httpStatusCode === 404
  );
}

export async function getObjectBytes(key: string): Promise<Uint8Array | null> {
  try {
    const response = await getS3Client().send(
      new GetObjectCommand({
        Bucket: getBucketName(),
        Key: key,
      }),
    );

    const bytes = await response.Body?.transformToByteArray();
    return bytes ?? null;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export async function getJson<T>(key: string): Promise<T | null> {
  const bytes = await getObjectBytes(key);
  if (!bytes) {
    return null;
  }

  const text = new TextDecoder().decode(bytes);
  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
}
