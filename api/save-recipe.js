export default async function handler(req, res) {
    // CORS-Header für reibungslose Frontend-Kommunikation
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

    try {
        const { id, title, link, tags, notes } = req.body || {};

        // Validierung der Mindestdaten
        if (!title) {
            return res.status(400).json({ error: 'Ein Titel wird zwingend benötigt.' });
        }

        // Unterstützt jetzt alle gängigen Framework-Präfixe (Plain, Next.js und Vite)
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            // DETEKTIV-MODUS: Wir listen die reinen Namen der Keys auf, um zu sehen, was Vercel bereitstellt
            const gefundeneKeys = Object.keys(process.env).filter(k => 
                k.includes('SUPABASE') || k.includes('VITE') || k.includes('URL') || k.includes('KEY')
            );
            
            return res.status(500).json({ 
                error: `Datenbank-Verbindung fehlgeschlagen. Gefundene Variablen-Namen auf dem Server: [${gefundeneKeys.join(', ') || 'KEINE'}]. Bitte im Vercel Dashboard abgleichen!` 
            });
        }

        let supabaseResponse;

        if (id) {
            // ==========================================
            // FALL 1: EDITIEREN (Bestehendes Rezept aktualisieren)
            // ==========================================
            supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/recipes?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ 
                    title, 
                    link: link || null, 
                    tags: tags || '', 
                    notes: notes || '' 
                })
            });
        } else {
            // ==========================================
            // FALL 2: NEUANLAGE (Frisches Rezept einspeisen)
            // ==========================================
            supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/recipes`, {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify([{ 
                    title, 
                    link: link || null, 
                    tags: tags || '', 
                    notes: notes || '' 
                }])
            });
        }

        // Fehlerbehandlung für das Datenbank-Feedback
        if (!supabaseResponse.ok) {
            const dbErrorText = await supabaseResponse.text();
            throw new Error(`Supabase-Fehler: ${supabaseResponse.status} - ${dbErrorText}`);
        }

        const responseData = await supabaseResponse.json();

        return res.status(200).json({ 
            success: true, 
            message: id ? 'Rezept erfolgreich aktualisiert!' : 'Rezept erfolgreich erstellt!',
            data: responseData 
        });

    } catch (globalError) {
        console.error("Fehler in save-recipe API:", globalError);
        return res.status(500).json({ error: globalError.message });
    }
}
