/**
 * DistriMatch - Modifier une fiche sans bouton, au toucher (EPIC-T12)
 *
 * Maquette retenue : docs/maquettes/2026-10-01-edition/1-toucher.html (benchmark
 * NN/g, WCAG 2.5.1 / 2.5.7, Rappels, Keep, Gmail, Waze). Plus de bouton
 * « Modifier » ni de mode edition : un membre connecte agit sur les produits.
 *   - menu de l'etiquette (EPIC-T16) : Dispo / Pas dispo (availability.js),
 *     puis Renommer et Retirer ; le nom n'est jamais un champ par lui-meme ;
 *   - renommer : le nom devient un champ avec les suggestions des listes (Entree =
 *     enregistre, Echap ou vide = annule) ;
 *   - retirer : toast « Annuler » 7 s, la suppression en base n'a lieu qu'a la fin
 *     du delai ;
 *   - ajouter (EPIC-T13) : carte « + Ajouter un produit » -> panneau sur place :
 *     4 produits courants du type en pastilles (un toucher ajoute), puis un champ
 *     « Autre… » avec suggestions ; le panneau reste ouvert pour enchainer ;
 *   - prix : toucher « €€ » -> € / €€ / €€€ sur place.
 * Le signal Dispo / Pas dispo (toucher l'etiquette) est dans availability.js.
 * Visiteur : ces memes zones menent a l'invitation a se connecter (UC2 : modifier
 * est un privilege de compte). RLS : 005 (products), 013 (price_range).
 */

import { AppState, supabaseClient } from './state.js';
import {
    showToast, showActionToast, escapeHTML, cleanProductName, isDuplicateProductName,
    suggestProducts, searchProductSuggestions, isPrivateFiche
} from './utils.js';
import { isAuthenticated } from './auth.js';
import { renderProductsList, renderProductIcon } from './distributor.js';
import { renderFicheStatus, collapseProductChoices } from './availability.js';

export const EDIT_HINT_KEY = 'distrimatch_edit_hint_seen';
const UNDO_MS = 7000;
const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;
const PRICE_LEVELS = ['€', '€€', '€€€'];

// Qui peut quoi sur la fiche ouverte : membre connecte (canInform) ou visiteur
// (guest). Un distributeur seulement local (EPIC-T9) n'est modifiable par personne.
export function ficheEditRights(distributor) {
    if (!distributor || isPrivateFiche(distributor)) return { canInform: false, guest: false };
    const authed = isAuthenticated();
    return { canInform: authed, guest: !authed };
}

// Re-rend les cartes de la fiche ouverte puis leur statut (teinte, tri, age).
export function renderFicheProducts() {
    const d = AppState.currentDistributor;
    if (!d) return;
    renderProductsList(d, 'dist-products-list', ficheEditRights(d));
    renderFicheStatus();
    showFicheEditHint();
}

// ============================================
// INDICE DE PREMIER USAGE (NN/g : dans le contenu, une seule fois)
// ============================================

function hintSeen() {
    try { return localStorage.getItem(EDIT_HINT_KEY) === '1'; } catch (e) { return true; }
}

export function showFicheEditHint() {
    document.querySelectorAll('.fiche-edit-hint').forEach(h => h.remove());
    const d = AppState.currentDistributor;
    if (!ficheEditRights(d).canInform || hintSeen()) return;
    const btn = document.querySelector('#dist-products-list .product-row .product-status-btn:not([data-guest])');
    const top = btn?.closest('.product-card-top');
    if (!top) return;
    const hint = document.createElement('p');
    hint.className = 'fiche-edit-hint';
    hint.textContent = "Touche l'étiquette pour la changer";
    top.after(hint);
}

// Premiere action reussie (signal, ajout, retrait, renommage, prix) : l'indice
// a servi, il ne revient plus.
export function markFicheEditUsed() {
    try { localStorage.setItem(EDIT_HINT_KEY, '1'); } catch (e) { /* indice seulement */ }
    document.querySelectorAll('.fiche-edit-hint').forEach(h => h.remove());
}

// ============================================
// VISITEUR : modifier demande un compte
// ============================================

