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

    // FALL A: Ein Screenshot wurde hochgeladen
    if (image) {
        try {
            // Base64-Präfix abschneiden falls vorhanden
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            const prompt = `Du bist ein präziser Rezept-Extraktor. Analysiere diesen Screenshot einer Rezept-Infobox/Videobeschreibung.
            1. "title": Finde den Namen des Gerichts (z.B. "KFC Style Fried Austernpilze"). Befreie ihn von Emojis.
            2. "tags": Generiere 2-3 passende Küchen-Kategorien (z.B. "Vegan, Snack, Pilze"). Verwende NIEMALS Plattformnamen wie 'YouTube'.
            3. "notes": Lies ALLE sichtbaren Zutaten und Mengen extrem präzise ab und liste sie mit "• " auf. Da das Bild unten abgeschnitten sein kann ("Mehr anzeigen"), liste nur das auf, was du glasklar siehst!

            Antworte NUR als reines JSON-Objekt ohne Markdown-Wrapper.
            Format: {"title": "Name", "tags": "Tag1, Tag2", "notes": "• 2 große Austernpilz-Cluster\\n• ... "}`;

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
            return res.status(200).json({ title: "Bild-Fehler", tags: "Vision", notes: "Screenshot-Analyse fehlgeschlagen." });
        }
    }

    // FALL B: Der klassische Link-Scraper (Bleibt wie gehabt als Backup)
    if (url) {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            const htmlText = await response.text();
            
            let metaDescription = "";
            const descMatch = htmlText.match(/property="og:description"\s+content="([^"]+)"/i) || htmlText.match(/name="description"\s+content="([^"]+)"/i);
            if (descMatch) metaDescription = descMatch[1];

            let pageTitle = "Kulinarische Entdeckung";
            const titleMatch = htmlText.match(/property="og:title"\s+content="([^"]+)"/i) || htmlText.match(/<title>([\s\S]*?)<\/title>/i);
            if (titleMatch) pageTitle = titleMatch[1].replace(/- YouTube.*/i, '').trim();

            const prompt = `Extrahiere das Rezept aus diesen Daten. Falls keine Zutaten zu finden sind, liefere einen passenden [KI-Vorschlag] basierend auf dem Titel.
            Format: {"title": "${pageTitle}", "tags": "Pasta", "notes": "• ..."}
            Daten:\nTitel: ${pageTitle}\nBeschreibung: ${metaDescription}`;

            const aiResponse = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const aiData = await aiResponse.json();
            const jsonMatch = aiData.candidates[0].content.parts[0].text.trim().match(/\{[\s\S]*\}/);
            return res.status(200).json(JSON.parse(jsonMatch[0]));
        } catch (e) {
            return res.status(200).json({ title: "Fehler", tags: "Mangelhaft", notes: "Konnte Link nicht lesen." });
        }
    }

    return res.status(400).json({ error: 'Keine Daten geliefert' });
}
