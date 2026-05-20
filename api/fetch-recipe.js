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
                'Accept-Language': 'de-DE,de;q=0.9',
                'Cache-Control': 'no-cache'
            }
        });
        const htmlText = await response.text();

        // UPGRADE 1: Strukturierte Rezept-Daten (LD+JSON) abfangen
        // Viele Blogs und YouTube-Seiten verstecken hier den exakten Text/Titel
        let jsonLdData = "";
        const jsonLdMatches = htmlText.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
        if (jsonLdMatches) {
            // Wir kratzen die ersten 3000 Zeichen der versteckten Metadaten zusammen
            jsonLdData = jsonLdMatches.map(m => m.replace(/<[^>]+>/g, '')).join(" ").substring(0, 3000);
        }

        // Besseren Seitentitel auslesen (Metatags einbeziehen für YouTube/Social Media)
        let pageTitle = "";
        const ogTitleMatch = htmlText.match(/property="og:title"\s+content="([^"]+)"/i) || htmlText.match(/name="title"\s+content="([^"]+)"/i);
        const standardTitleMatch = htmlText.match(/<title>([\s\S]*?)<\/title>/i);
        
        if (ogTitleMatch && ogTitleMatch[1]) {
            pageTitle = ogTitleMatch[1];
        } else if (standardTitleMatch) {
            pageTitle = standardTitleMatch[1];
        }
        
        // Titel von typischem Plattform-Müll befreien
        pageTitle = pageTitle
            .replace(/- Chefkoch.*/i, '')
            .replace(/- YouTube.*/i, '')
            .replace(/YouTube/i, '')
            .trim();

        if (!pageTitle || pageTitle.length < 3) pageTitle = "Kulinarische Entdeckung";

        // Webseitensalat säubern
        let cleanText = htmlText
            .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
            .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Wir packen die echten Metadaten UND den sichtbaren Text zusammen
        const finalContent = `METADATA: ${jsonLdData} \n\n WEBTEXT: ${cleanText}`.substring(0, 5000);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ title: pageTitle, tags: "Fehler", notes: "API-Key fehlt!" });
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        // UPGRADE 2: Ein glasklarer, strenger Prompt für maximale Kreativität
        const prompt = `Du bist ein genialer, kreativer Sternekoch und UX-Datenanalyst. Deine Aufgabe ist es, aus dem folgenden Datensalat einer Webseite ein perfektes Rezept zu bauen.
        
        Schau zuerst in den "METADATA" nach versteckten Rezepten (Recipe, description, video details). Falls dort nichts ist, scanne den "WEBTEXT".
        
        WICHTIGE REGELN FÜR KREATIVITÄT & STRUKTUR:
        1. "title": Nutze einen appetitlichen, prägnanten Namen für das Gericht (z.B. "Knusprige Smash Burger" statt "Mein schnelles Rezept am Sonntag!"). Aktueller Titel-Hinweis: "${pageTitle}".
        2. "tags": Generiere 2 bis 4 extrem treffende, smarte Küchen-Tags (z.B. "Soulfood, 15min, LowCarb" oder "Backen, Klassiker"). Benutze NIEMALS plumpe Tags wie "YouTube", "Fehler", "Video" oder den Namen der Webseite!
        3. "notes": Extrahiere alle Zutaten mit exakten Mengenangaben als saubere Liste mit "• ". 
           FALLS du im Text absolut keine Zutaten findest (weil die Seite blockiert war), schau dir den Titel "${pageTitle}" an und KREIERE selbstständig ein fantastisches, realistisches und extrem leckeres Rezept inklusive Mengenangaben, das perfekt zu diesem Titel passt! Lass den Nutzer niemals mit einer leeren Maske zurück.

        Antworte AUSSCHLIESSLICH als reines JSON-Objekt ohne jegliche Markdown-Ummantelung.
        Format-Vorlage: {"title": "Name", "tags": "Tag1, Tag2", "notes": "• 250g Pasta\\n• 1 Prise Salz"}
        
        Hier sind die Daten der Webseite:
        ${finalContent}`;

        const aiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const aiData = await aiResponse.json();
        
        if (aiData.error) {
            return res.status(200).json({
                title: pageTitle,
                tags: "Timeout",
                notes: `Google meldet: ${aiData.error.message}`
            });
        }

        if (aiData.candidates && aiData.candidates[0].content.parts[0].text) {
            const rawText = aiData.candidates[0].content.parts[0].text.trim();
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const recipeJson = JSON.parse(jsonMatch[0]);
                return res.status(200).json(recipeJson);
            }
        }

        return res.status(200).json({ 
            title: pageTitle, 
            tags: "Kreativ-Modus", 
            notes: "• Zutaten konnten nicht automatisch extrahiert werden.\n Bitte trage deine Notizen hier manuell ein!" 
        });

    } catch (error) {
        return res.status(200).json({ title: "Fehler", tags: "Netzwerk", notes: error.message });
    }
}