function inviteGuest() {
    const invite = document.getElementById('dist-login-invite');
    if (!invite || invite.hidden) return;
    invite.scrollIntoView({ block: 'center', behavior: 'smooth' });
    invite.classList.remove('is-highlighted');
    void invite.offsetWidth;   // relancer l'animation
    invite.classList.add('is-highlighted');
    document.getElementById('dist-login-invite-btn')?.focus({ preventScroll: true });
}

// ============================================
// RENOMMER
// ============================================

function productOf(row) {
    const d = AppState.currentDistributor;
    if (!d || !row) return { d, product: null, index: -1 };
    const index = (d.products || []).findIndex(p => String(p.id) === row.dataset.productId);
    return { d, product: index >= 0 ? d.products[index] : null, index };
}

function startRename(row) {
    const { d, product } = productOf(row);
    const nameEl = row.querySelector('.product-name-clean');
    if (!product || !nameEl) return;
    collapseProductChoices();
    const wrap = document.createElement('span');
    wrap.className = 'product-rename';
    wrap.innerHTML = `<input type="text" class="product-name-input" maxlength="60" enterkeyhint="done" autocomplete="off"
            role="combobox" aria-autocomplete="list" aria-expanded="false" aria-label="Nouveau nom de ${escapeHTML(product.name)}">
        <ul class="add-suggestions rename-suggestions" role="listbox" aria-label="Suggestions" hidden></ul>
        <span class="product-name-help">Entrée pour valider · Échap pour annuler</span>`;
    nameEl.replaceWith(wrap);
    const input = wrap.querySelector('input');
    const list = wrap.querySelector('.rename-suggestions');
    input.value = product.name;
    input.focus();
    input.select();

    let done = false;
    let active = -1;
    function finish(save, value = input.value) {
        if (done) return;
        done = true;
        if (save && cleanProductName(value)) commitRename(row.dataset.productId, value);
        else renderFicheProducts();   // vide ou Echap : on annule (EPIC-T16 : plus de retrait par nom vide)
    }
    function renderSuggestions() {
        const others = (d.products || []).filter(x => x !== product);
        const items = input.value.trim() && input.value !== product.name ? searchProductSuggestions(input.value, d.type, others) : [];
        active = -1;
        list.innerHTML = items.map((n, k) => `<li role="option" id="rename-opt-${k}" class="add-suggestion" data-name="${escapeHTML(n)}" aria-selected="false">${escapeHTML(n)}</li>`).join('');
        list.hidden = items.length === 0;
        input.setAttribute('aria-expanded', String(items.length > 0));
    }
    input.addEventListener('input', renderSuggestions);
    list.addEventListener('pointerdown', (e) => {
        const option = e.target.closest('[data-name]');
        if (!option) return;
        e.preventDefault();   // garder le focus : pas de « blur » avant le choix
        finish(true, option.dataset.name);
    });
    input.addEventListener('keydown', (e) => {
        const options = [...list.querySelectorAll('[role="option"]')];
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && options.length) {
            e.preventDefault();
            active = (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
            options.forEach((o, k) => o.setAttribute('aria-selected', String(k === active)));
            input.setAttribute('aria-activedescendant', options[active].id);
        }
        if (e.key === 'Enter') { e.preventDefault(); finish(true, options[active]?.dataset.name || input.value); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
}

async function commitRename(productId, raw) {
    const d = AppState.currentDistributor;
    const product = (d?.products || []).find(p => String(p.id) === String(productId));
    if (!product) return;
    const name = cleanProductName(raw);
    if (!name || name === product.name) {
        renderFicheProducts();
        return;
    }
    if (isDuplicateProductName(name, d.products, product.id)) {
        showToast(`« ${name} » est déjà dans la liste`, 'error');
        renderFicheProducts();
        return;
    }
    const previous = product.name;
    product.name = name;
    renderFicheProducts();
    const { error } = await updateProductName(d, product, previous, name);
    if (error) {
        console.warn('[DistriMatch] Renommage refuse :', error.code, error.message);
        product.name = previous;
        renderFicheProducts();
        showToast(`Nom non enregistré, réessaie plus tard (code ${error.code || '?'})`, 'error');
        return;
    }
    markFicheEditUsed();
    showActionToast(`Renommé en « ${name} »`, {
        onAction: () => commitRename(product.id, previous)
    });
}

async function updateProductName(d, product, previous, name) {
    if (!supabaseClient) return { error: { message: 'Service indisponible' } };
    try {
        const query = supabaseClient.from('products').update({ name });
        const { error } = product.id !== null && product.id !== undefined && product.id !== ''
            ? await query.eq('id', product.id)
            : await query.eq('distributor_id', d.id).eq('name', previous);
        return { error };
    } catch (e) {
        return { error: e };
    }
}

// ============================================
// RETIRER (rattrapable : la base n'est touchee qu'a la fin du delai)
// ============================================

function removeProduct(productId) {
    const d = AppState.currentDistributor;
    const index = (d?.products || []).findIndex(p => String(p.id) === String(productId));
    if (index < 0) return;
    const [product] = d.products.splice(index, 1);
    renderFicheProducts();
    markFicheEditUsed();
    showActionToast(`${product.name} retiré`, {
        onAction: () => {
            d.products.splice(Math.min(index, d.products.length), 0, product);
            if (AppState.currentDistributor?.id === d.id) renderFicheProducts();
        },
        onExpire: () => deleteProductForGood(d, product, index)
    });
}

async function deleteProductForGood(d, product, index) {
    let error = null;
    if (!supabaseClient) {
        error = { message: 'Service indisponible' };
    } else {
        try {
            const query = supabaseClient.from('products').delete();
            ({ error } = product.id !== null && product.id !== undefined && product.id !== ''
                ? await query.eq('id', product.id)
                : await query.eq('distributor_id', d.id).eq('name', product.name));
        } catch (e) {
            error = e;
        }
    }
    if (!error) return;
    console.warn('[DistriMatch] Retrait refuse :', error.code, error.message);
    d.products.splice(Math.min(index, d.products.length), 0, product);
    if (AppState.currentDistributor?.id === d.id) renderFicheProducts();
    showToast(`${product.name} n'a pas pu être retiré, réessaie plus tard`, 'error');
}

// ============================================
// AJOUTER : panneau « 4 produits courants + Autre… » (EPIC-T13)
// ============================================

function closeAddPanel() {
    if (document.getElementById('dist-add-panel')) renderFicheProducts();
}

function suggestionIcon(name) {
    return `<span class="add-chip-icon">${renderProductIcon(name)}</span>`;
}

// focus : 'input' (on tapait), 'chip' (on touchait une pastille) ou null
function openAddForm(focus = 'input') {
    const d = AppState.currentDistributor;
    const card = document.getElementById('dist-product-add');
    if (!d || !card) return;
    collapseProductChoices();
    const chips = suggestProducts(d.type, d.products);
    const typeLabel = AppState.typeConfig?.[d.type]?.label || '';
    const panel = document.createElement('div');
    panel.id = 'dist-add-panel';
    panel.className = 'product-add-panel';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-labelledby', 'dist-add-panel-title');
    panel.innerHTML = `
        <div class="add-panel-head">
            <p class="add-panel-title" id="dist-add-panel-title">Ajouter un produit</p>
            <button type="button" class="add-panel-close" data-add-close>Fermer</button>
        </div>
        ${chips.length ? `<p class="add-panel-sub">Les plus courants${typeLabel ? ` · ${escapeHTML(typeLabel)}` : ''}</p>
        <div class="add-chips">${chips.map(name => `<button type="button" class="add-chip" data-add-name="${escapeHTML(name)}" aria-label="Ajouter ${escapeHTML(name)}">${suggestionIcon(name)}<span class="add-chip-name">${escapeHTML(name)}</span><span class="add-chip-plus" aria-hidden="true">+</span></button>`).join('')}</div>` : ''}
        <div class="add-other">
            <span class="product-add-icon">${renderProductIcon('')}</span>
            <input type="text" class="product-add-input" maxlength="60" enterkeyhint="send" autocomplete="off"
                placeholder="${chips.length ? 'Autre…' : 'Nom du produit'}" aria-label="Nom du produit à ajouter"
                role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="dist-add-suggestions">
        </div>
        <ul class="add-suggestions" id="dist-add-suggestions" role="listbox" aria-label="Suggestions" hidden></ul>
        <p class="add-panel-help">Écris un nom, puis Entrée</p>`;
    card.replaceWith(panel);
    const input = panel.querySelector('.product-add-input');
    const icon = panel.querySelector('.product-add-icon');
    const list = panel.querySelector('.add-suggestions');
    let active = -1;
    let busy = false;

    if (focus === 'chip' && panel.querySelector('.add-chip')) panel.querySelector('.add-chip').focus();
    else if (focus) input.focus();

    async function add(name, nextFocus) {
        if (busy) return;
        busy = true;
        const added = await addProduct(name);
        busy = false;
        if (added) openAddForm(nextFocus);   // la liste propose les suivants ; on enchaine
    }

    function renderSuggestions() {
        const items = searchProductSuggestions(input.value, d.type, d.products);
        active = -1;
        list.innerHTML = items.map((name, k) =>
            `<li role="option" id="dist-add-opt-${k}" class="add-suggestion" data-add-name="${escapeHTML(name)}" aria-selected="false">${suggestionIcon(name)}<span>${escapeHTML(name)}</span></li>`
        ).join('');
        list.hidden = items.length === 0;
        input.setAttribute('aria-expanded', String(items.length > 0));
        input.removeAttribute('aria-activedescendant');
    }

    function moveActive(step) {
        const options = [...list.querySelectorAll('[role="option"]')];
        if (!options.length) return;
        active = (active + step + options.length) % options.length;
        options.forEach((o, k) => o.setAttribute('aria-selected', String(k === active)));
        input.setAttribute('aria-activedescendant', options[active].id);
    }

    panel.addEventListener('click', (e) => {
        if (e.target.closest('[data-add-close]')) {
            closeAddPanel();
            return;
        }
        const chip = e.target.closest('.add-chip');
        if (chip) {
            add(chip.dataset.addName, 'chip');
            return;
        }
        const option = e.target.closest('.add-suggestion');
        if (option) add(option.dataset.addName, 'input');
    });
    input.addEventListener('input', () => {
        icon.innerHTML = renderProductIcon(input.value);
        renderSuggestions();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); return; }
        if (e.key === 'Enter') {
            e.preventDefault();
            const option = list.querySelectorAll('[role="option"]')[active];
            add(option ? option.dataset.addName : input.value, 'input');
        }
    });
    panel.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        if (!list.hidden) {
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            return;
        }
        closeAddPanel();
        document.getElementById('dist-product-add')?.focus();
    });
}

