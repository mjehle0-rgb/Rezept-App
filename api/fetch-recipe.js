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
            .replace(/<style[^>]*>([\s\S]*?)<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const finalContent = cleanText.substring(0, 8000);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ title: pageTitle, tags: "Fehler", notes: "API-Key fehlt in Vercel!" });
        }

        // UMSCHALTUNG AUF DAS HOCHKOMPATIBLE GEMINI 1.5 FLASH MODELL
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const prompt = `Du bist ein präziser Küchenchef. Analysiere den folgenden Text und extrahiere den Namen des Gerichts, Tags (Komma-getrennt) und die Zutaten als Aufzählung mit "•". 
        Antworte im JSON-Format mit den Feldern "title", "tags" und "notes". Text: ${finalContent}`;

        const aiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            title: { type: "STRING" },
                            tags: { type: "STRING" },
                            notes: { type: "STRING" }
                        },
                        required: ["title", "tags", "notes"]
                    }
                }
            })
        });

        const aiData = await aiResponse.json();
        
        // HIER LOGGEN WIR DEN FEHLER, FALLS GOOGLE MECKERT
        if (aiData.error) {
            return res.status(200).json({
                title: "Google API Fehler",
                tags: "Fehler",
                notes: `Google meldet: ${aiData.error.message}\nCode: ${aiData.error.code}\nStatus: ${aiData.error.status}`
            });
        }

        if (aiData.candidates && aiData.candidates[0].content.parts[0].text) {
            const recipeJson = JSON.parse(aiData.candidates[0].content.parts[0].text.trim());
            return res.status(200).json(recipeJson);
        }

        return res.status(200).json({ 
            title: pageTitle, 
            tags: "Fehler", 
            notes: `Unerwartete Antwortstruktur von Google:\n${JSON.stringify(aiData).substring(0, 300)}` 
        });

    } catch (error) {
        return res.status(200).json({ title: "Fehler", tags: "Fehler", notes: error.message });
    }
}
