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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'de-DE,de;q=0.9'
            }
        });
        const htmlText = await response.text();

        // Titel isolieren
        const titleMatch = htmlText.match(/<title>([\s\S]*?)<\/title>/i);
        let pageTitle = titleMatch ? titleMatch[1].replace(/- Chefkoch.*/i, '').trim() : "Social Media Rezept";

        // HTML restlos säubern
        let cleanText = htmlText
            .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
            .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const finalContent = cleanText.substring(0, 10000);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ title: pageTitle, tags: "Fehler", notes: "API-Key fehlt in Vercel!" });
        }

        // Wir rufen das neuere Gemini 2.5 Flash Modell auf
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const prompt = `Du bist ein präziser Küchenchef. Analysiere den folgenden Text einer Webseite und extrahiere:
        1. Den Namen des Gerichts (bzw. optimiere den Titel "${pageTitle}").
        2. Passende Tags als Komma-getrennter Text.
        3. Die Zutatenliste als übersichtliche Aufzählung mit "•".
        
        WICHTIG: Falls im Text KEINE Zutaten zu finden sind (weil es eine Login-Sperre gibt), improvisiere ein kurzes, leckeres Standardrezept basierend auf dem Namen "${pageTitle}", damit der Nutzer auf jeden Fall eine Basis hat!
        
        Du musst im angeforderten JSON-Format antworten. Keine Markdown-Wrapper!`;

        const aiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt + "\n\nText:\n" + finalContent }] }],
                // HIER IST DER TRICK: Wir zwingen Gemini, pures JSON auszugeben
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
        
        // Wenn die KI geantwortet hat, parsen wir das garantiert saubere JSON direkt
        if (aiData.candidates && aiData.candidates[0].content.parts[0].text) {
            const rawJsonText = aiData.candidates[0].content.parts[0].text.trim();
            const recipeJson = JSON.parse(rawJsonText);
            return res.status(200).json(recipeJson);
        }

        throw new Error("Keine Antwort von der KI-Schnittstelle.");

    } catch (error) {
        console.error(error);
        // Fallback, falls irgendwas komplett schiefgeht – so stürzt die App niemals ab
        return res.status(200).json({ 
            title: "Automatisches Rezept", 
            tags: "Fehler", 
            notes: `⚠️ Fehler bei der KI-Verarbeitung: ${error.message}\n\nDu kannst die Zutaten hier einfach per Hand eintragen!` 
        });
    }
}
