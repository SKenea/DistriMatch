/**
 * DistriMatch - Modifier une fiche sans bouton, au toucher (EPIC-T12)
 *
 * Maquette retenue : docs/maquettes/2026-10-01-edition/1-toucher.html (benchmark
 * NN/g, WCAG 2.5.1 / 2.5.7, Rappels, Keep, Gmail, Waze). Plus de bouton
 * « Modifier » ni de mode edition : un membre connecte agit sur les produits.
 *   - renommer : toucher le nom -> champ en place (Entree / perte du focus =
 *     enregistre, Echap = annule) ;
 *   - retirer : nom vide valide, ou appui long / clic droit -> menu « Renommer /
 *     Retirer » ; toast « Annuler » 7 s, la suppression en base n'a lieu qu'a
 *     la fin du delai ;
 *   - ajouter : carte « + Ajouter un produit » en fin de grille -> champ,
 *     Entree ajoute et garde un champ vide pour enchainer ;
 *   - prix : toucher « €€ » -> € / €€ / €€€ sur place.
 * Le signal Dispo / Pas dispo (toucher l'etiquette) est dans availability.js.
 * Visiteur : ces memes zones menent a l'invitation a se connecter (UC2 : modifier
 * est un privilege de compte). RLS : 005 (products), 013 (price_range).
 */

import { AppState, supabaseClient } from './state.js';
import {
    showToast, showActionToast, escapeHTML, cleanProductName, isDuplicateProductName
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
    if (!distributor || distributor.isLocalOnly) return { canInform: false, guest: false };
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
    const { product } = productOf(row);
    const nameBtn = row.querySelector('.product-name-btn');
    if (!product || !nameBtn) return;
    closeRowMenu();
    collapseProductChoices();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'product-name-input';
    input.value = product.name;
    input.maxLength = 60;
    input.enterKeyHint = 'done';
    input.setAttribute('aria-label', `Nom du produit (vide = retirer ${product.name})`);
    const help = document.createElement('span');
    help.className = 'product-name-help';
    help.textContent = 'Entrée pour valider · vide pour retirer';
    nameBtn.replaceWith(input);
    input.after(help);
    input.focus();
    input.select();

    let done = false;
    function finish(save) {
        if (done) return;
        done = true;
        if (save) commitRename(row.dataset.productId, input.value);
        else renderFicheProducts();
    }
    input.addEventListener('input', () => help.classList.toggle('is-remove', !input.value.trim()));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
}

