export default async function handler(req, res) {
    // SICHERHEIT: In Produktion solltest du ALLOWED_ORIGIN in Vercel auf deine Domain setzen 
    // (z. B. https://meine-rezept-app.vercel.app). Lokal fällt es auf '*' zurück.
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
                
                // NEU: Klarere Struktur für natives JSON
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
                        // NEU: Zwingt Gemini zur reinen JSON-Ausgabe
                        generationConfig: {
                            responseMimeType: "application/json"
                        }
                    })
                });

                const aiData = await aiResponse.json();
                
                // NEU: Direktes Parsen ohne Regex-Workaround
                if (aiData.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const jsonResult = JSON.parse(aiData.candidates[0].content.parts[0].text);
                    return res.status(200).json(jsonResult);
                }
                throw new Error("Leere KI-Antwort.");
            } catch (imgError) {
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
                metaDescription = "";
            }

            if (!metaDescription && pageTitle === "Neues Rezept") {
                return res.status(200).json({
                    title: "Import fehlgeschlagen",
                    tags: "Info",
                    notes: "• Die Plattform blockiert den automatischen Zugriff vollständig.\n• Bitte nutze die 📷 Kamera-Funktion für einen schnellen Screenshot!"
                });
            }

            // KORREKTUR: Sichere JSON-Konstruktion statt String-Interpolation im Prompt
            const systemPrompt = `Du bist ein brillanter Rezept-Detektiv. Analysiere die bereitgestellten Daten einer Videoplattform.

DEINE AUFGABE:
1. Scanne die Beschreibung intensiv nach Zutaten. Oft stehen sie unstrukturiert im Fließtext oder nutzen Abkürzungen wie "EL", "TL", "g", "Handvoll".
2. Nimm auch ungenaue Mengen ("etwas Salz", "Schuss Sojasauce") absolut kulant in die Liste auf!
3. Formatiere alle gefundenen Zutaten ordentlich untereinander, beginnend mit "• ". Nutze \\n für Zeilenumbrüche.
4. ERFINDUNGS-VERBOT: Wenn absolut KEINE Zutaten erwähnt werden, setze den Wert für "notes" exakt auf diesen String: "• Im Beschreibungstext des Videos wurden keine Zutaten gefunden."

Erstelle ein JSON-Objekt mit exakt diesen drei Schlüsseln:
- "title": Übernimm den Wert unter "Titel".
- "tags": "Video, Rezept"
- "notes": Deine formatierte Zutatenliste oder der Notfall-Text.`;

            const analysisData = `Titel: ${pageTitle}\n\nBeschreibung:\n${metaDescription}`;

            try {
                const aiResponse = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: systemPrompt },
                                { text: analysisData }
                            ]
                        }],
                        // Zwingt Gemini zur reinen JSON-Ausgabe
                        generationConfig: {
                            responseMimeType: "application/json"
                        }
                    })
                });

                const aiData = await aiResponse.json();
                
                // Direktes Parsen ohne Regex-Workaround
                if (aiData.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const jsonResult = JSON.parse(aiData.candidates[0].content.parts[0].text);
                    return res.status(200).json(jsonResult);
                }
            } catch (aiError) {
                console.error("AI Error bei Link-Import:", aiError);
            }
            
            return res.status(200).json({ 
                title: pageTitle, 
                tags: "Video", 
                notes: "• Die Detailanalyse schlug fehl.\n• Bitte nutze die 📷 Kamera-Funktion für einen schnellen Screenshot der Infobox!" 
            });
        }

        return res.status(400).json({ error: 'Keine Daten geliefert' });

    } catch (globalError) {
        return res.status(200).json({ 
            title: "Import-Hinweis", 
            tags: "Fehler", 
            notes: `• Ein Fehler ist aufgetreten (${globalError.message}).` 
        });
    }
}
