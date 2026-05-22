// fetch-recipe.js (optimiert für bessere Video-Extraktion)
export default async function handler(req, res) {
  // SICHERHEIT: In Produktion solltest du ALLOWED_ORIGIN in Vercel auf deine Domain setzen 
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

  try {
    const { url, image } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(200).json({
        title: "Setup-Fehler",
        tags: "System",
        notes: "• Der GEMINI_API_KEY fehlt in den Vercel-Umgebungsvariablen!"
      });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    // Helper: fetch with timeout
    const fetchWithTimeout = async (input, init = {}, timeout = 8000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const resp = await fetch(input, { ...init, signal: controller.signal });
        clearTimeout(id);
        return resp;
      } catch (e) {
        clearTimeout(id);
        throw e;
      }
    };

    // ==========================================
    // FALL A: SCREENSHOT ANALYSE (unverändert, nur kleine Robustheit)
    // ==========================================
    if (image) {
      try {
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

        const prompt = `Du bist ein präziser Rezept-Extraktor. Analysiere diesen Screenshot.
Antworte NUR mit JSON (keine anderen Zeichen):
{"title":"Name des Gerichts","tags":"Kategorie1, Kategorie2","notes":"• Zutat1\\n• Zutat2"}`;

        const aiResponse = await fetchWithTimeout(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inlineData: { mimeType: "image/jpeg", data: base64Data } }
              ]
            }]
          })
        }, 15000);

        const aiData = await aiResponse.json();

        if (aiData.candidates?.[0]?.content?.parts?.[0]?.text) {
          const responseText = aiData.candidates[0].content.parts[0].text;
          try {
            const jsonResult = JSON.parse(responseText);
            return res.status(200).json({
              ...jsonResult,
              link: jsonResult.link || "📷 Foto-Analyse"
            });
          } catch (e) {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const jsonResult = JSON.parse(jsonMatch[0]);
              return res.status(200).json({
                ...jsonResult,
                link: jsonResult.link || "📷 Foto-Analyse"
              });
            }
          }
        }
        throw new Error("Leere KI-Antwort.");
      } catch (imgError) {
        console.error("Screenshot-Fehler:", imgError);
        return res.status(200).json({
          title: "Bild-Analyse fehlgeschlagen",
          tags: "Kamera",
          notes: `• Fehler beim Lesen des Screenshots.\n• Bitte trage die Daten manuell ein.`,
          link: "📷 Fehler"
        });
      }
    }

    // ==========================================
    // FALL B: LINK IMPORT (DETEKTIV-MODUS) — erweitert für Videos
    // ==========================================
    if (url) {
      let pageTitle = "Neues Rezept";
      let metaDescription = "";
      let htmlText = "";
      let detectedVideoMeta = null;
      let isVideo = false;

      try {
        const response = await fetchWithTimeout(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'de-DE,de;q=0.9'
          }
        }, 10000);

        htmlText = await response.text();

        // 1) Try JSON-LD extraction (application/ld+json)
        const ldMatches = [...htmlText.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
        for (const m of ldMatches) {
          try {
            const parsed = JSON.parse(m[1].trim());
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            for (const item of arr) {
              if (item['@type'] && (item['@type'].toLowerCase().includes('video') || item['@type'] === 'VideoObject')) {
                detectedVideoMeta = item;
                isVideo = true;
                break;
              }
              if (item['@type'] && (item['@type'].toLowerCase().includes('recipe') || item['@type'] === 'Recipe')) {
                // prefer recipe if explicitly present
                metaDescription = metaDescription || (item.description || "");
                pageTitle = pageTitle === "Neues Rezept" ? (item.name || pageTitle) : pageTitle;
              }
            }
            if (isVideo) break;
          } catch (e) {
            // ignore parse errors for this script tag
          }
        }

        // 2) Try OpenGraph / meta tags
        const ogDesc = htmlText.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i);
        const nameDesc = htmlText.match(/name=["']description["']\s+content=["']([^"']+)["']/i);
        const shortDesc = htmlText.match(/"shortDescription":"([^"]+)"/i);
        const ogTitle = htmlText.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i);
        const ogVideo = htmlText.match(/property=["']og:video["']\s+content=["']([^"']+)["']/i) || htmlText.match(/property=["']og:video:url["']\s+content=["']([^"']+)["']/i);

        if (ogDesc && ogDesc[1]) metaDescription = ogDesc[1].replace(/\\n/g, '\n').substring(0, 4000);
        else if (nameDesc && nameDesc[1]) metaDescription = nameDesc[1].replace(/\\n/g, '\n').substring(0, 4000);
        else if (shortDesc && shortDesc[1]) metaDescription = shortDesc[1].replace(/\\n/g, '\n').substring(0, 4000);

        if (ogTitle && ogTitle[1]) pageTitle = ogTitle[1];
        else if (htmlText.indexOf("<title>") !== -1) pageTitle = htmlText.split("<title>")[1].split("</")[0];

        pageTitle = pageTitle.replace(/- YouTube.*/i, '').replace(/YouTube/i, '').trim();

        // 3) Hostname heuristics for known video platforms
        const lowerUrl = url.toLowerCase();
        const isYouTube = /youtube\.com|youtu\.be/.test(lowerUrl);
        const isVimeo = /vimeo\.com/.test(lowerUrl);
        const isTikTok = /tiktok\.com/.test(lowerUrl);

        // 4) Try oEmbed for YouTube/Vimeo (fast, reliable)
        if (isYouTube || isVimeo) {
          try {
            const oembedUrl = isYouTube
              ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
              : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
            const oresp = await fetchWithTimeout(oembedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 7000);
            if (oresp.ok) {
              const odata = await oresp.json();
              detectedVideoMeta = detectedVideoMeta || {};
              detectedVideoMeta.name = detectedVideoMeta.name || odata.title;
              detectedVideoMeta.description = detectedVideoMeta.description || odata.description || metaDescription;
              detectedVideoMeta.thumbnailUrl = detectedVideoMeta.thumbnailUrl || odata.thumbnail_url || odata.thumbnail_url;
              detectedVideoMeta.author = detectedVideoMeta.author || { name: odata.author_name || odata.author_name };
              detectedVideoMeta.provider = detectedVideoMeta.provider || { name: isYouTube ? 'YouTube' : 'Vimeo' };
              isVideo = true;
            }
          } catch (e) {
            // ignore oEmbed failure
          }
        }

        // 5) If og:video present and no JSON-LD, mark as video
        if (!isVideo && ogVideo) {
          isVideo = true;
          detectedVideoMeta = detectedVideoMeta || {};
          detectedVideoMeta.embedUrl = ogVideo[1];
        }

        // 6) If still no metaDescription but page contains long text, take first 4000 chars of visible text
        if (!metaDescription) {
          const textOnly = htmlText.replace(/<script[\s\S]*?<\/script>/gi, '')
                                   .replace(/<style[\s\S]*?<\/style>/gi, '')
                                   .replace(/<\/?[^>]+(>|$)/g, '')
                                   .replace(/\s{2,}/g, ' ')
                                   .trim();
          if (textOnly.length > 200) metaDescription = textOnly.substring(0, 4000);
        }

      } catch (fetchError) {
        console.error("Fetch-Fehler beim URL-Abrufen:", fetchError);
        metaDescription = metaDescription || "";
      }

      // If platform blocks scraping and we have nothing
      if (!metaDescription && pageTitle === "Neues Rezept" && !isVideo) {
        return res.status(200).json({
          title: "Import fehlgeschlagen",
          tags: "Info",
          notes: "• Die Plattform blockiert den automatischen Zugriff vollständig.\n• Bitte nutze die 📷 Kamera-Funktion für einen schnellen Screenshot!",
          link: url
        });
      }

      // Build AI prompt: choose video prompt if video detected
      let prompt;
      if (isVideo) {
        const videoMetaSummary = {
          title: detectedVideoMeta?.name || pageTitle,
          description: detectedVideoMeta?.description || metaDescription,
          thumbnail: detectedVideoMeta?.thumbnailUrl || detectedVideoMeta?.thumbnail || null,
          author: detectedVideoMeta?.author?.name || detectedVideoMeta?.author || null,
          provider: detectedVideoMeta?.provider?.name || null,
          embed: detectedVideoMeta?.embedUrl || null
        };

        prompt = `Du bist ein präziser Extraktor für Web-Inhalte. Analysiere diese Video-Seite und antworte NUR mit JSON (keine anderen Zeichen).
Gib folgende Felder zurück: {"title":"Video-Titel","tags":"Kategorie1, Kategorie2","notes":"• kurze Beschreibung\\n• evtl. Zutaten oder Kapitel","link":"URL","videoMeta":{"uploader":"Name","duration":"PT...","thumbnail":"URL","uploadDate":"YYYY-MM-DD","provider":"YouTube/Vimeo/TikTok","embed":"embed-url"}}.
Sei sparsam, valide JSON, keine Kommentare.

Seite: ${url}
Erkannte Metadaten: ${JSON.stringify(videoMetaSummary).slice(0, 2000)}

Beschreibung: ${metaDescription.slice(0, 2000)}`;

      } else {
        prompt = `Analysiere diese Rezept-Daten:

Titel: ${pageTitle}
Beschreibung: ${metaDescription}

Antworte NUR mit JSON (keine anderen Zeichen, nur der JSON-Block):
{"title":"${pageTitle}","tags":"Kategorie1, Kategorie2","notes":"• Zutat1\\n• Zutat2\\n• etc"}`;
      }

      try {
        console.log("🚀 Sende AI-Request mit URL:", url);

        const aiResponse = await fetchWithTimeout(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }]
          })
        }, 15000);

        console.log("📨 AI-Response Status:", aiResponse.status);
        const aiData = await aiResponse.json();
        console.log("📥 AI-Daten erhalten:", JSON.stringify(aiData).substring(0, 300));

        if (aiData.error) {
          console.error("❌ AI-Fehler:", aiData.error);
          return res.status(200).json({
            title: pageTitle,
            tags: isVideo ? "Video" : "Video",
            notes: `• AI-Fehler: ${aiData.error.message || JSON.stringify(aiData.error)}\n• Versuche die 📷 Kamera-Funktion!`,
            link: url
          });
        }

        if (aiData.candidates?.[0]?.content?.parts?.[0]?.text) {
          const responseText = aiData.candidates[0].content.parts[0].text;
          console.log("✅ AI-Text-Antwort:", responseText.substring(0, 300));

          try {
            const jsonResult = JSON.parse(responseText);
            // If video detected, ensure link and videoMeta exist
            if (isVideo) {
              return res.status(200).json({
                ...jsonResult,
                tags: jsonResult.tags || "Video",
                link: jsonResult.link || url,
                videoMeta: jsonResult.videoMeta || detectedVideoMeta || {}
              });
            }
            return res.status(200).json({
              ...jsonResult,
              link: jsonResult.link || url
            });
          } catch (parseError) {
            console.error("❌ JSON-Parse-Fehler, versuche Regex-Extraktion");
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const jsonResult = JSON.parse(jsonMatch[0]);
                return res.status(200).json({
                  ...jsonResult,
                  link: jsonResult.link || url
                });
              } catch (e) {
                console.error("❌ Regex-JSON parse fehlgeschlagen");
              }
            }
            // Fallback: return raw AI text in notes
            return res.status(200).json({
              title: pageTitle,
              tags: isVideo ? "Video" : "Video",
              notes: responseText,
              link: url,
              videoMeta: detectedVideoMeta || null
            });
          }
        } else {
          console.error("