async function commitRename(productId, raw) {
    const d = AppState.currentDistributor;
    const product = (d?.products || []).find(p => String(p.id) === String(productId));
    if (!product) return;
    const name = cleanProductName(raw);
    if (!name) {
        removeProduct(productId);
        return;
    }
    if (name === product.name) {
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
// AJOUTER (carte « + Ajouter un produit », on enchaine)
// ============================================

function openAddForm() {
    const card = document.getElementById('dist-product-add');
    if (!card) return;
    closeRowMenu();
    collapseProductChoices();
    const form = document.createElement('div');
    form.className = `product-add-form${card.classList.contains('is-first') ? ' is-first' : ''}`;
    form.innerHTML = `<span class="product-add-icon">${renderProductIcon('')}</span>
        <input type="text" class="product-add-input" maxlength="60" enterkeyhint="send"
            placeholder="Nom du produit" aria-label="Nom du produit à ajouter">`;
    card.replaceWith(form);
    const input = form.querySelector('input');
    const icon = form.querySelector('.product-add-icon');
    input.focus();

    let busy = false;
    input.addEventListener('input', () => { icon.innerHTML = renderProductIcon(input.value); });
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            renderFicheProducts();
            return;
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (busy) return;
        busy = true;
        const added = await addProduct(input.value);
        busy = false;
        if (added) openAddForm();   // un champ vide pour enchainer
    });
    input.addEventListener('blur', () => {
        // Perte du focus : un nom saisi est ajoute, un champ vide se referme
        setTimeout(async () => {
            if (!form.isConnected || busy) return;
            if (input.value.trim()) await addProduct(input.value);
            else renderFicheProducts();
        }, 0);
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
// APPUI LONG / CLIC DROIT : menu Renommer / Retirer (raccourci, jamais la seule voie)
// ============================================

function closeRowMenu() {
    document.querySelectorAll('#dist-products-list .product-menu').forEach(m => m.remove());
}

function openRowMenu(row) {
    closeRowMenu();
    collapseProductChoices();
    const { product } = productOf(row);
    if (!product) return;
    const menu = document.createElement('div');
    menu.className = 'product-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Actions pour ${product.name}`);
    menu.innerHTML = `
        <button type="button" role="menuitem" data-menu="rename">Renommer</button>
        <button type="button" role="menuitem" class="is-danger" data-menu="remove">Retirer</button>`;
    row.appendChild(menu);
    menu.querySelector('button')?.focus();
    menu.addEventListener('click', (e) => {
        const item = e.target.closest('[data-menu]');
        if (!item) return;
        closeRowMenu();
        if (item.dataset.menu === 'rename') startRename(row);
        else removeProduct(row.dataset.productId);
    });
    menu.addEventListener('keydown', (e) => {
        const items = [...menu.querySelectorAll('[role="menuitem"]')];
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeRowMenu();
            row.querySelector('.product-name-btn')?.focus();
        }
    });
}

function wireLongPress(list) {
    let timer = null;
    let start = null;
    let pressedRow = null;
    function cancel() {
        clearTimeout(timer);
        timer = null;
        pressedRow?.classList.remove('is-pressing');
        pressedRow = null;
    }
    list.addEventListener('pointerdown', (e) => {
        const row = e.target.closest('.product-row[data-editable]');
        if (!row || e.button > 0 || e.target.closest('input, .product-menu, .product-choices')) return;
        start = { x: e.clientX, y: e.clientY };
        pressedRow = row;
        timer = setTimeout(() => {
            row.classList.remove('is-pressing');
            row.dataset.longPressed = '1';   // le « click » qui suit ne doit rien faire
            try { navigator.vibrate?.(10); } catch (err) { /* pas de vibreur */ }
            openRowMenu(row);
            timer = null;
        }, LONG_PRESS_MS);
        row.classList.add('is-pressing');
    });
    list.addEventListener('pointermove', (e) => {
        if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE_PX) cancel();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => list.addEventListener(t, () => { if (timer) cancel(); }));
    list.addEventListener('contextmenu', (e) => {
        const row = e.target.closest('.product-row[data-editable]');
        if (!row || e.target.closest('input')) return;
        e.preventDefault();
        cancel();
        openRowMenu(row);
    });
    // Clavier : Maj+F10 ou la touche Menu sur un element de la carte
    list.addEventListener('keydown', (e) => {
        const row = e.target.closest('.product-row[data-editable]');
        if (!row || e.target.closest('input')) return;
        if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
            e.preventDefault();
            openRowMenu(row);
        }
    });
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
    const current = PRICE_LEVELS.includes(d.priceRange) ? d.priceRange : '€€';
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
        if (btn) btn.textContent = PRICE_LEVELS.includes(previous) ? previous : '€€';
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
        wireLongPress(list);
        list.addEventListener('click', (e) => {
            const row = e.target.closest('.product-row');
            if (row?.dataset.longPressed) {
                delete row.dataset.longPressed;
                e.preventDefault();
                return;
            }
            if (e.target.closest('[data-guest]')) {
                inviteGuest();
                return;
            }
            if (e.target.closest('.product-name-btn')) {
                startRename(row);
                return;
            }
            if (e.target.closest('#dist-product-add')) openAddForm();
        });
        document.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('.product-menu')) closeRowMenu();
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
