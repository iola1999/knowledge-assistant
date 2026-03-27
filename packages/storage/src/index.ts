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

export async function getJson<T>(key: string): Promise<T | null> {
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
  );

  const text = await response.Body?.transformToString();
  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
}
