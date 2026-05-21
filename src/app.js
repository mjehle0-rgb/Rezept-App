// ==========================================
// GLOBALE VARIABLEN & APP STATE
// ==========================================
let allRecipes = [];       // Speichert permanent alle Rezepte aus Supabase
let activeFilterTag = null; // Merkt sich die aktuell gewählte Kategorie-Pill

// Supabase-Konfiguration (Vite-Style)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// App-Start
document.addEventListener('DOMContentLoaded', () => {
    loadRecipesFromSupabase();
});

// ==========================================
// 1. REZEPTE AUS SUPABASE LASSEN
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
        
        // UI rendern
        renderFilterBar();
        applyFilterAndSearch();

    } catch (error) {
        console.error('Datenbank-Fehler:', error);
        const container = document.getElementById('recipes-container');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-8 text-red-500 font-medium">
                    Fehler beim Laden der Rezepte. Bitte Verbindung prüfen.
                </div>`;
        }
    }
}

// ==========================================
// 2. FILTERBAR GENERIEREN (REPARIERT)
// ==========================================
function renderFilterBar() {
    const filterContainer = document.getElementById('filter-container');
    if (!filterContainer) return;

    // Alle einzigartigen Tags sammeln
    const tagsSet = new Set();
    allRecipes.forEach(recipe => {
        if (Array.isArray(recipe.tags)) {
            recipe.tags.forEach(tag => {
                if (tag && tag.trim() !== '') tagsSet.add(tag.trim());
            });
        }
    });
    
    const sortedTags = Array.from(tagsSet).sort();

    // HTML für Buttons aufbauen (Der Fehler am Zeilenende wurde entfernt!)
    let filterHtml = `
        <button onclick="setFilterTag(null)" class="px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 snap-start shrink-0 cursor-pointer shadow-xs
            ${!activeFilterTag 
                ? 'bg-amber-600 text-white shadow-sm scale-105 font-bold' 
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-200'}">
            Alle 🍽️
        </button>
    `;

    sortedTags.forEach(tag => {
        const isActive = activeFilterTag === tag;
        filterHtml += `
            <button onclick="setFilterTag('${tag}')" class="px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 snap-start shrink-0 cursor-pointer shadow-xs
                ${isActive 
                    ? 'bg-amber-600 text-white shadow-sm scale-105 font-bold' 
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-200'}">
                ${tag}
            </button>
        `;
    });

    filterContainer.innerHTML = filterHtml;
}

// ==========================================
// 3. EVENT-STEUERUNG FÜR FILTER & SUCHE
// ==========================================
window.setFilterTag = function(tag) {
    activeFilterTag = (activeFilterTag === tag) ? null : tag;
    renderFilterBar();
    applyFilterAndSearch();
};

window.handleSearchOrFilterChange = function() {
    applyFilterAndSearch();
};

function applyFilterAndSearch() {
    const searchInput = document.getElementById('search-input');
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filteredRecipes = allRecipes.filter(recipe => {
        const matchesTag = !activeFilterTag || (Array.isArray(recipe.tags) && recipe.tags.includes(activeFilterTag));
        const matchesSearch = !searchQuery || 
            recipe.title.toLowerCase().includes(searchQuery) || 
            (recipe.notes && recipe.notes.toLowerCase().includes(searchQuery));

        return matchesTag && matchesSearch;
    });

    renderRecipeGrid(filteredRecipes);
}

// ==========================================
// 4. REZEPTE INS GRID ZEICHNEN
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

// Dummy-Definition für dein bestehendes Modal
window.openRecipeModal = function() {
    alert("Modal wird geöffnet (Verknüpfe hier deine bestehende Modal-Funktion!)");
};
