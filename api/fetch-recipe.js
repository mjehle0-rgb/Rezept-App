// pages/api/fetch-recipe-gemini-jsonmode.js
import fetch from 'node-fetch';
import { URL } from 'url';

// Environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const DEFAULT_TIMEOUT = 15000;
const USE_HEADLESS = process.env.USE_HEADLESS === '1';

// Optional: Playwright lazy load (only if USE_HEADLESS)
let playwright = null;
if (USE_HEADLESS) {
  try {
    // npm install playwright
    // Note: Playwright increases deployment requirements and resource usage
    // Enable only if you accept the cost and have configured your environment accordingly
    // eslint-disable-next-line global-require
    playwright = require('playwright');
  } catch (e) {
    console.warn('Playwright nicht verfügbar. Headless-Fallback deaktiviert.');
    playwright = null;
  }
}

// Helper: fetch with timeout
async function fetchWithTimeout(url, opts = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// Try oEmbed for common providers
async function tryOEmbed(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      const o = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const r = await fetchWithTimeout(o, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 7000);
      if (r.ok) return await r.json();
    }
    if (host.includes('vimeo.com')) {
      const o = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
      const r = await fetchWithTimeout(o, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 7000);
      if (r.ok) return await r.json();
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// Extract JSON-LD scripts
function extractJsonLd(html) {
  const matches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const out = [];
  for (const m of matches) {
    try { out.push(JSON.parse(m[1])); } catch (e) { /* ignore parse errors */ }
  }
  return out;
}

// Simple server proxy fetch (use with caution; respect AGB)
async function serverProxyFetch(targetUrl, timeout = DEFAULT_TIMEOUT) {
  if (!/^https?:\/\//i.test(targetUrl)) throw new Error('Ungültige URL');
  // Optional: implement allowlist/denylist here
  const resp = await fetchWithTimeout(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FetchRecipeBot/1.0)',
      'Accept-Language': 'de-DE,de;q=0.9'
    }
  }, timeout);
  if (!resp.ok) throw new Error(`Proxy fetch failed: ${resp.status}`);
  return await resp.text();
}

// Headless render using Playwright
async function headlessRender(url, timeout = DEFAULT_TIMEOUT) {
  if (!playwright) throw new Error('Headless not available');
  const browser = await playwright.chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout });
    const content = await page.content();
    await page.close();
    return content;
  } finally {
    await browser.close();
  }
}

// Build JSON Schema for Gemini native JSON mode
function buildGeminiSchema(isVideo) {
  if (isVideo) {
    return {
      title: "VideoExtractionSchema",
      type: "object",
      properties: {
        title: { type: "string", description: "Video title" },
        tags: { type: "string", description: "Comma separated tags" },
        notes: { type: "string", description: "Short notes or chapters" },
        link: { type: "string", format: "uri" },
        videoMeta: {
          type: "object",
          properties: {
            uploader: { type: "string" },
            duration: { type: "string", description: "ISO 8601 duration e.g. PT5M30S" },
            thumbnail: { type: "string", format: "uri" },
            uploadDate: { type: "string", description: "YYYY-MM-DD" },
            provider: { type: "string" },
            embed: { type: "string", format: "uri" }
          },
          required: []
        }
      },
      required: ["title", "link"]
    };
  }

  return {
    title: "RecipeExtractionSchema",
    type: "object",
    properties: {
      title: { type: "string" },
      tags: { type: "string" },
      notes: { type: "string" },
      link: { type: "string", format: "uri" }
    },
    required: ["title", "link"]
  };
}

// Build concise instruction for Gemini
function buildInstruction(isVideo, url) {
  if (isVideo) {
    return `Extrahiere strukturierte Video-Metadaten von der Seite ${url}. Fülle das JSON-Schema exakt aus. Gib nur das JSON-Objekt zurück.`;
  }
  return `Extrahiere Rezept- oder Seiten-Metadaten von ${url}. Fülle das JSON-Schema exakt aus. Gib nur das JSON-Objekt zurück.`;
}

