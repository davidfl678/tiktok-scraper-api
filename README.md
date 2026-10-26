# TikTok Grabber — Cloudflare Worker

Watermark-free TikTok video downloader. Pure JavaScript, no Python, no build step, free tier.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR-USERNAME/YOUR-REPO)

> Replace `YOUR-USERNAME/YOUR-REPO` above with this repository's path.

## Routes
| Route | What |
|---|---|
| `/` | UI |
| `/api/info?url=…` | metadata + available qualities |
| `/api/video?url=…&q=720` | MP4 stream (1080p/720p/540p) |
| `/api/thumb?u=…` | thumbnail proxy |

## Local dev
```bash
npm install
npm run dev      # http://localhost:8788
npm run deploy
```

## How it works
1. Fetch the TikTok page with a desktop Chrome header set (a mobile/minimal
   header set gets a degraded page with no video data).
2. The response sets `ttwid` / `tt_csrf_token` / `tt_chain_token` — the CDN
   returns 403 without them.
3. Parse `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">` →
   `webapp.video-detail.itemInfo.itemStruct.video.bitrateInfo[].PlayAddr`
   (`PlayAddr` = clean stream; `downloadAddr` is watermarked and never used).
4. Stream the CDN bytes back through the Worker.

Personal use only. Respect TikTok's Terms of Service and copyright.
