export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

    const { url, image } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(200).json({ title: "Fehler", tags: "Setup", notes: "API-Key fehlt!" });
    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    // FALL A: Screenshot Analyse (Bleibt unschlagbar präzise)
    if (image) {
        try {
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            const prompt = `Du bist ein präziser Rezept-Extraktor. Analysiere diesen Screenshot einer Infobox.
            1. "title": Name des Gerichts ohne Emojis.
            2. "tags": 2-3 kurze Küchen-Kategorien (z.B. "Vegan, Asiatisch"). Niemals Plattformnamen.
            3. "notes": Liste ALLE sichtbaren Zutaten und Mengen exakt ab mit "• ".
            Antworte nur als reines JSON-Objekt ohne Markdown.
            Format: {"title": "Name", "tags": "Tag1, Tag2", "notes": "• Zutat 1\\n• Zutat 2"}`;

            const aiResponse = await fetch(geminiUrl, {
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
            });

            const aiData = await aiResponse.json();
            const rawText = aiData.candidates[0].content.parts[0].text.trim();
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            return res.status(200).json(JSON.parse(jsonMatch[0]));
        } catch (error) {
            return res.status(200).json({ title: "Bild-Fehler", tags: "Vision", notes: "Screenshot konnte nicht gelesen werden." });
        }
    }

    // FALL B: Der Link-Scraper (Jetzt mit striktem Halluzinations-Verbot)
    if (url) {
        try {
            const response = await fetch(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'de-DE,de;q=0.9'
                }
            });
            const htmlText = await response.text();
            
            // Beschreibung und Titel isolieren
            let metaDescription = "";
            const descMatch = htmlText.match(/property="og:description"\s+content="([^"]+)"/i) || htmlText.match(/name="description"\s+content="([^"]+)"/i);
            if (descMatch) metaDescription = descMatch[1];

            let pageTitle = "";
            const titleMatch = htmlText.match(/property="og:title"\s+content="([^"]+)"/i) || htmlText.match(/<title>([\s\S]*?)<\/title>/i);
            if (titleMatch) pageTitle = titleMatch[1].replace(/- YouTube.*/i, '').replace(/YouTube/i, '').trim();
            if (!pageTitle) pageTitle = "Neues Rezept";

            // Ganz wichtig: Wenn es ein YouTube-Link ist, weisen wir die KI an, extrem vorsichtig zu sein
            const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");

            const prompt = `Du bist ein strikter Daten-Extraktor. Analysiere den Text einer Webseite.
            
            DEINE AUFGABE:
            1. Extrahiere NUR Zutaten, die wirklich im Text stehen.
            2. Wenn im bereitgestellten Text KEINE konkreten Zutaten mit Mengenangaben zu finden sind, dann erfinde NIEMALS eigene Zutaten! 
            3. Falls die Daten unvollständig sind (besonders wichtig bei YouTube-Links: ${isYouTube ? 'JA' : 'NEIN'}), schreibe in das Feld "notes" AUSSCHLIESSLICH den folgenden Text:
               "• Der Link konnte nicht automatisch ausgelesen werden.\\n• Bitte nutze die 📷 Kamera-Funktion für einen Screenshot der Infobox oder trage die Zutaten manuell ein."

            Antworte im exakten JSON-Format ohne Markdown-Wrapper:
            {"title": "${pageTitle}", "tags": "Asiatisch, Tofu", "notes": "• Zutat 1\\n• Zutat 2"}`;

            const aiResponse = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt + `\n\nDATEN:\nTitel: ${pageTitle}\nBeschreibung: ${metaDescription}` }] }]
                })
            });

            const aiData = await aiResponse.json();
            const rawText = aiData.candidates[0].content.parts[0].text.trim();
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                return res.status(200).json(JSON.parse(jsonMatch[0]));
            }
        } catch (e) {
            // Fallback
        }
        
        return res.status(200).json({ 
            title: "Rezept importieren", 
            tags: "Manuell", 
            notes: "• Der Link konnte nicht automatisch ausgelesen werden.\n• Bitte nutze die 📷 Kamera-Funktion für einen Screenshot der Infobox oder trage die Zutaten manuell ein." 
        });
    }

    return res.status(400).json({ error: 'Keine Daten geliefert' });
}
