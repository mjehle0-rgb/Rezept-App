export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

    const { title, link, tags, notes } = req.body;
    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t !== "") : [];

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY;

        const response = await fetch(`${supabaseUrl}/rest/v1/recipes`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                title: title,
                link: link,
                tags: tagsArray,
                notes: notes
            })
        });

        const data = await response.json();
        return res.status(200).json(data[0]);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
