const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Disposition"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}

function extractUrl(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (/^\d{15,22}$/.test(trimmed)) {
    return `https://www.tiktok.com/@i/video/${trimmed}`;
  }
  const match = trimmed.match(/https?:\/\/(?:[a-zA-Z0-9_-]+\.)?tiktok\.com\/[^\s]+/i);
  return match ? match[0] : null;
}

async function resolveRedirects(targetUrl) {
  let current = targetUrl;
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  
  if (/vt\.tiktok\.com|vm\.tiktok\.com|\/t\//i.test(current)) {
    try {
      for (let i = 0; i < 5; i++) {
        const res = await fetch(current, {
          method: "GET",
          redirect: "manual",
          headers: {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
          }
        });
        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const loc = res.headers.get("location");
          if (loc) {
            current = new URL(loc, current).toString();
            if (/\/video\/|\/photo\//.test(current)) break;
            continue;
          }
        }
        if (res.url && res.url !== current) {
          current = res.url;
        }
        break;
      }
    } catch {
      return targetUrl;
    }
  }
  return current;
}

async function scrapeTikwm(videoUrl, origin) {
  const res = await fetch("https://www.tikwm.com/api/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    },
    body: new URLSearchParams({ url: videoUrl, hd: "1" }).toString()
  });

  if (!res.ok) throw new Error(`TikWM returned status ${res.status}`);
  const payload = await res.json();
  if (payload.code !== 0 || !payload.data) {
    throw new Error(payload.msg || "TikWM extraction failed");
  }

  const d = payload.data;
  const base = "https://www.tikwm.com";
  const abs = (p) => (!p ? null : p.startsWith("http") ? p : base + p);
  const isImage = Array.isArray(d.images) && d.images.length > 0;

  const playUrl = abs(d.play);
  const hdPlayUrl = abs(d.hdplay);
  const wmPlayUrl = abs(d.wmplay);
  const musicUrl = abs(d.music) || d.music_info?.play || null;

  return {
    engine: "tikwm",
    id: String(d.id || ""),
    title: d.title || "",
    type: isImage ? "image" : "video",
    duration: d.duration || 0,
    region: d.region || "",
    created_at: d.create_time ? new Date(d.create_time * 1000).toISOString() : null,
    author: {
      id: String(d.author?.id || ""),
      unique_id: d.author?.unique_id || "",
      nickname: d.author?.nickname || "",
      avatar: abs(d.author?.avatar)
    },
    stats: {
      views: Number(d.play_count || 0),
      likes: Number(d.digg_count || 0),
      comments: Number(d.comment_count || 0),
      shares: Number(d.share_count || 0),
      downloads: Number(d.download_count || 0),
      collects: Number(d.collect_count || 0)
    },
    media: {
      video: !isImage ? {
        no_watermark: playUrl,
        no_watermark_hd: hdPlayUrl,
        watermark: wmPlayUrl,
        cover: abs(d.cover),
        dynamic_cover: abs(d.ai_dynamic_cover),
        download_url: playUrl ? `${origin}/api/download?url=${encodeURIComponent(playUrl)}&filename=tiktok_${d.id}.mp4` : null,
        stream_url: playUrl ? `${origin}/api/stream?url=${encodeURIComponent(playUrl)}` : null
      } : null,
      music: {
        id: String(d.music_info?.id || ""),
        title: d.music_info?.title || "",
        author: d.music_info?.author || "",
        url: musicUrl,
        duration: d.music_info?.duration || 0,
        cover: abs(d.music_info?.cover),
        download_url: musicUrl ? `${origin}/api/download?url=${encodeURIComponent(musicUrl)}&filename=tiktok_music_${d.id}.mp3` : null
      },
      images: isImage ? d.images.map(abs).filter(Boolean) : []
    }
  };
}

