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

        // 1. SCHRITT: Seitentitel auslesen
        const titleMatch = htmlText.match(/<title>([\s\S]*?)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1].replace(/- Chefkoch.*/i, '').trim() : "Social Media Rezept";

        // 2. SCHRITT: Radikale Reinigung des HTML-Codes
        let cleanText = htmlText
            .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '') // Skripte löschen
            .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')   // CSS-Styles löschen
            .replace(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi, '')
            .replace(/<header[\s\S]*?<\/header>/gi, '')         // Menüs/Header löschen
            .replace(/<footer[\s\S]*?<\/footer>/gi, '')         // Fußzeilen löschen
            .replace(/<[^>]+>/g, ' ')                           // Alle restlichen HTML-Tags durch Leerzeichen ersetzen
            .replace(/\s+/g, ' ')                               // Mehrfach-Leerzeichen und Umbrüche kollabieren
            .trim();

        // Jetzt nehmen wir die ersten 15.000 Zeichen des REINEN Textes (das ist riesig ohne HTML!)
        const finalContent = cleanText.substring(0, 15000);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ title: pageTitle, notes: "Fehler: API-Key fehlt in Vercel!" });
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        // Wir sagen der KI ganz deutlich, dass sie den Text durchforsten soll
        const prompt = `Du bist ein präziser Küchenchef-Assistent. Analysiere den folgenden bereinigten Text einer Webseite.
        Suche nach Kochzutaten, Mengenangaben und Zubereitungsschritten.
        
        Erstelle daraus ein strukturiertes Rezept. Falls du keine klaren Zutaten findest, improvisiere ein kurzes, passendes Standardrezept basierend auf dem Namen des Gerichts "${pageTitle}".
        
        Antworte AUSSCHLIESSLICH als gültiges JSON-Objekt in exakt diesem Format (ohne Markdown-Formatierung wie \`\`\`json):
        {
          "title": "${pageTitle}",
          "tags": "Pasta, Schnell",
          "notes": "• Zutat 1\\n• Zutat 2"
        }
        
        Hier ist der bereinigte Text der Webseite:
        ${finalContent}`;

        const aiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const aiData = await aiResponse.json();
        
        if (!aiData.candidates || !aiData.candidates[0].content.parts[0].text) {
            return res.status(200).json({ title: pageTitle, tags: "Import", notes: "Keine Zutaten im Text gefunden." });
        }

        const rawText = aiData.candidates[0].content.parts[0].text;
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const recipeJson = JSON.parse(jsonMatch[0]);
            return res.status(200).json(recipeJson);
        }

        return res.status(200).json({ title: pageTitle, tags: "Import", notes: "Rezept konnte nicht strukturiert werden." });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
