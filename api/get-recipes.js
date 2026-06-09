export default async function handler(req, res) {
    const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (req.method === 'GET') {
        try {
            const response = await fetch(`${supabaseUrl}/rest/v1/recipes?order=created_at.desc`, {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                }
            });
            if (!response.ok) {
                throw new Error(`Supabase antwortete mit Status ${response.status}`);
            }
            const data = await response.json();
            return res.status(200).json(data);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'DELETE') {
        const { id } = req.body;
        try {
            const response = await fetch(`${supabaseUrl}/rest/v1/recipes?id=eq.${id}`, {
                method: 'DELETE',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                }
            });
            if (!response.ok) {
                throw new Error(`Supabase antwortete mit Status ${response.status}`);
            }
            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt' });
}
