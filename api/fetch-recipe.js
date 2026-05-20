export default async function handler(req, res) {
    // CORS-Header setzen, damit dein Handy-Browser zugreifen darf
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Methode nicht erlaubt' });
    }

    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Keine URL übergeben' });
    }

    try {
        // 1. SCHRITT: Den Text der Social-Media-Webseite abrufen
        // Hinweis: Bei stark geschützten Profilen (Instagram/TikTok Login-Walls) ziehen wir hier das Beste raus.
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const htmlText = await response.text();

        // Wir schneiden grob den HTML-Ballast ab, um die KI nicht zu überfordern
        const cleanText = htmlText.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '').replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '').substring(0, 50000);

        // 2. SCHRITT: Die Gemini-KI nach den Zutaten fragen
        const apiKey = process.env.GEMINI_API_KEY;
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const prompt = `Du bist ein genialer Küchenchef. Analysiere das folgende HTML / den Text einer Social-Media-Kochseite. 
        Extrahiere den Namen des Gerichts, passende Tags (Komma-getrennt) und die Zutatenliste mit Mengenangaben.
        Antworte AUSSCHLIESSLICH als JSON-Objekt in exakt diesem Format:
        {
          "title": "Name des Gerichts",
          "tags": "Pasta, Schnell, Vegetarisch",
          "notes": "• Zutatenliste hier untereinander weg..."
        }
        Hier ist der Text: ${cleanText}`;

        const aiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const aiData = await aiResponse.json();
        const rawText = aiData.candidates[0].content.parts[0].text;
        
        // Das JSON aus der KI-Antwort sauber isolieren (falls Markdown-Wrapper drumherum sind)
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const recipeJson = JSON.parse(jsonMatch[0]);

        return res.status(200).json(recipeJson);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Magie fehlgeschlagen: ' + error.message });
    }
}
