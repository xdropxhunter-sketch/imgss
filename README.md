# TempShare

Drag-and-drop file sharing with **5-minute self-destruct links**. Built with Next.js + MongoDB. Supports local storage (default) or AWS S3.

## Features
- Drag & drop upload (PNG, JPG, JPEG, WEBP, MP4)
- 50MB max upload
- Random short IDs for share links
- Files auto-delete after 5 minutes (background job)
- Inline image/video preview
- Copy-link button with countdown
- No login required
- Mobile-friendly UI
- Pluggable storage: `local` or `s3`

## Tech
- Next.js 14 (App Router, API Routes)
- Tailwind CSS + shadcn/ui
- MongoDB (metadata)
- AWS SDK v3 for S3 (optional)

## Run
```bash
yarn install
yarn dev
```
Open http://localhost:3000

## Environment
Copy `.env.example` to `.env` and set values. Default backend is `local`.

## Switching to AWS S3
1. Create an S3 bucket
2. Add CORS to allow GETs from your domain (presigned URLs are used for serving)
3. Create IAM user with: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on the bucket
4. Set `.env`:
   ```
   STORAGE_BACKEND=s3
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=...
   AWS_BUCKET_NAME=...
   ```
5. Restart the app

## AWS Deployment Steps (Production)
1. **S3 bucket**: Create private bucket, enable default encryption (SSE-S3), block public access.
2. **Lifecycle rule (cost saver)**: Add a 1-day lifecycle rule to delete all objects — protects against any leftover files if the app fails to clean up.
3. **IAM user/role**: Least-privilege policy with `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` scoped to `arn:aws:s3:::YOUR_BUCKET/*`.
4. **CORS** on bucket (for direct browser access if you ever switch to direct uploads):
   ```json
   [{"AllowedMethods":["GET"],"AllowedOrigins":["https://your-domain"],"AllowedHeaders":["*"]}]
   ```
5. **App hosting**: Deploy Next.js (Vercel / AWS Amplify / ECS Fargate / Lambda via OpenNext). Set env vars from `.env.example`.
6. **MongoDB**: Use MongoDB Atlas (free tier).
7. **Cost notes**:
   - Bucket lifecycle = automatic deletion safety net.
   - Use presigned URLs (already implemented) so files never proxy through your server → minimal egress on your compute.
   - Files are small and short-lived; expected S3 cost is near-zero.

## Project Structure
```
app/
  api/[[...path]]/route.js   # All API routes (upload, info, file)
  page.js                    # Upload page
  share/[id]/page.js         # Share/view page
  layout.js                  # Root layout
lib/
  mongodb.js                 # Mongo connection
  storage.js                 # Storage abstraction (local + S3)
  cleanup.js                 # Expiry background job
```

## Storage Design
MongoDB collection `files`:
| field | type | description |
|-------|------|-------------|
| id | string (uuid) | short share id, in URL |
| originalName | string | uploaded filename |
| mimeType | string | content-type |
| size | number | bytes |
| storageKey | string | path or S3 key |
| backend | string | 'local' or 's3' |
| createdAt | Date | when uploaded |
| expiresAt | Date | createdAt + 5 min |
| deleted | bool | true after cleanup |

## API
- `POST /api/upload` — multipart form with `file`. Returns `{ id, shareUrl, expiresAt, ... }`.
- `GET /api/info/:id` — metadata for share page.
- `GET /api/file/:id` — serves the file (or 302-redirects to presigned S3 URL).

## Cleanup
A background interval (every 30s) deletes expired files from storage and marks them deleted in Mongo. Also runs opportunistically on each request.
