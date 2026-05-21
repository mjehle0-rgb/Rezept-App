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

        // ==========================================
        // FALL A: SCREENSHOT ANALYSE
        // ==========================================
        if (image) {
            try {
                const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
                
                const prompt = `Du bist ein präziser Rezept-Extraktor. Analysiere diesen Screenshot.
Erstelle ein JSON-Objekt mit exakt diesen drei Schlüsseln:
- "title": Name des Gerichts ohne Emojis.
- "tags": 2-3 kurze Küchen-Kategorien (kommasepariert). Niemals Plattformnamen.
- "notes": Liste ALLE sichtbaren Zutaten und Mengen exakt ab, beginnend mit "• ". Nutze \\n für Zeilenumbrüche.`;

                const aiResponse = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                            ]
                        }],
                        generationConfig: {
                            response_mime_type: "application/json"
                        }
                    })
                });

                const aiData = await aiResponse.json();
                
                if (aiData.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const jsonResult = JSON.parse(aiData.candidates[0].content.parts[0].text);
                    return res.status(200).json(jsonResult);
                }
                throw new Error("Leere KI-Antwort.");
            } catch (imgError) {
                console.error("Screenshot-Fehler:", imgError);
                return res.status(200).json({ 
                    title: "Bild-Analyse fehlgeschlagen", 
                    tags: "Kamera", 
                    notes: `• Fehler beim Lesen des Screenshots.\n• Bitte trage die Daten manuell ein.` 
                });
            }
        }

        // ==========================================
        // FALL B: LINK IMPORT (DETEKTIV-MODUS)
        // ==========================================
        if (url) {
            let pageTitle = "Neues Rezept";
            let metaDescription = "";

            try {
                const response = await fetch(url, {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'de-DE,de;q=0.9'
                    }
                });
                const htmlText = await response.text();
                
                const descMatch = htmlText.match(/property="og:description"\s+content="([^"]+)"/i) || 
                                  htmlText.match(/name="description"\s+content="([^"]+)"/i) ||
                                  htmlText.match(/"shortDescription":"([^"]+)"/i);
                
                if (descMatch && descMatch[1]) {
                    metaDescription = descMatch[1]
                        .replace(/\\n/g, '\n')
                        .replace(/\\"/g, '"')
                        .substring(0, 4000); 
                }

                const titleMatch = htmlText.match(/property="og:title"\s+content="([^"]+)"/i);
                
                if (titleMatch && titleMatch[1]) {
                    pageTitle = titleMatch[1];
                } else if (htmlText.indexOf("<title>") !== -1) {
                    pageTitle = htmlText.split("<title>")[1].split("</")[0]; 
                }

                pageTitle = pageTitle.replace(/- YouTube.*/i, '').replace(/YouTube/i, '').trim();
                
            } catch (fetchError) {
                console.error("Fetch-Fehler beim URL-Abrufen:", fetchError);
                metaDescription = "";
            }

            if (!metaDescription && pageTitle === "Neues Rezept") {
                return res.status(200).json({
                    title: "Import fehlgeschlagen",
                    tags: "Info",
                    notes: "• Die Plattform blockiert den automatischen Zugriff vollständig.\n• Bitte nutze die 📷 Kamera-Funktion für einen schnellen Screenshot!"
                });
            }

            // VEREINFACHTER PROMPT - zuverlässiger bei Gemini
            const prompt = `Analysiere diese Rezept-Daten und extrahiere Zutaten:

Titel: ${pageTitle}
Beschreibung: ${metaDescription}

Antworte NUR mit gültigem JSON (keine zusätzlicher Text):
{
  "title": "Exact title from above",
  "tags": "Category1, Category2",
  "notes": "• Ingredient 1\\n• Ingredient 2\\n• etc"
}

Wenn KEINE Zutaten vorhanden sind, schreib: "• Keine Zutaten in der Beschreibung gefunden"`;

            try {
                console.log("🚀 Sende AI-Request mit URL:", url);
                
                const aiResponse = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: prompt }]
                        }],
                        generationConfig: {
                            response_mime_type: "application/json"
                        }
                    })
                });

                console.log("📨 AI-Response Status:", aiResponse.status);
                const aiData = await aiResponse.json();
                console.log("📥 AI-Daten erhalten:", JSON.stringify(aiData).substring(0, 200));
                
                // DEBUGGING: Zeige die komplette Antwort
                if (aiData.error) {
                    console.error("❌ AI-Fehler:", aiData.error);
                    return res.status(200).json({
                        title: pageTitle,
                        tags: "Video",
                        notes: `• AI-Fehler: ${aiData.error.message || aiData.error}\n• Versuche die 📷 Kamera-Funktion!`
                    });
                }

                if (aiData.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const responseText = aiData.candidates[0].content.parts[0].text;
                    console.log("✅ AI-Text-Antwort:", responseText.substring(0, 200));
                    
                    try {
                        const jsonResult = JSON.parse(responseText);
                        return res.status(200).json(jsonResult);
                    } catch (parseError) {
                        console.error("❌ JSON-Parse-Fehler:", parseError, "Text war:", responseText);
                        // Fallback: Extrahiere manuell
                        return res.status(200).json({
                            title: pageTitle,
                            tags: "Video",
                            notes: responseText
                        });
                    }
                } else {
                    console.error("❌ Keine Kandidaten in AI-Antwort:", aiData);
                }
            } catch (aiError) {
                console.error("❌ AI-Fehler (Netzwerk/Parsing):", aiError);
                console.error("Stack:", aiError.stack);
            }
            
            return res.status(200).json({ 
                title: pageTitle, 
                tags: "Video", 
                notes: "• Die Detailanalyse schlug fehl.\n• Bitte nutze die 📷 Kamera-Funktion für einen schnellen Screenshot der Infobox!" 
            });
        }

        return res.status(400).json({ error: 'Keine Daten geliefert' });

    } catch (globalError) {
        console.error("❌ Globaler Fehler:", globalError);
        return res.status(200).json({ 
            title: "Import-Hinweis", 
            tags: "Fehler", 
            notes: `• Ein Fehler ist aufgetreten (${globalError.message}).` 
        });
    }
}