async function addProduct(raw) {
    const d = AppState.currentDistributor;
    const name = cleanProductName(raw);
    if (!d || !name) return false;
    if (isDuplicateProductName(name, d.products)) {
        showToast(`« ${name} » est déjà dans la liste`, 'error');
        return false;
    }
    if (!supabaseClient) {
        showToast('Produit non ajouté : service indisponible, réessaie plus tard', 'error');
        return false;
    }
    let data = null;
    let error = null;
    try {
        ({ data, error } = await supabaseClient.from('products')
            .insert({ distributor_id: d.id, name, available: true })
            .select('id').single());
    } catch (e) {
        error = e;
    }
    if (error || !data) {
        console.warn('[DistriMatch] Ajout de produit refuse :', error?.code, error?.message);
        showToast(`Produit non ajouté, réessaie plus tard (code ${error?.code || '?'})`, 'error');
        return false;
    }
    d.products = d.products || [];
    d.products.push({ id: data.id, name, price: 0, available: true });
    renderFicheProducts();
    markFicheEditUsed();
    showToast(`${name} ajouté`, 'success');
    return true;
}

// ============================================
// PRIX : toucher « €€ » -> € / €€ / €€€ sur place
// ============================================

function closePricePicker() {
    document.getElementById('dist-price-picker')?.remove();
    document.getElementById('dist-modal-pricerange')?.setAttribute('aria-expanded', 'false');
}

