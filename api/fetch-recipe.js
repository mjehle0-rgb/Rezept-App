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

        const finalContent = cleanText.substring(0, 8000);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ title: pageTitle, tags: "Fehler", notes: "API-Key fehlt in Vercel!" });
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        // Wir fordern das JSON jetzt direkt im Text an und geben das exakte Schema dort vor
        const prompt = `Du bist ein präziser Küchenchef. Analysiere den folgenden Text und extrahiere den Namen des Gerichts, Tags (Komma-getrennt) und die Zutaten als Aufzählung mit "•".
        Falls im Text keine klaren Zutaten stehen, improvisiere ein kurzes, leckeres Rezept passend zum Namen "${pageTitle}".
        
        Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt. Verwende KEINE Markdown-Formatierung wie \`\`\`json oder ähnliches. Dein Antwort-String muss direkt mit { beginnen und mit } enden.
        
        Format-Vorlage:
        {
          "title": "Name des Gerichts",
          "tags": "Pasta, Schnell",
          "notes": "• Zutat 1\\n• Zutat 2"
        }
        
        Hier ist der Text der Webseite:
        ${finalContent}`;

        const aiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
                // generationConfig komplett bereinigt, um Inkompatibilitäten zu vermeiden
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
            
            // Falls die KI trotz Verbot doch Markdown-Codeblöcke mitgeliefert hat, schneiden wir sie hier sicherheitshalber raus
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const recipeJson = JSON.parse(jsonMatch[0]);
                return res.status(200).json(recipeJson);
            }
        }

        return res.status(200).json({ 
            title: pageTitle, 
            tags: "Fehler", 
            notes: "Die KI hat geantwortet, aber das Format war nicht lesbar." 
        });

    } catch (error) {
        return res.status(200).json({ title: "Fehler", tags: "Fehler", notes: error.message });
    }
}
