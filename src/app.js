// ==========================================
// ZUSTANDSMANAGEMENT (APP STATE)
// ==========================================
let allRecipes = [];       // Speichert permanent alle Rezepte aus Supabase
let activeFilterTag = null; // Merkt sich die aktuell gewählte Kategorie-Pill

// Supabase-Konfiguration (Greift auf deine Frontend-Variablen zu)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ==========================================
// INITIALISIERUNG BEIM APP-START
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadRecipesFromSupabase();
});

// ==========================================
// DATEN AUS SUPABASE LADEN
// ==========================================
async function loadRecipesFromSupabase() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/recipes?select=*`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error('Fehler beim Abrufen der Rezepte');
        
        allRecipes = await response.json();
        
        // Rezeptliste und Filterleiste initial zeichnen
        renderFilterBar();
        applyFilterAndSearch();

    } catch (error) {
        console.error('Datenbank-Fehler:', error);
        document.getElementById('recipes-container').innerHTML = `
            <div class="text-center py-8 text-red-500 font-medium">
                Fehler beim Laden der Rezepte. Bitte Verbindung prüfen.
            </div>`;
    }
}

// ==========================================
// UX: FILTERBAR DYNAMISCH GENERIEREN
// ==========================================
function renderFilterBar() {
    const filterContainer = document.getElementById('filter-container');
    if (!filterContainer) return;

    // 1. Alle einzigartigen Tags aus allen Rezepten herausfiltern
    const tagsSet = new Set();
    allRecipes.forEach(recipe => {
        if (Array.isArray(recipe.tags)) {
            recipe.tags.forEach(tag => {
                if (tag && tag.trim() !== '') tagsSet.add(tag.trim());
            });
        }
    });
    
    // Sortieren für eine saubere Alphabet-Reihenfolge
    const sortedTags = Array.from(tagsSet).sort();

    // 2. HTML für Buttons aufbauen - Startet mit dem "Alle"-Button
    let filterHtml = `
        <button onclick="setFilterTag(null)" class="px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 snap-start shrink-0 cursor-pointer shadow-xs
            ${!activeFilterTag 
                ? 'bg-amber-600 text-white shadow-sm scale-105 font-bold' 
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50' Gold}'}">
            Alle 🍽️
        </button>
    `;

    // 3. Jedes Tag als eigenständige Pill anfügen
    sortedTags.forEach(tag => {
        const isActive = activeFilterTag === tag;
        filterHtml += `
            <button onclick="setFilterTag('${tag}')" class="px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 snap-start shrink-0 cursor-pointer shadow-xs
                ${isActive 
                    ? 'bg-amber-600 text-white shadow-sm scale-105 font-bold' 
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}">
                ${tag}
            </button>
        `;
    });

    filterContainer.innerHTML = filterHtml;
}

// ==========================================
// FILTER-KLICK STEUERUNG
// ==========================================
window.setFilterTag = function(tag) {
    // Wenn man auf das bereits aktive Tag klickt, wird der Filter zurückgesetzt
    activeFilterTag = (activeFilterTag === tag) ? null : tag;
    
    // Filterleiste neu einfärben & Rezepte filtern
    renderFilterBar();
    applyFilterAndSearch();
};

// Wird aufgerufen, wenn im Suchfeld getippt wird
window.handleSearchOrFilterChange = function() {
    applyFilterAndSearch();
};

// ==========================================
// DIE FILTER- ENGINE (Kombination aus Tag + Suche)
// ==========================================
function applyFilterAndSearch() {
    const searchInput = document.getElementById('search-input');
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filteredRecipes = allRecipes.filter(recipe => {
        // 1. Tag-Match prüfen
        const matchesTag = !activeFilterTag || (Array.isArray(recipe.tags) && recipe.tags.includes(activeFilterTag));
        
        // 2. Suchbegriff-Match prüfen (Titel, Notizen oder Tags)
        const matchesSearch = !searchQuery || 
            recipe.title.toLowerCase().includes(searchQuery) || 
            (recipe.notes && recipe.notes.toLowerCase().includes(searchQuery)) ||
            (Array.isArray(recipe.tags) && recipe.tags.some(t => t.toLowerCase().includes(searchInput)));

        return matchesTag && matchesSearch;
    });

    renderRecipeGrid(filteredRecipes);
}

// ==========================================
// REZEPTE INS GRID ZEICHNEN
// ==========================================
function renderRecipeGrid(recipesToRender) {
    const container = document.getElementById('recipes-container');
    if (!container) return;

    container.innerHTML = '';

    if (recipesToRender.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 p-6">
                <p class="text-gray-400 text-sm">Keine passenden Rezepte gefunden.</p>
            </div>`;
        return;
    }

    recipesToRender.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl shadow-xs border border-gray-100 p-4 relative hover:shadow-md transition-all duration-200';
        
        // Generiere kleine Mini-Tags für die Unterseite der Karte
        let tagsHtml = '';
        if (Array.isArray(recipe.tags)) {
            recipe.tags.forEach(t => {
                if(t) tagsHtml += `<span class="bg-gray-50 text-gray-500 text-[10px] px-2 py-0.5 rounded-md font-medium">#${t}</span>`;
            });
        }

        card.innerHTML = `
            <div class="pr-8">
                <h3 class="font-bold text-gray-800 text-base leading-tight">${recipe.title}</h3>
                ${recipe.link ? `<a href="${recipe.link}" target="_blank" class="text-xs text-amber-600 hover:underline inline-flex items-center gap-0.5 mt-1 break-all">${recipe.link}</a>` : ''}
                ${recipe.notes ? `<p class="text-xs text-gray-500 mt-2 line-clamp-3 bg-gray-50/50 p-2 rounded-xl border border-gray-100">${recipe.notes}</p>` : ''}
            </div>
            <div class="flex flex-wrap gap-1 mt-3">
                ${tagsHtml}
            </div>
        `;
        container.appendChild(card);
    });
}

// Dummy-Funktion für Neuanlage-Button im Header
window.openRecipeModal = function() {
    alert("Hier öffnet sich dein Erstellungs-Modal!");
};
