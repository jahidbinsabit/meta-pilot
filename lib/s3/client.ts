import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  uploadFileLocal,
  downloadFileLocal,
  deleteFileLocal,
  listFilesLocal,
  publicUrlLocal,
} from './local-fallback';

// Check if we should use local filesystem fallback
const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === 'true';

const s3 = USE_LOCAL_STORAGE
  ? null
  : new S3Client({
      endpoint: process.env.S3_ENDPOINT || 'https://s3.amazonaws.com',
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    });

export const bucket = process.env.S3_BUCKET || 'stockforge-ai';

export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
) {
  if (USE_LOCAL_STORAGE) {
    return uploadFileLocal(key, body, contentType);
  }
  
  await s3!.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, url: publicUrl(key) };
}

export async function uploadImage(key: string, data: Buffer, mime: string) {
  return uploadFile(key, data, mime);
}

export async function downloadFile(key: string): Promise<Buffer> {
  if (USE_LOCAL_STORAGE) {
    return downloadFileLocal(key);
  }
  
  const out = await s3!.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of out.Body as any) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function deleteFile(key: string) {
  if (USE_LOCAL_STORAGE) {
    return deleteFileLocal(key);
  }
  
  await s3!.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function publicUrl(key: string) {
  if (USE_LOCAL_STORAGE) {
    return publicUrlLocal(key);
  }
  
  const base = process.env.S3_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  return `${base}/api/s3/${encodeURIComponent(key)}`;
}

export async function presignedGet(key: string, expires = 900) {
  if (USE_LOCAL_STORAGE) {
    // For local storage, just return the public URL
    return publicUrlLocal(key);
  }
  
  return getSignedUrl(s3!, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: expires,
  });
}

/**
 * Presigned URL for a direct browser → S3 PUT. Lets the uploader hand the file
 * off without proxying the bytes through this app.
 */
export async function presignedPutUrl(key: string, contentType: string, expires = 900) {
  if (USE_LOCAL_STORAGE) {
    // Local storage doesn't support presigned uploads
    // Return null to signal caller to use direct upload fallback
    return null;
  }
  
  return getSignedUrl(
    s3!,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: expires },
  );
}

export async function listFiles(prefix: string): Promise<Array<{ key: string; lastModified?: Date }>> {
  if (USE_LOCAL_STORAGE) {
    return listFilesLocal(prefix);
  }

  const results: Array<{ key: string; lastModified?: Date }> = [];
  let continuationToken: string | undefined;

  do {
    const out = await s3!.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of out.Contents ?? []) {
      if (obj.Key) {
        results.push({ key: obj.Key, lastModified: obj.LastModified });
      }
    }

    continuationToken = out.NextContinuationToken;
  } while (continuationToken);

  return results;
}

export function makeKey(userId: string, name: string) {
  const slug = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  return `uploads/${userId}/${Date.now()}-${slug}`;
}