function openPricePicker() {
    const d = AppState.currentDistributor;
    const btn = document.getElementById('dist-modal-pricerange');
    if (!d || !btn) return;
    if (document.getElementById('dist-price-picker')) {
        closePricePicker();
        return;
    }
    const current = PRICE_LEVELS.includes(d.priceRange) ? d.priceRange : null;   // inconnu : rien de coche
    const picker = document.createElement('div');
    picker.id = 'dist-price-picker';
    picker.className = 'dist-price-picker';
    picker.setAttribute('role', 'radiogroup');
    picker.setAttribute('aria-label', 'Niveau de prix');
    picker.innerHTML = PRICE_LEVELS.map(v =>
        `<button type="button" role="radio" aria-checked="${v === current}" data-price="${escapeHTML(v)}">${escapeHTML(v)}</button>`
    ).join('');
    btn.closest('.dist-modal-meta')?.after(picker);
    btn.setAttribute('aria-expanded', 'true');
    picker.querySelector('[aria-checked="true"]')?.focus();
    picker.addEventListener('click', (e) => {
        const choice = e.target.closest('[data-price]');
        if (choice) setPrice(choice.dataset.price);
    });
    picker.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closePricePicker();
            btn.focus();
        }
    });
}

async function setPrice(value) {
    const d = AppState.currentDistributor;
    const btn = document.getElementById('dist-modal-pricerange');
    closePricePicker();
    if (!d || !PRICE_LEVELS.includes(value) || value === d.priceRange) return;
    const previous = d.priceRange;
    d.priceRange = value;
    if (btn) btn.textContent = value;
    let error = null;
    if (!supabaseClient) {
        error = { message: 'Service indisponible' };
    } else {
        try {
            ({ error } = await supabaseClient.from('distributors').update({ price_range: value }).eq('id', d.id));
        } catch (e) {
            error = e;
        }
    }
    if (error) {
        console.warn('[DistriMatch] Prix refuse :', error.code, error.message);
        d.priceRange = previous;
        if (btn) btn.textContent = PRICE_LEVELS.includes(previous) ? previous : 'Prix ?';
        showToast(`Prix non enregistré, réessaie plus tard (code ${error.code || '?'})`, 'error');
        return;
    }
    markFicheEditUsed();
    showToast('Prix mis à jour', 'success');
}

