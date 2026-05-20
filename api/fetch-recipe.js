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

        const titleMatch = htmlText.match(/<title>([\s\S]*?)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1].trim() : "Social Media Rezept";

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ title: "Fehler", notes: "API-Key fehlt in Vercel!" });
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const prompt = `Extrahiere Gerichtname, Tags (Komma-getrennt) und Zutaten als valides JSON:
        {"title": "Name", "tags": "Pasta, Schnell", "notes": "• Zutat 1\\n• Zutat 2"}
        Text: ${htmlText.substring(0, 10000)}`;

        const aiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const aiData = await aiResponse.json();
        
        if (!aiData.candidates || !aiData.candidates[0].content.parts[0].text) {
            return res.status(200).json({ title: pageTitle, tags: "Import", notes: "KI konnte Text nicht auswerten." });
        }

        const rawText = aiData.candidates[0].content.parts[0].text;
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const recipeJson = JSON.parse(jsonMatch[0]);
            return res.status(200).json(recipeJson);
        }

        return res.status(200).json({ title: pageTitle, tags: "Import", notes: "Zutaten konntest du im Video sehen!" });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
