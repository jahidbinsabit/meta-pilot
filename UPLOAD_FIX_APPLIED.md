# Upload Issue Fix - Local Storage Fallback

## Problem
The application was failing with `ECONNREFUSED` errors when trying to upload images because:
1. MinIO (local S3 storage) was not running on port 9000
2. Network issues prevented pulling MinIO Docker images
3. Google Fonts API calls were also failing due to network connectivity

## Solution Applied

### 1. Local Filesystem Storage Fallback
Created a local filesystem-based storage system that doesn't require MinIO or S3.

**Files Created:**
- `lib/s3/local-fallback.ts` - Local filesystem storage implementation

**Files Modified:**
- `lib/s3/client.ts` - Added conditional logic to use local storage when `USE_LOCAL_STORAGE=true`
- `.env` - Added `USE_LOCAL_STORAGE="true"` flag
- `app/layout.tsx` - Improved Google Fonts configuration with fallback

### 2. How It Works

When `USE_LOCAL_STORAGE=true` in `.env`:
- Files are stored in `public/uploads/` directory
- Files are served directly via Next.js static file serving
- No S3/MinIO connection required
- Presigned URL requests automatically trigger the fallback to `/api/uploads/direct`

**Storage Flow:**
1. Client attempts to get presigned URL from `/api/uploads/preview`
2. Server throws error (presigned uploads not supported with local storage)
3. Client automatically falls back to `/api/uploads/direct`
4. Server receives file and stores it in `public/uploads/`
5. Server returns public URL like `http://localhost:3000/uploads/filename.jpg`

### 3. Directory Structure
```
public/
└── uploads/          # Created, chmod 755
    └── [uploaded files stored here]
```

### 4. Environment Configuration

Added to `.env`:
```bash
USE_LOCAL_STORAGE="true"
```

When you want to use MinIO/S3 again, just set:
```bash
USE_LOCAL_STORAGE="false"
```

### 5. Google Fonts Fix
Updated font configuration to handle network failures gracefully with fallback fonts.

## Testing the Fix

1. **Stop the current dev server** (Ctrl+C in your terminal)

2. **Restart the development server:**
   ```bash
   npm run dev
   ```

3. **Test file upload:**
   - Navigate to http://localhost:3000/dashboard/generator
   - Try uploading an image
   - Should work without any ECONNREFUSED errors

## Expected Behavior

✅ **Before (FAILING):**
- Upload attempt → ECONNREFUSED error
- No file stored
- Error in console

✅ **After (WORKING):**
- Upload attempt → File stored in `public/uploads/`
- File accessible at `http://localhost:3000/uploads/[filename]`
- No connection errors

## Future: Switching Back to MinIO

When network issues are resolved and you want to use MinIO:

1. **Pull MinIO image:**
   ```bash
   sudo docker pull quay.io/minio/minio:latest
   ```

2. **Update docker-compose.yml** (already fixed):
   ```yaml
   minio:
     image: quay.io/minio/minio:latest  # Updated from minio/minio:latest
   ```

3. **Start MinIO:**
   ```bash
   sudo docker compose up -d minio
   ```

4. **Create bucket:**
   ```bash
   ./setup-minio.sh
   # Or manually at http://localhost:9001
   ```

5. **Update .env:**
   ```bash
   USE_LOCAL_STORAGE="false"
   ```

6. **Restart dev server**

## Notes

- Local storage is suitable for development and testing
- For production, use proper S3-compatible storage (MinIO, AWS S3, DigitalOcean Spaces, etc.)
- Uploaded files in `public/uploads/` are served as static files by Next.js
- The fallback mechanism was already in the codebase; we just made it work without MinIO

## Files Changed Summary

1. **Created:** `lib/s3/local-fallback.ts` - Local filesystem storage
2. **Modified:** `lib/s3/client.ts` - Added USE_LOCAL_STORAGE logic
3. **Modified:** `.env` - Added USE_LOCAL_STORAGE flag
4. **Modified:** `app/layout.tsx` - Improved font loading
5. **Modified:** `docker-compose.yml` - Fixed MinIO image reference
6. **Created:** `public/uploads/` - Upload directory

## Status: ✅ READY TO TEST

Restart your dev server with `npm run dev` and try uploading an image!
