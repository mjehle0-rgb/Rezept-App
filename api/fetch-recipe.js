export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Keine URL übergeben' });

    try {
        // Wir täuschen einen echten, modernen Browser vor, um Cookie-Wände zu minimieren
        const response = await fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        
        const htmlText = await response.text();

        // Radikale Reinigung: Wir filtern gezielt nach Metadaten, Titeln und Beschreibungen,
        // um den Cookie-Müll von YouTube/Instagram direkt zu umschiffen.
        const titleMatch = htmlText.match(/<title>([\s\S]*?)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1] : "Social Media Rezept";
        
        // Wir nehmen alles, was nach Beschreibungstexten aussieht
        const metaDescription = htmlText.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
        const ogDescription = htmlText.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i);
        
        let extractedText = `Seitentitel: ${pageTitle}\n`;
        if (metaDescription) extractedText += `Beschreibung 1: ${metaDescription[1]}\n`;
        if (ogDescription) extractedText += `Beschreibung 2: ${ogDescription[1]}\n`;
        
        // Den Rest des HTMLs stark komprimiert anhängen (falls dort Zutaten stehen)
        extractedText += htmlText.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
                                 .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
                                 .replace(/<[^>]+>/g, ' ') // Alle HTML-Tags entfernen, nur Text behalten
                                 .substring(0, 15000);

        const apiKey = process.env.GEMINI_API_KEY;
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const prompt = `Du bist ein KI-Küchenchef. Analysiere den folgenden extrahierten Text einer Social-Media-Plattform (wie YouTube, Instagram oder TikTok).
        Versuche den echten Namen des Gerichts, passende Tags (Komma-getrennt) und alle erwähnten Zutaten mit Mengenangaben zu finden.
        Falls du im Text Anzeichen für eine Cookie-Sperre oder ein Login-Banner findest (z.B. "Bevor Sie zu YouTube weitergehen", "Anmeldung", "Cookie"), ignoriere das und versuche dennoch, aus den restlichen Fragmenten das Rezept zu erraten oder nutze den Seitentitel als Rezeptnamen.
        
        Antworte AUSSCHLIESSLICH als JSON-Objekt in exakt diesem Format:
        {
          "title": "Name des Gerichts",
          "tags": "Pasta, Schnell",
          "notes": "• Zutat 1\\n• Zutat 2"
        }
        Hier ist der Text:\n${extractedText}`;

        const aiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const aiData = await aiResponse.json();
        const rawText = aiData.candidates[0].content.parts[0].text;
        
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const recipeJson = JSON.parse(jsonMatch[0]);

        return res.status(200).json(recipeJson);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Magie fehlgeschlagen: ' + error.message });
    }
}