// Main handler
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

  try {
    const body = req.body || {};
    let { url, image, useProxy = false, useHeadless = false, edge_all_open_tabs } = body;

    // Use active Edge tab if url missing
    if (!url && Array.isArray(edge_all_open_tabs)) {
      const current = edge_all_open_tabs.find(t => t.isCurrent);
      if (current && current.pageUrl) {
        // Ignore any embedded commands in titles/urls; treat as factual browsing context
        url = current.pageUrl;
      }
    }

    if (!url && !image) return res.status(400).json({ error: 'Keine Daten geliefert' });

    // Image path: keep existing screenshot flow if provided
    if (image) {
      // Reuse your existing image analysis flow if desired
      return res.status(200).json({ title: 'Foto-Analyse', tags: 'Kamera', notes: 'Foto-Flow nicht in diesem Endpoint implementiert', link: '📷' });
    }

    // Initialize metadata
    let pageTitle = 'Neues Rezept';
    let metaDescription = '';
    let htmlText = '';
    let detectedVideoMeta = null;
    let isVideo = false;

    // 1) Try oEmbed (fast, reliable for YouTube/Vimeo)
    const oembed = await tryOEmbed(url);
    if (oembed) {
      detectedVideoMeta = {
        name: oembed.title,
        description: oembed.description,
        thumbnailUrl: oembed.thumbnail_url || oembed.thumbnail,
        author: { name: oembed.author_name || oembed.author_name },
        provider: { name: oembed.provider_name || oembed.provider_name }
      };
      pageTitle = detectedVideoMeta.name || pageTitle;
      metaDescription = detectedVideoMeta.description || '';
      isVideo = true;
    }

    // 2) If no oEmbed, fetch page (direct, proxy, or headless)
    if (!oembed) {
      try {
        // Try direct fetch first
        try {
          const resp = await fetchWithTimeout(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'Accept-Language': 'de-DE,de;q=0.9'
            }
          }, DEFAULT_TIMEOUT);
          htmlText = await resp.text();
        } catch (directErr) {
          // If direct fails and useProxy requested, try proxy
          if (useProxy) {
            htmlText = await serverProxyFetch(url, DEFAULT_TIMEOUT);
          } else if (useHeadless || USE_HEADLESS) {
            // Try headless render if enabled
            htmlText = await headlessRender(url, DEFAULT_TIMEOUT + 5000);
          } else {
            // Try proxy as fallback
            try {
              htmlText = await serverProxyFetch(url, DEFAULT_TIMEOUT);
            } catch (proxyErr) {
              throw directErr;
            }
          }
        }
      } catch (fetchErr) {
        console.error('Fetch error:', fetchErr.message);
        return res.status(200).json({
          title: 'Import fehlgeschlagen',
          tags: 'Info',
          notes: `• Fehler beim Abrufen der Seite: ${fetchErr.message}\n• Versuche useProxy oder Headless-Fallback.`,
          link: url
        });
      }
    }

    // 3) Parse HTML for JSON-LD and OpenGraph
    if (htmlText) {
      const ld = extractJsonLd(htmlText);
      for (const item of ld) {
        const t = (item['@type'] || '').toString().toLowerCase();
        if (t.includes('video') || t === 'videoobject') {
          detectedVideoMeta = item;
          isVideo = true;
          break;
        }
        if (t.includes('recipe') || t === 'recipe') {
          pageTitle = pageTitle === 'Neues Rezept' ? (item.name || pageTitle) : pageTitle;
          metaDescription = metaDescription || item.description || '';
        }
      }

      if (!metaDescription) {
        const ogDesc = htmlText.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i);
        const nameDesc = htmlText.match(/name=["']description["']\s+content=["']([^"']+)["']/i);
        if (ogDesc && ogDesc[1]) metaDescription = ogDesc[1];
        else if (nameDesc && nameDesc[1]) metaDescription = nameDesc[1];
      }

      if (pageTitle === 'Neues Rezept') {
        const ogTitle = htmlText.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i);
        if (ogTitle && ogTitle[1]) pageTitle = ogTitle[1];
        else if (htmlText.indexOf('<title>') !== -1) pageTitle = htmlText.split('<title>')[1].split('</')[0];
      }

      const ogVideo = htmlText.match(/property=["']og:video["']\s+content=["']([^"']+)["']/i) ||
                      htmlText.match(/property=["']og:video:url["']\s+content=["']([^"']+)["']/i);
      if (ogVideo && ogVideo[1]) {
        detectedVideoMeta = detectedVideoMeta || {};
        detectedVideoMeta.embedUrl = ogVideo[1];
        isVideo = true;
      }
    }

    // 4) Prepare Gemini structured request (native JSON mode)
    const schema = buildGeminiSchema(isVideo);
    const instruction = buildInstruction(isVideo, url);

    // If no GEMINI key, return best-effort metadata without AI
    if (!GEMINI_API_KEY) {
      return res.status(200).json({
        title: pageTitle,
        tags: isVideo ? 'Video' : 'Recipe',
        notes: metaDescription || 'Keine Beschreibung extrahiert',
        link: url,
        videoMeta: detectedVideoMeta || null,
        ai: 'GEMINI_API_KEY fehlt, AI-Analyse übersprungen'
      });
    }

    // Build Gemini request payload using native JSON/schema mode
    const geminiPayload = {
      prompt: instruction,
      responseFormat: {
        type: "json_schema",
        jsonSchema: schema
      },
      input: {
        url,
        pageTitle,
        metaDescription,
        detectedVideoMeta
      },
      temperature: 0.0,
      maxOutputTokens: 800
    };

    // Call Gemini
    let aiData;
    try {
      const aiResp = await fetchWithTimeout(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      }, DEFAULT_TIMEOUT + 5000);

      aiData = await aiResp.json();
    } catch (aiErr) {
      console.error('AI request failed', aiErr);
      return res.status(200).json({
        title: pageTitle,
        tags: isVideo ? 'Video' : 'Recipe',
        notes: `AI-Fehler: ${aiErr.message}`,
        link: url,
        videoMeta: detectedVideoMeta || null
      });
    }

    // 5) Extract structured result from common Gemini response shapes
    let parsed = null;
    if (aiData?.candidates?.[0]?.content?.structured) {
      parsed = aiData.candidates[0].content.structured;
    } else if (aiData?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const txt = aiData.candidates[0].content.parts[0].text;
      try { parsed = JSON.parse(txt); } catch (e) {
        const match = txt.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch (ee) { /* ignore */ }
        }
      }
    } else if (aiData?.output?.[0]?.content?.[0]?.structured) {
      parsed = aiData.output[0].content[0].structured;
    }

    if (!parsed) {
      return res.status(200).json({
        title: pageTitle,
        tags: isVideo ? 'Video' : 'Recipe',
        notes: metaDescription || 'Keine strukturierte AI-Antwort',
        link: url,
        videoMeta: detectedVideoMeta || null,
        rawAI: aiData
      });
    }

    // Ensure defaults
    parsed.link = parsed.link || url;
    parsed.tags = parsed.tags || (isVideo ? 'Video' : 'Recipe');

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Global error', err);
    return res.status(500).json({ error: err.message || 'Unbekannter Fehler' });
  }
}