// ============================================
// BRANCHEMENT (une fois, delegation sur les conteneurs persistants)
// ============================================

export function initFicheEdit() {
    const list = document.getElementById('dist-products-list');
    if (list && !list.dataset.editWired) {
        list.dataset.editWired = '1';
        list.addEventListener('click', (e) => {
            const row = e.target.closest('.product-row');
            if (e.target.closest('[data-guest]')) {
                inviteGuest();
                return;
            }
            // Menu de l'etiquette (EPIC-T16) : Renommer / Retirer
            const action = e.target.closest('.product-menu-action');
            if (action && row) {
                collapseProductChoices();
                if (action.dataset.action === 'rename') startRename(row);
                else removeProduct(row.dataset.productId);
                return;
            }
            if (e.target.closest('#dist-product-add')) openAddForm();
        });
        // Clavier dans le menu : fleches haut / bas
        list.addEventListener('keydown', (e) => {
            const menu = e.target.closest('.product-choices');
            if (!menu || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
            const items = [...menu.querySelectorAll('button')];
            const k = items.indexOf(document.activeElement);
            e.preventDefault();
            items[(k + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
        });
        document.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('#dist-add-panel, #toast-container')) closeAddPanel();
            if (!e.target.closest('#dist-price-picker, #dist-modal-pricerange')) closePricePicker();
        });
    }

    const price = document.getElementById('dist-modal-pricerange');
    if (price && !price.dataset.editWired) {
        price.dataset.editWired = '1';
        price.addEventListener('click', () => {
            const rights = ficheEditRights(AppState.currentDistributor);
            if (rights.canInform) openPricePicker();
            else if (rights.guest) inviteGuest();
        });
    }
}
