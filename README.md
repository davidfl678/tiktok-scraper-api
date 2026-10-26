<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/your-username/tiktok-scraper-api">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers" />
  </a>
</p>

<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/en/a/a9/TikTok_logo.svg" width="160" alt="TikTok Logo" />
</p>

<h1 align="center">🎵 TikTok Scraper & Media Downloader API</h1>

<p align="center">
  <strong>High-performance, serverless TikTok video (HD No-Watermark), MP3 audio, and photo slideshow scraper and downloader API designed for Cloudflare Workers.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/Runtime-V8_Worker_Isolate-3178C6?style=for-the-badge&logo=javascript&logoColor=white" alt="V8 Engine" />
  <img src="https://img.shields.io/badge/Quality-HD_No_Watermark-00F2FE?style=for-the-badge" alt="HD No Watermark" />
  <img src="https://img.shields.io/badge/CORS-Universal_(*)-success?style=for-the-badge" alt="CORS" />
  <img src="https://img.shields.io/badge/Dependencies-Zero_npm-black?style=for-the-badge" alt="Zero Dependencies" />
</p>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture & Dual-Engine Failover](#-architecture--dual-engine-failover)
- [Handling TikTok Quirks & Bot Protections](#-handling-tiktok-quirks--bot-protections)
- [API Endpoints Reference](#-api-endpoints-reference)
  - [1. Service Health & Status](#1-service-health--status)
  - [2. Scrape TikTok Media (Main Endpoint)](#2-scrape-tiktok-media-main-endpoint)
  - [3. Direct Download Proxy (Bypasses 403 Forbidden)](#3-direct-download-proxy-bypasses-403-forbidden)
  - [4. Dynamic Media Stream Proxy (Range Seeking)](#4-dynamic-media-stream-proxy-range-seeking)
- [JSON Response Schemas](#-json-response-schemas)
  - [Video Post Schema](#video-post-schema)
  - [Photo Slideshow Post Schema](#photo-slideshow-post-schema)
- [Deployment Guide](#-deployment-guide)
  - [Option 1: One-Click Deploy Button](#option-1-one-click-deploy-button)
  - [Option 2: Cloudflare Dashboard (Web UI)](#option-2-cloudflare-dashboard-web-ui)
  - [Option 3: Wrangler CLI](#option-3-wrangler-cli)
- [Client Integration Examples](#-client-integration-examples)
  - [cURL](#curl)
  - [JavaScript / TypeScript (Browser & Node.js)](#javascript--typescript)
  - [Python](#python)
- [Configuration (`wrangler.toml`)](#-configuration-wranglertoml)
- [License & Disclaimer](#-license--disclaimer)

---

## 🌟 Overview

The **TikTok Scraper & Media Downloader API** is a lightweight, edge-native REST API that scrapes TikTok video posts, photo slideshows, author profiles, and background music without watermarks. Built purely with standard V8 Web APIs (`fetch`, `Request`, `Response`, `URLSearchParams`, `Headers`), it executes with near-zero cold starts (< 5ms) on Cloudflare's global edge network across 300+ locations.

---

## ✨ Key Features

- **No-Watermark HD MP4 Video:** Extracts both standard and HD (`hdplay`) no-watermark MP4 video stream URLs.
- **MP3 Audio Extraction:** Extracts background soundtrack streams with proper artist, title, and cover artwork.
- **Photo / Carousel Posts (Slideshows):** Full multi-image extraction supporting high-resolution image arrays for TikTok slideshows.
- **Bypasses 403 Forbidden Hotlink Blocks:** Built-in `/api/download` proxy injects official `Referer: https://www.tiktok.com/` and mobile `User-Agent` headers to guarantee non-expiring direct downloads.
- **Inline Seeking Support (`/api/stream`):** Implements `Accept-Ranges: bytes` and `206 Partial Content` for HTML5 video players and seek controls.
- **Shortlink Expansion:** Automatically resolves mobile app shortlinks (`vt.tiktok.com`, `vm.tiktok.com`, `tiktok.com/t/...`) to their canonical post URLs.
- **Dual-Engine Redundancy:** Automatic failover between TikWM and TikTok Web SSR manifest extraction to ensure high uptime.
- **Rich Engagement Metrics:** View counts, like counts, comments, shares, downloads, and collection counts.
- **Universal CORS:** Standard CORS headers enabled on all responses for easy client-side frontend and bot integration.
- **Zero Runtime Dependencies:** Requires zero external npm packages.

---

## 🏗 Architecture & Dual-Engine Failover

```text
                                Client Request
                                      │
         ┌────────────────────────────┴────────────────────────────┐
         │                                                         │
    /api/scrape                                           /api/download / /api/stream
  (Extract Metadata)                                    (Dynamic Streaming & Proxy)
         │                                                         │
         ▼                                                         ▼
  Shortlink Resolver:                                     Proxy Stream Engine:
  Expands vt.tiktok.com / vm.tiktok.com                   ├── Injects Referer: https://www.tiktok.com/
         │                                                ├── Injects Modern Mobile User-Agent
         ▼                                                └── Streams bytes directly to client
  Dual-Engine Failover:                                            │
  ├── Engine 1: TikWM API (HD No-Watermark MP4 & MP3)              ▼
  └── Engine 2: TikTok Web SSR Hydration JSON             - Bypasses 403 Forbidden
                                                          - Content-Disposition: attachment
                                                          - Supports 206 Partial Content (Seeking)
```

| Engine | Source | Bot Defense Status | Primary Media Formats |
|:---|:---|:---|:---|
| **Engine 1** | `TikWM` | Unrestricted Edge API | HD No-Watermark MP4, Standard MP4, Watermarked MP4, MP3 Audio, Photo Slideshows |
| **Engine 2** | `TikTok Web SSR` | Direct Canonical Extraction | Standard No-Watermark MP4, MP3 Audio, High-Res Image Array |
| **Proxy Engine** | Cloudflare Edge Worker | Global 300+ Locations | Injects required TikTok CDN headers to bypass 403 Forbidden hotlink blocks |

---

## 🛡 Handling TikTok Quirks & Bot Protections

1. **Shortened Mobile App Links (`vt.tiktok.com`, `vm.tiktok.com`, `/t/`):**
   Mobile app share links are HTTP 301/302 redirects. The worker follows redirects automatically via `resolveRedirects()` before extraction.
2. **CDN 403 Forbidden Errors:**
   TikTok CDN hosts (`*.tiktokcdn.com`, `*.tiktokv.com`) block direct browser downloads with HTTP 403 Forbidden if the `Referer` header is missing. The `/api/download` proxy adds the required headers automatically.
3. **Photo Slideshows:**
   Posts containing images rather than videos are automatically detected (`type: "image"`), providing an array of high-resolution image URLs in `media.images`.

---

## 📡 API Endpoints Reference

Base URL: `https://<your-worker-name>.<your-subdomain>.workers.dev`

---

### 1. Service Health & Status

Returns server status and endpoint schema.

- **Method:** `GET`
- **Path:** `/` or `/api` or `/health`

```bash
curl "https://your-worker.workers.dev/health"
```

```json
{
  "status": "ok",
  "timestamp": "2026-10-26T12:00:00.000Z"
}
```

---

### 2. Scrape TikTok Media (Main Endpoint)

Extracts video/image URLs, author profile details, engagement stats, and audio tracks.

- **Method:** `GET` or `POST`
- **Path:** `/api/scrape` *(Aliases: `/scrape`, `/api/video`, `/api/info`)*

#### Query Parameters / JSON Body:

| Parameter | Type | Required | Description |
|:---|:---|:---|:---|
| `url` / `id` | string | Yes | TikTok video/photo URL, mobile shortlink (`vt.tiktok.com`), or 19-digit video ID |

#### Example Requests:

**GET Request:**
```bash
curl "https://your-worker.workers.dev/api/scrape?url=https://www.tiktok.com/@tiktok/video/7106594312292453675"
```

**Shortlink GET Request:**
```bash
curl "https://your-worker.workers.dev/api/scrape?url=https://vt.tiktok.com/ZS2xyz123/"
```

**POST Request (JSON):**
```bash
curl -X POST "https://your-worker.workers.dev/api/scrape" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@tiktok/video/7106594312292453675"}'
```

---

### 3. Direct Download Proxy (Bypasses 403 Forbidden)

Downloads media as a local file with `Content-Disposition: attachment`. Bypasses TikTok hotlink protection.

- **Method:** `GET`
- **Path:** `/api/download` *(Alias: `/download`)*

#### Query Parameters:

| Parameter | Type | Required | Description |
|:---|:---|:---|:---|
| `url` | string | Yes | Direct media URL returned by `/api/scrape` |
| `filename` | string | No | Custom output filename (Default: `tiktok_media.mp4`) |

#### Examples:

```bash
# Download No-Watermark MP4 Video
curl -L -O "https://your-worker.workers.dev/api/download?url=https%3A%2F%2Fwww.tikwm.com%2Fvideo%2Fmedia%2Fhd%2F...&filename=my_tiktok_video.mp4"

# Download MP3 Background Track
curl -L -O "https://your-worker.workers.dev/api/download?url=https%3A%2F%2Fwww.tikwm.com%2Fvideo%2Fmusic%2F...&filename=my_tiktok_audio.mp3"
```

---

### 4. Dynamic Media Stream Proxy (Range Seeking)

Streams media with `Content-Disposition: inline` and full `Accept-Ranges: bytes` support. Ideal for HTML5 `<video>` or `<audio>` player embedding, mobile apps, and seeking.

- **Method:** `GET`
- **Path:** `/api/stream` *(Alias: `/stream`)*

```html
<!-- HTML5 Video Embedding with Seeking -->
<video controls width="100%" height="auto" src="https://your-worker.workers.dev/api/stream?url=https%3A%2F%2Fwww.tikwm.com%2Fvideo%2Fmedia%2Fhd%2F..."></video>

<!-- HTML5 Audio Embedding -->
<audio controls src="https://your-worker.workers.dev/api/stream?url=https%3A%2F%2Fwww.tikwm.com%2Fvideo%2Fmusic%2F..."></audio>
```

---

## 📋 JSON Response Schemas

### Video Post Schema

```json
{
  "status": "success",
  "code": 200,
  "data": {
    "engine": "tikwm",
    "id": "7106594312292453675",
    "title": "Welcome to TikTok! Check out our new features.",
    "type": "video",
    "duration": 34,
    "region": "US",
    "created_at": "2024-06-07T18:30:00.000Z",
    "author": {
      "id": "107955",
      "unique_id": "tiktok",
      "nickname": "TikTok",
      "avatar": "https://p16-sign-va.tiktokcdn.com/..."
    },
    "stats": {
      "views": 15420000,
      "likes": 842000,
      "comments": 12400,
      "shares": 95400,
      "downloads": 45100,
      "collects": 32100
    },
    "media": {
      "video": {
        "no_watermark": "https://www.tikwm.com/video/media/play/...",
        "no_watermark_hd": "https://www.tikwm.com/video/media/hd/...",
        "watermark": "https://www.tikwm.com/video/media/wm/...",
        "cover": "https://p16-sign-va.tiktokcdn.com/...",
        "dynamic_cover": "https://p16-sign-va.tiktokcdn.com/...",
        "download_url": "https://your-worker.workers.dev/api/download?url=https%3A%2F%2Fwww.tikwm.com%2Fvideo%2Fmedia%2Fhd%2F...&filename=tiktok_7106594312292453675.mp4",
        "stream_url": "https://your-worker.workers.dev/api/stream?url=https%3A%2F%2Fwww.tikwm.com%2Fvideo%2Fmedia%2Fhd%2F..."
      },
      "music": {
        "id": "7106594312292453676",
        "title": "original sound - TikTok",
        "author": "TikTok",
        "url": "https://www.tikwm.com/video/music/...",
        "duration": 34,
        "cover": "https://p16-sign-va.tiktokcdn.com/...",
        "download_url": "https://your-worker.workers.dev/api/download?url=https%3A%2F%2Fwww.tikwm.com%2Fvideo%2Fmusic%2F...&filename=tiktok_music_7106594312292453675.mp3"
      },
      "images": []
    }
  }
}
```

---

### Photo Slideshow Post Schema

When a post contains multiple photos, `type` is `"image"` and `media.images` contains the full array of high-resolution images:

```json
{
  "status": "success",
  "code": 200,
  "data": {
    "engine": "tikwm",
    "id": "7234567890123456789",
    "title": "My vacation photo dump 📸",
    "type": "image",
    "duration": 0,
    "media": {
      "video": null,
      "music": {
        "id": "7234567890123456790",
        "title": "Summer Vibes",
        "author": "Artist",
        "url": "https://www.tikwm.com/video/music/...",
        "download_url": "https://your-worker.workers.dev/api/download?url=..."
      },
      "images": [
        "https://p16-sign-va.tiktokcdn.com/tos-maliva-p-0068/image1.jpeg",
        "https://p16-sign-va.tiktokcdn.com/tos-maliva-p-0068/image2.jpeg",
        "https://p16-sign-va.tiktokcdn.com/tos-maliva-p-0068/image3.jpeg"
      ]
    }
  }
}
```

---

## 🚀 Deployment Guide

### Option 1: One-Click Deploy Button

Click the banner below to fork and deploy directly to your Cloudflare account in seconds:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/your-username/tiktok-scraper-api)

---

### Option 2: Cloudflare Dashboard (Web UI)

1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Compute (Workers) -> Workers & Pages**.
3. Click **Create Application** -> **Create Worker**.
4. Choose a name (e.g., `tiktok-scraper-api`) and click **Deploy**.
5. Once created, click **Edit code** in the top-right corner.
6. Paste the entire contents of [`src/index.js`](./src/index.js) into the code editor.
7. Click **Deploy**. Your API is live worldwide instantly!

---

### Option 3: Wrangler CLI

Ensure you have [Node.js](https://nodejs.org/) installed, then run:

```bash
# Clone the repository
git clone https://github.com/your-username/tiktok-scraper-api.git
cd tiktok-scraper-api

# Install Wrangler globally or locally
npm install -g wrangler

# Authenticate with Cloudflare
wrangler login

# Deploy directly to Cloudflare Workers
wrangler deploy
```

---

## 💻 Client Integration Examples

### cURL

```bash
# Scrape TikTok video
curl -s "https://your-worker.workers.dev/api/scrape?url=https://vt.tiktok.com/ZS2xyz123/" | jq .
```

### JavaScript / TypeScript

```javascript
async function getTikTokData(videoUrl) {
  const endpoint = `https://your-worker.workers.dev/api/scrape?url=${encodeURIComponent(videoUrl)}`;
  const res = await fetch(endpoint);
  const data = await res.json();
  
  if (data.status === "success") {
    console.log("Title:", data.data.title);
    console.log("HD Video Download:", data.data.media.video.download_url);
    console.log("Audio Download:", data.data.media.music.download_url);
  }
}
```

### Python

```python
import requests

def scrape_tiktok(url: str):
    api_url = "https://your-worker.workers.dev/api/scrape"
    response = requests.get(api_url, params={"url": url})
    data = response.json()
    
    if data.get("status") == "success":
        video = data["data"]["media"]["video"]
        print(f"Title: {data['data']['title']}")
        print(f"Direct HD Video: {video['download_url']}")
        return data["data"]
    return None
```

---

## ⚙ Configuration (`wrangler.toml`)

Your `wrangler.toml` file should look like this:

```toml
name = "tiktok-scraper-api"
main = "src/index.js"
compatibility_date = "2024-03-20"
```

---

## 📜 License & Disclaimer

This project is licensed under the MIT License.

*Disclaimer: This project is intended for educational, testing, and personal backup purposes. Please respect TikTok's Terms of Service and content creators' intellectual property rights.*
