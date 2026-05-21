// ==========================================
// CENTRAL APP STATE
// ==========================================
let allRecipes = [];        // Daten-Backup aus Supabase
let activeFilterTag = null;  // Aktive Filter-Pill

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Startschuss bei Seitenlade-Event
document.addEventListener('DOMContentLoaded', () => {
    loadRecipes();
    
    // Suchfeld-Listener für flüssige Live-Echtzeitsuche
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', applyFilterAndSearch);
    }
});

// ==========================================
// API-AKTIONEN (FETCH & PUSH)
// ==========================================

// 1. Rezepte aus Supabase laden
async function loadRecipes() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/recipes?select=*`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) throw new Error('Download fehlgeschlagen');
        
        allRecipes = await response.json();
        
        renderFilterBar();
        applyFilterAndSearch();
    } catch (err) {
        console.error(err);
        document.getElementById('recipes-container').innerHTML = `<p class="text-center text-red-500 py-6">Fehler beim Laden der Datenbank.</p>`;
    }
}

// 2. Rezept speichern (über deine gefixte Backend-Route)
window.handleFormSubmit = async function(event) {
    event.preventDefault();
    
    const id = document.getElementById('recipe-id').value;
    const title = document.getElementById('form-title').value;
    const link = document.getElementById('form-link').value;
    const tags = document.getElementById('form-tags').value; // Kommt als String, Backend spaltet es auf!
    const notes = document.getElementById('form-notes').value;

    try {
        const response = await fetch('/api/save-recipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id || null, title, link, tags, notes })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Fehler beim Speichern');

        closeModal();
        loadRecipes(); // Liste erfrischen
    } catch (err) {
        alert("Speicherfehler: " + err.message);
    }
};

// ==========================================
// FILTERS-LOGIK & RENDER ENGINE
// ==========================================

// Baut die wischbare Pill-Filterbar oben auf
function renderFilterBar() {
    const filterContainer = document.getElementById('filter-container');
    if (!filterContainer) return;

    const tagsSet = new Set();
    allRecipes.forEach(r => {
        if (Array.isArray(r.tags)) {
            r.tags.forEach(t => { if(t && t.trim() !== '') tagsSet.add(t.trim()); });
        }
    });
    const sortedTags = Array.from(tagsSet).sort();

    // "Alle"-Button
    let html = `
        <button onclick="setFilterTag(null)" class="px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 snap-start shrink-0 cursor-pointer shadow-xs
            ${!activeFilterTag ? 'bg-amber-600 text-white shadow-xs scale-105 font-bold' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}">
            Alle 🍽️
        </button>
    `;

    // Kategorie-Buttons
    sortedTags.forEach(tag => {
        const isActive = activeFilterTag === tag;
        html += `
            <button onclick="setFilterTag('${tag}')" class="px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 snap-start shrink-0 cursor-pointer shadow-xs
                ${isActive ? 'bg-amber-600 text-white shadow-xs scale-105 font-bold' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}">
                ${tag}
            </button>
        `;
    });

    filterContainer.innerHTML = html;
}

// Wird beim Tap auf ein Tag ausgelöst
window.setFilterTag = function(tag) {
    activeFilterTag = (activeFilterTag === tag) ? null : tag;
    renderFilterBar();
    applyFilterAndSearch();
};

// Berechnet Filter + Textsuche parallel
function applyFilterAndSearch() {
    const query = document.getElementById('search-input')?.value.toLowerCase().trim() || '';

    const filtered = allRecipes.filter(recipe => {
        const matchesTag = !activeFilterTag || (Array.isArray(recipe.tags) && recipe.tags.includes(activeFilterTag));
        const matchesSearch = !query || 
            recipe.title.toLowerCase().includes(query) || 
            (recipe.notes && recipe.notes.toLowerCase().includes(query));
        return matchesTag && matchesSearch;
    });

    renderRecipeGrid(filtered);
}

// Zeichnet die Karten ins Grid
function renderRecipeGrid(recipes) {
    const container = document.getElementById('recipes-container');
    if (!container) return;
    container.innerHTML = '';

    if (recipes.length === 0) {
        container.innerHTML = `<div class="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 p-6 text-gray-400 text-sm">Keine Rezepte gefunden.</div>`;
        return;
    }

    recipes.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl border border-gray-100 p-4 relative shadow-xs hover:shadow-md transition-all duration-200';
        
        let tagsHtml = '';
        if (Array.isArray(recipe.tags)) {
            recipe.tags.forEach(t => {
                if(t) tagsHtml += `<span class="bg-gray-50 text-gray-500 text-[10px] px-2 py-0.5 rounded-md font-medium">#${t}</span>`;
            });
        }

        card.innerHTML = `
            <div class="pr-12">
                <h3 class="font-bold text-gray-800 text-base leading-tight">${recipe.title}</h3>
                ${recipe.link ? `<a href="${recipe.link}" target="_blank" class="text-xs text-amber-600 hover:underline inline-flex items-center gap-0.5 mt-1 break-all">${recipe.link}</a>` : ''}
                ${recipe.notes ? `<p class="text-xs text-gray-500 mt-2 line-clamp-3 bg-gray-50/50 p-2 rounded-xl border border-gray-100">${recipe.notes}</p>` : ''}
            </div>
            <button onclick="editRecipe(${JSON.stringify(recipe).replace(/"/g, '&quot;')})" class="absolute top-4 right-4 text-gray-400 hover:text-amber-600 text-xs font-medium">Bearbeiten</button>
            <div class="flex flex-wrap gap-1 mt-3">${tagsHtml}</div>
        `;
        container.appendChild(card);
    });
}

// ==========================================
// MODAL STEUERUNG (UI ACTIONS)
// ==========================================
window.openModal = function() {
    document.getElementById('recipe-form').reset();
    document.getElementById('recipe-id').value = '';
    document.getElementById('modal-title').innerText = 'Neues Rezept';
    document.getElementById('recipe-modal').classList.remove('hidden');
};

window.closeModal = function() {
    document.getElementById('recipe-modal').classList.add('hidden');
};

window.editRecipe = function(recipe) {
    document.getElementById('recipe-id').value = recipe.id;
    document.getElementById('form-title').value = recipe.title;
    document.getElementById('form-link').value = recipe.link || '';
    document.getElementById('form-tags').value = Array.isArray(recipe.tags) ? recipe.tags.join(', ') : '';
    document.getElementById('form-notes').value = recipe.notes || '';
    
    document.getElementById('modal-title').innerText = 'Rezept bearbeiten';
    document.getElementById('recipe-modal').classList.remove('hidden');
};
