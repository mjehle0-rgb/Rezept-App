export default async function handler(req, res) {
    // CORS-Header sofort setzen, damit der Browser immer mit uns reden darf
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

    // HIER STARTET DAS GLOBALE SICHERHEITSNETZ
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
                const prompt = `Du bist ein präziser Rezept-Extraktor. Analysiere diesen Screenshot.
                1. "title": Name des Gerichts ohne Emojis.
                2. "tags": 2-3 kurze Küchen-Kategorien. Niemals Plattformnamen.
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
                
                if (aiData.candidates && aiData.candidates[0]?.content?.parts[0]?.text) {
                    const rawText = aiData.candidates[0].content.parts[0].text.trim();
                    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        return res.status(200).json(JSON.parse(jsonMatch[0]));
                    }
                }
                throw new Error("KI lieferte kein gültiges JSON.");
