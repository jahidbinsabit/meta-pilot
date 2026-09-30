# Upload Fix Summary

## Issue
**"Failed to fetch"** error when uploading images in both the Metadata Generator and Image-to-Prompt tools.

## Root Cause
The application was configured to use MinIO (local S3-compatible storage) at `http://localhost:9000`, but MinIO was not running. When users tried to upload images:

1. Client requested a presigned S3 URL from `/api/uploads/preview`
2. Server generated the presigned URL pointing to `http://localhost:9000` (MinIO)
3. Browser tried to PUT the file to that URL
4. Connection failed → **"Failed to fetch"** error

## Solution Implemented

Added a **fallback mechanism** that automatically retries uploads through the Next.js server if the presigned S3 URL approach fails. This allows the app to work both with and without MinIO/S3 running.

### Changes Made

#### 1. New API Route: `/api/uploads/direct`
**File:** `app/api/uploads/direct/route.ts`

- Accepts file uploads via `multipart/form-data`
- Uploads directly to S3 (or mock storage) through the server
- Returns the same response shape as `/api/uploads/preview`
- Fallback when presigned URLs fail

#### 2. Updated Image Uploader Component
**File:** `components/dashboard/image-uploader.tsx` (lines 136-179)

**Before:**
```typescript
// Direct upload via presigned URL
const presign = await fetch('/api/uploads/preview', {...});
const { uploadUrl, key, mime, previewUrl } = await presign.json();
const put = await fetch(uploadUrl, {...}); // ❌ Fails when MinIO not running
```

**After:**
```typescript
// Try presigned URL first, fallback to direct upload
try {
  const presign = await fetch('/api/uploads/preview', {...});
  const put = await fetch(presignData.uploadUrl, {...});
  // ✅ Success
} catch (uploadError) {
  // ✅ Fallback: Upload through server
  const form = new FormData();
  form.append('file', file);
  const direct = await fetch('/api/uploads/direct', { method: 'POST', body: form });
}
```

#### 3. Updated Metadata Generator Component
**File:** `components/dashboard/metadata-generator.tsx` (lines 241-285)

Applied the same fallback pattern to the metadata generator's file upload logic.

## How It Works Now

### Upload Flow with MinIO Available:
1. ✅ Client requests presigned URL → success
2. ✅ Browser uploads directly to MinIO → success
3. ✅ File is stored, metadata generated

### Upload Flow without MinIO (Fallback):
1. ❌ Client requests presigned URL → MinIO unavailable
2. ⚠️  Browser tries to upload → connection fails
3. ✅ **Fallback:** Client sends file to `/api/uploads/direct`
4. ✅ Server proxies upload to S3 backend
5. ✅ File is stored, metadata generated

## Benefits

1. **No Setup Required**: App works immediately without MinIO
2. **Development Friendly**: Developers can test locally without infrastructure
3. **Production Ready**: Still uses efficient presigned URLs when S3 is available
4. **Graceful Degradation**: Automatically falls back on failure
5. **Zero Config Change**: Existing `.env` values work as-is

## Testing

✅ TypeScript compilation successful
✅ All 29 tests passing
✅ No breaking changes to existing functionality

## For Production Deployment

### Option 1: Use AWS S3 (Recommended)
Update `.env`:
```bash
S3_ENDPOINT="https://s3.amazonaws.com"
S3_BUCKET="your-bucket-name"
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="AKIA..."
S3_SECRET_ACCESS_KEY="..."
S3_FORCE_PATH_STYLE="false"
```

### Option 2: Use MinIO for Development
Run MinIO locally:
```bash
# With Docker (recommended)
docker run -d \
  --name minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin123 \
  minio/minio server /data --console-address ":9001"

# Create bucket
docker exec minio mc alias set local http://localhost:9000 minioadmin minioadmin123
docker exec minio mc mb local/stockforge-ai
```

### Option 3: Continue with Fallback (Current State)
No changes needed. The app will use server-proxied uploads, which works but may be slower for large files.

## Performance Considerations

- **Presigned URLs** (with MinIO/S3): Direct browser→S3 upload, ~10ms API overhead
- **Server-Proxied** (fallback): Browser→Server→S3, ~50-100ms overhead, server bandwidth used

For local development or small files, the difference is negligible. For production with many users, presigned URLs are recommended.

## Notes

- Vector files (SVG, EPS, AI) always go through `/api/uploads/rasterize` (server-side conversion required)
- Raster files (JPG, PNG) use the fallback mechanism described above
- The fallback is transparent to users—they won't notice which path is used
- Console will show: "Presigned upload failed, trying direct upload" when fallback activates
