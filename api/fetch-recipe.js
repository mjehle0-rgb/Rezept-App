export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Keine URL übergeben' });

    try {
        const response = await fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept-Language': 'de-DE,de;q=0.9'
            }
        });
        const htmlText = await response.text();

        const titleMatch = htmlText.match(/<title>([\s\S]*?)<\/title>/i);
        let pageTitle = titleMatch ? titleMatch[1].replace(/- Chefkoch.*/i, '').trim() : "Social Media Rezept";

        let cleanText = htmlText
            .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
            .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // TUNING 1: Text auf 4.000 Zeichen begrenzen (reicht völlig für Zutaten & spart enorm Zeit)
        const finalContent = cleanText.substring(0, 4000);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ title: pageTitle, tags: "Fehler", notes: "API-Key fehlt in Vercel!" });
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        // TUNING 2: Kürzerer, direkterer Befehl für schnellere Verarbeitung
        const prompt = `Extrahiere aus dem Text: Gerichtname (als "title"), Tags (Komma-getrennt als "tags") und Zutaten (als "notes", jede Zeile mit "• "). 
        Falls keine Zutaten im Text sind, erfinde ein kurzes Rezept für "${pageTitle}".
        Antworte NUR als JSON ohne Markdown-Wrapper.
        Format: {"title": "", "tags": "", "notes": ""}
        Text: ${finalContent}`;

        const aiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const aiData = await aiResponse.json();
        
        if (aiData.error) {
            return res.status(200).json({
                title: "Google API Fehler",
                tags: "Fehler",
                notes: `Google meldet: ${aiData.error.message}`
            });
        }

        if (aiData.candidates && aiData.candidates[0].content.parts[0].text) {
            const rawText = aiData.candidates[0].content.parts[0].text.trim();
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const recipeJson = JSON.parse(jsonMatch[0]);
                return res.status(200).json(recipeJson);
            }
        }

        return res.status(200).json({ 
            title: pageTitle, 
            tags: "Fehler", 
            notes: "Formatierungsfehler der KI." 
        });

    } catch (error) {
        return res.status(200).json({ title: "Fehler", tags: "Fehler", notes: error.message });
    }
}
