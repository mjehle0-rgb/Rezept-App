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

        // 1. Speziell nach Meta-Beschreibungen suchen (Hier steht bei YT/Insta oft das Rezept!)
        let metaDescription = "";
        const descMatch = htmlText.match(/property="og:description"\s+content="([^"]+)"/i) || 
                          htmlText.match(/name="description"\s+content="([^"]+)"/i);
        if (descMatch && descMatch[1]) {
            metaDescription = descMatch[1];
        }

        // Strukturierte Daten (LD+JSON) abfangen
        let jsonLdData = "";
        const jsonLdMatches = htmlText.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
        if (jsonLdMatches) {
            jsonLdData = jsonLdMatches.map(m => m.replace(/<[^>]+>/g, '')).join(" ").substring(0, 2000);
        }

        // Titel sauber auslesen
        let pageTitle = "";
        const ogTitleMatch = htmlText.match(/property="og:title"\s+content="([^"]+)"/i) || htmlText.match(/name="title"\s+content="([^"]+)"/i);
        const standardTitleMatch = htmlText.match(/<title>([\s\S]*?)<\/title>/i);
        
        if (ogTitleMatch && ogTitleMatch[1]) {
            pageTitle = ogTitleMatch[1];
        } else if (standardTitleMatch) {
            pageTitle = standardTitleMatch[1];
        }
        
        pageTitle = pageTitle
            .replace(/- Chefkoch.*/i, '')
            .replace(/- YouTube.*/i, '')
            .replace(/YouTube/i, '')
            .trim();

        // Sichtbaren Webtext säubern
        let cleanText = htmlText
            .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
            .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Wir bauen ein klares Paket für die KI
        const finalContent = `TITEL: ${pageTitle}\nBESCHREIBUNG/INFOBOX: ${metaDescription}\nMETADATA: ${jsonLdData}\nWEBTEXT: ${cleanText}`.substring(0, 6000);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ title: pageTitle, tags: "Fehler", notes: "API-Key fehlt!" });
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        // Strengerer Prompt gegen Halluzinationen
        const prompt = `Du bist ein präziser Rezept-Extraktor. Deine Aufgabe ist es, die exakten Zutaten aus den bereitgestellten Daten zu filtern.
        
        SCHRITT-FÜR-SCHRITT-ANLEITUNG:
        1. Untersuche primär den Abschnitt "BESCHREIBUNG/INFOBOX" und "METADATA". Dort stehen bei Social Media oft die echten Zutaten.
        2. Wenn du dort oder im "WEBTEXT" konkrete Zutaten findest, liste sie sauber mit "• " auf.
        3. WICHTIG: Wenn im gesamten Text KEINE Zutaten oder Mengenangaben zu finden sind (weil die Seite blockiert ist), dann erfinde NICHT einfach blind irgendetwas! Schreibe stattdessen in die "notes":
           "• [KI-Vorschlag] Da keine Zutaten im Link gefunden wurden, hier eine Idee passend zum Titel:\\n• Zutat 1\\n• Zutat 2"
           Erfinde nur dann etwas, wenn der TITEL (${pageTitle}) ein eindeutiges Gericht beschreibt. Wenn der Titel vage ist (wie "Das hier müsst ihr sehen!!"), schreibe stattdessen: "• Keine Zutaten im Quelltext gefunden. Bitte manuell eintragen."

        REGEL FÜR TAGS:
        Nutze 2-3 kurze Küchen-Kategorien (z.B. "Pasta, Schnell"). Nutze NIEMALS Wörter wie "YouTube", "Video", "Fehler" oder "Instagram".

        Antworte AUSSCHLIESSLICH als reines JSON-Objekt ohne Markdown-Wrapper.
        Format: {"title": "${pageTitle}", "tags": "Tag1, Tag2", "notes": "• Zutat 1\\n• Zutat 2"}
        
        Hier sind die Daten:
        ${finalContent}`;

        const aiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const aiData = await aiResponse.json();

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
            tags: "Manuell", 
            notes: "• Link-Inhalt konnte nicht gelesen werden. Bitte Notizen manuell einfügen!" 
        });

    } catch (error) {
        return res.status(200).json({ title: "Fehler", tags: "Netzwerk", notes: error.message });
    }
}
