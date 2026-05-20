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
            const rawText = aiData.candidates[0].content.parts[0].text.trim();
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            return res.status(200).json(JSON.parse(jsonMatch[0]));
        } catch (error) {
            return res.status(200).json({ title: "Bild-Fehler", tags: "Vision", notes: "Screenshot konnte nicht gelesen werden." });
        }
    }

    // FALL B: Der Link-Scraper (Jetzt mit DETEKTIV-MODUS)
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

            // Der neue, motivierende Detektiv-Prompt
            const prompt = `Du bist ein brillanter Rezept-Detektiv und Daten-Analyst. Deine Aufgabe ist es, aus dem vorliegenden Datensalat ein Rezept zu extrahieren.
            
            WICHTIGE ANWEISUNGEN FÜR DEINE ANALYSE:
            1. GIB DIR MAXIMALE MÜHE: Überfliege den Text nicht nur. Suche intensiv in der "Beschreibung" und im Text nach versteckten Zutaten. Bei YouTube oder Instagram stehen Rezepte oft tief unten im Fließtext, haben keine sauberen Aufzählungszeichen oder nutzen seltsame Abkürzungen (z.B. "2EL", "n.B.", "TL").
            2. SEI KULANT BEI MENGEN: Wenn im Text Dinge wie "etwas Öl", "Salz & Pfeffer", "Knoblauch" oder "eine Handvoll Nüsse" stehen, nimm sie genau so auf! Es muss nicht immer eine exakte Gramm-Zahl dabei stehen.
            3. STRUKTUR: Formatiere alles, was du finden kannst, als saubere Liste mit "• ".
            4. ABSOLUTES ERFINDUNGSVERBOT: Du darfst NIEMALS eigene Zutaten erfinden. Was nicht im Text steht, existiert nicht. Wenn
