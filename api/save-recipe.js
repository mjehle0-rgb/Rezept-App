export default async function handler(req, res) {
    // CORS-Header für reibungslose Frontend-Kommunikation
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

    try {
        const { id, title, link, tags, notes } = req.body || {};

        console.log("📝 save-recipe aufgerufen:", { id, title, link, tags, notes });

        // Validierung der Mindestdaten
        if (!title) {
            return res.status(400).json({ error: 'Ein Titel wird zwingend benötigt.' });
        }

        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        console.log("🔐 Supabase Config vorhanden:", { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({ error: 'Datenbank-Verbindung fehlgeschlagen.' });
        }

        // ==========================================
        // FORMAT-FIX: Tags immer als sauberes Array für Supabase aufbereiten
        // ==========================================
        let formattedTags = [];
        if (Array.isArray(tags)) {
            formattedTags = tags; // Es ist bereits ein Array (z.B. ["Video", "Fleisch"])
        } else if (typeof tags === 'string' && tags.trim() !== '') {
            // Es ist ein Text (z.B. "Video" oder "Video, Fleisch"). Wir machen ein Array draus.
            formattedTags = tags.split(',').map(t => t.trim());
        }

        console.log("📋 Formatierte Tags:", formattedTags);

        let supabaseResponse;
        const payload = { 
            title, 
            link: link || null, 
            tags: formattedTags, 
            notes: notes || null 
        };

        if (id) {
            // FALL 1: EDITIEREN (Bestehendes Rezept aktualisieren)
            console.log("✏️  UPDATE-Mode für ID:", id);
            supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/recipes?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(payload)
            });
        } else {
            // FALL 2: NEUANLAGE (Frisches Rezept einspeisen)
            console.log("➕ CREATE-Mode - neues Rezept");
            supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/recipes`, {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(payload)
            });
        }

        console.log("🔄 Supabase Response Status:", supabaseResponse.status);

        // Fehlerbehandlung für das Datenbank-Feedback
        if (!supabaseResponse.ok) {
            const dbErrorText = await supabaseResponse.text();
            console.error("❌ Supabase-Fehler:", dbErrorText);
            throw new Error(`Supabase-Fehler: ${supabaseResponse.status} - ${dbErrorText}`);
        }

        const responseData = await supabaseResponse.json();
        console.log("✅ Supabase Response:", responseData);

        return res.status(200).json({ 
            success: true, 
            message: id ? 'Rezept erfolgreich aktualisiert!' : 'Rezept erfolgreich erstellt!',
            data: responseData 
        });

    } catch (globalError) {
        console.error("❌ Fehler in save-recipe API:", globalError);
        return res.status(500).json({ error: globalError.message });
    }
}