async function scrapeWeb(videoUrl, origin) {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  const res = await fetch(videoUrl, {
    headers: {
      "User-Agent": ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  if (!res.ok) throw new Error(`TikTok Web returned status ${res.status}`);
  const html = await res.text();
  const match = html.match(/<script[^>]+id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\"[^>]*>(.*?)<\/script>/);
  if (!match) throw new Error("Could not parse page manifest");

  const parsed = JSON.parse(match[1]);
  const scope = parsed.__DEFAULT_SCOPE__ || {};
  const item = scope["webapp.video-detail"]?.itemInfo?.itemStruct;
  if (!item) throw new Error("Video details unavailable");

  const isImage = Array.isArray(item.imagePost?.images) && item.imagePost.images.length > 0;
  const images = isImage
    ? item.imagePost.images.map(x => x.displayImage?.urlList?.[0] || "").filter(Boolean)
    : [];

  const playUrl = item.video?.playAddr || null;
  const wmPlayUrl = item.video?.downloadAddr || null;
  const musicUrl = item.music?.playUrl || null;

  return {
    engine: "tiktok_web",
    id: String(item.id || ""),
    title: item.desc || "",
    type: isImage ? "image" : "video",
    duration: item.video?.duration || 0,
    region: "",
    created_at: item.createTime ? new Date(item.createTime * 1000).toISOString() : null,
    author: {
      id: String(item.author?.id || ""),
      unique_id: item.author?.uniqueId || "",
      nickname: item.author?.nickname || "",
      avatar: item.author?.avatarLarger || item.author?.avatarThumb || ""
    },
    stats: {
      views: Number(item.stats?.playCount || 0),
      likes: Number(item.stats?.diggCount || 0),
      comments: Number(item.stats?.commentCount || 0),
      shares: Number(item.stats?.shareCount || 0),
      downloads: 0,
      collects: Number(item.stats?.collectCount || 0)
    },
    media: {
      video: !isImage ? {
        no_watermark: playUrl,
        no_watermark_hd: null,
        watermark: wmPlayUrl,
        cover: item.video?.cover || item.video?.originCover || null,
        dynamic_cover: item.video?.dynamicCover || null,
        download_url: playUrl ? `${origin}/api/download?url=${encodeURIComponent(playUrl)}&filename=tiktok_${item.id}.mp4` : null,
        stream_url: playUrl ? `${origin}/api/stream?url=${encodeURIComponent(playUrl)}` : null
      } : null,
      music: {
        id: String(item.music?.id || ""),
        title: item.music?.title || "",
        author: item.music?.authorName || "",
        url: musicUrl,
        duration: item.music?.duration || 0,
        cover: item.music?.coverLarge || item.music?.coverMedium || null,
        download_url: musicUrl ? `${origin}/api/download?url=${encodeURIComponent(musicUrl)}&filename=tiktok_music_${item.id}.mp3` : null
      },
      images
    }
  };
}

async function scrapeMedia(videoUrl, origin) {
  const errors = [];
  try {
    return await scrapeTikwm(videoUrl, origin);
  } catch (err) {
    errors.push(`Engine 1: ${err.message}`);
  }

  try {
    return await scrapeWeb(videoUrl, origin);
  } catch (err) {
    errors.push(`Engine 2: ${err.message}`);
  }

  throw new Error(`Extraction failed. ${errors.join(" | ")}`);
}

async function handleProxy(request, asAttachment) {
  const reqUrl = new URL(request.url);
  const targetUrl = reqUrl.searchParams.get("url");
  const filename = reqUrl.searchParams.get("filename") || "tiktok_media.mp4";

  if (!targetUrl) {
    return json({ status: "error", message: "Missing 'url' query parameter" }, 400);
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsedTarget.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    return json({ status: "error", message: "Invalid media URL" }, 400);
  }

  const upstreamHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Referer": "https://www.tiktok.com/"
  };

  const range = request.headers.get("range");
  if (range) {
    upstreamHeaders["Range"] = range;
  }

  try {
    const upstream = await fetch(parsedTarget.toString(), {
      method: "GET",
      headers: upstreamHeaders
    });

    const responseHeaders = new Headers(CORS_HEADERS);
    const contentType = upstream.headers.get("content-type") || (filename.endsWith(".mp3") ? "audio/mpeg" : "video/mp4");
    responseHeaders.set("Content-Type", contentType);

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) responseHeaders.set("Accept-Ranges", acceptRanges);

    responseHeaders.set(
      "Content-Disposition",
      asAttachment ? `attachment; filename="${filename}"` : "inline"
    );
    responseHeaders.set("Cache-Control", "public, max-age=86400");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch (err) {
    return json({ status: "error", message: `Proxy error: ${err.message}` }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    const url = new URL(request.url);
    const origin = url.origin;
    const path = url.pathname;

    if (path === "/" || path === "/api") {
      return json({
        status: "online",
        service: "TikTok Scraper API",
        version: "1.0.0",
        endpoints: {
          scrape: {
            method: ["GET", "POST"],
            path: "/api/scrape",
            params: {
              url: "TikTok video / photo URL, shortlink (vm/vt), or video ID"
            },
            example: `${origin}/api/scrape?url=https://www.tiktok.com/@tiktok/video/7106594312292453675`
          },
          download: {
            method: "GET",
            path: "/api/download",
            params: {
              url: "Direct media URL",
              filename: "Optional output filename (default: tiktok_media.mp4)"
            }
          },
          stream: {
            method: "GET",
            path: "/api/stream",
            params: {
              url: "Direct media URL"
            }
          },
          health: {
            method: "GET",
            path: "/health"
          }
        }
      });
    }

    if (path === "/health") {
      return json({ status: "ok", timestamp: new Date().toISOString() });
    }

    if (path === "/api/download" || path === "/download") {
      return handleProxy(request, true);
    }

    if (path === "/api/stream" || path === "/stream") {
      return handleProxy(request, false);
    }

    if (["/api/scrape", "/scrape", "/api/video", "/api/info"].includes(path)) {
      let rawUrl = null;

      if (request.method === "GET") {
        rawUrl = url.searchParams.get("url") || url.searchParams.get("id");
      } else if (request.method === "POST") {
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          try {
            const body = await request.json();
            rawUrl = body.url || body.id || body.link;
          } catch {
            return json({ status: "error", message: "Invalid JSON body" }, 400);
          }
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          const form = await request.formData();
          rawUrl = form.get("url") || form.get("id") || form.get("link");
        }
      } else {
        return json({ status: "error", message: "Method not allowed" }, 405);
      }

      const extracted = extractUrl(rawUrl);
      if (!extracted) {
        return json({
          status: "error",
          message: "A valid TikTok URL, shortlink, or video ID is required"
        }, 400);
      }

      try {
        const canonicalUrl = await resolveRedirects(extracted);
        const data = await scrapeMedia(canonicalUrl, origin);
        return json({
          status: "success",
          code: 200,
          data
        });
      } catch (err) {
        return json({
          status: "error",
          code: 500,
          message: err.message
        }, 500);
      }
    }

    return json({ status: "error", message: "Not found" }, 404);
  }
};
