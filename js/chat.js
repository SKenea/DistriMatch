/**
 * DistriMatch - Systeme de conversations et messages proactifs
 */

import {
    AppState, Conversations, GREETING_MESSAGES, ALERT_MESSAGES
} from './state.js';
import {
    escapeHTML, formatTime, formatDistance, showToast, getTimeSlot,
    updateImplicitProfile, saveConversations
} from './utils.js';
import { closeSidebar, updateConversationsBadge } from './navigation.js';
import { toggleSubscription, getDirectionsTo } from './distributor.js';

// ============================================
// BOT DISTRIBUTEUR
// ============================================

function getDistributorBot(distributorId) {
    const d = AppState.distributors.find(dist => dist.id === distributorId);
    if (!d) return null;

    const typeConfig = AppState.typeConfig[d.type] || {};

    return {
        id: distributorId,
        name: d.name,
        avatar: d.emoji,
        greeting: `Salut ! Je suis le bot de ${d.name}. Comment je peux t'aider ?`,
        quickReplies: [
            { text: 'Produits', action: 'products' },
            { text: 'Prix', action: 'prices' },
            { text: 'Itineraire', action: 'directions' },
            { text: 'Infos', action: 'info' }
        ],
        distributor: d,
        typeConfig: typeConfig
    };
}

// ============================================
// CONVERSATIONS
// ============================================

export function openConversation(distributorId) {
    const bot = getDistributorBot(distributorId);
    if (!bot) return;

    Conversations.active = distributorId;

    if (!Conversations.list.includes(distributorId)) {
        Conversations.list.unshift(distributorId);
        updateImplicitProfile('start_conversation', { type: bot.distributor.type });
    } else {
        Conversations.list = Conversations.list.filter(id => id !== distributorId);
        Conversations.list.unshift(distributorId);
    }

    if (!Conversations.history[distributorId]) {
        Conversations.history[distributorId] = [];
        addBotMessageToConversation(distributorId, bot.greeting);
    }

    saveConversations();
    displayChatModal(bot);

    markConversationAsRead(distributorId);

    updateConversationsList();
    closeSidebar();
}

function displayChatModal(bot) {
    const modal = document.getElementById('chat-modal');
    const avatar = document.getElementById('chat-avatar');
    const name = document.getElementById('chat-name');
    const status = document.getElementById('chat-status');
    const messages = document.getElementById('chat-messages');
    const quickReplies = document.getElementById('chat-quick-replies');

    avatar.textContent = bot.avatar;
    name.textContent = bot.name;
    status.textContent = 'En ligne';

    messages.innerHTML = '';
    const history = Conversations.history[bot.id] || [];
    history.forEach(msg => {
        addChatMessageToDOM(msg.type, msg.type === 'bot' ? bot.avatar : '👤', msg.text);
    });

    quickReplies.innerHTML = '';
    bot.quickReplies.forEach(reply => {
        const btn = document.createElement('button');
        btn.className = 'quick-reply-btn';
        btn.textContent = reply.text;
        btn.onclick = () => handleQuickReply(reply.action, bot);
        quickReplies.appendChild(btn);
    });

    modal.classList.add('active');

    updateChatSubscribeButton(bot.id);

    setTimeout(() => {
        messages.scrollTop = messages.scrollHeight;
    }, 100);
}

export function closeChatModal() {
    document.getElementById('chat-modal').classList.remove('active');
    Conversations.active = null;
}

function addChatMessageToDOM(type, avatar, text) {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = `chat-message ${type}`;
    msg.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">${escapeHTML(text)}</div>
    `;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

function addBotMessageToConversation(distributorId, text) {
    const msg = { type: 'bot', text, timestamp: Date.now() };
    if (!Conversations.history[distributorId]) {
        Conversations.history[distributorId] = [];
    }
    Conversations.history[distributorId].push(msg);
    saveConversations();
    return msg;
}

function addUserMessageToConversation(distributorId, text) {
    const msg = { type: 'user', text, timestamp: Date.now() };
    if (!Conversations.history[distributorId]) {
        Conversations.history[distributorId] = [];
    }
    Conversations.history[distributorId].push(msg);
    saveConversations();
    return msg;
}

// ============================================
// ACTIONS CHAT
// ============================================

function handleQuickReply(action, bot) {
    const quickReplies = document.getElementById('chat-quick-replies');
    quickReplies.innerHTML = '';
    handleDistributorAction(action, bot);
}

function handleDistributorAction(action, bot) {
    const d = bot.distributor;
    const distributorId = bot.id;

    addUserMessageToConversation(distributorId, action);
    addChatMessageToDOM('user', '👤', action);

    setTimeout(() => {
        let response = '';
        let newReplies = [];

        switch (action) {
            case 'products':
            case 'Produits':
                const productsList = d.products.map(p =>
                    `${p.available ? '✓' : '✗'} ${p.name}`
                ).join('\n');
                response = `Voici mes produits :\n${productsList}`;
                newReplies = [
                    { text: 'Prix', action: 'prices' },
                    { text: 'Itineraire', action: 'directions' }
                ];
                break;

            case 'prices':
            case 'Prix':
                const pricesList = d.products.map(p =>
                    `${p.name} : ${p.price.toFixed(2)}€`
                ).join('\n');
                response = `Mes tarifs :\n${pricesList}`;
                newReplies = [
                    { text: 'Produits', action: 'products' },
                    { text: 'Itineraire', action: 'directions' }
                ];
                break;

            case 'directions':
            case 'Itineraire':
                response = `Je suis situe : ${d.address}. Je t'ouvre l'itineraire !`;
                getDirectionsTo(d);
                newReplies = [
                    { text: 'Produits', action: 'products' },
                    { text: 'Abonnement', action: 'subscribe' }
                ];
                break;

            case 'info':
            case 'Infos':
                response = `${d.name}\n${d.address}\nNote : ${d.rating}/5 (${d.reviewCount} avis)\n${d.distance ? 'Distance : ' + formatDistance(d.distance) : ''}`;
                newReplies = [
                    { text: 'Produits', action: 'products' },
                    { text: 'Itineraire', action: 'directions' }
                ];
                break;

            case 'subscribe':
            case 'Abonnement':
                toggleSubscription(distributorId);
                const isSub = AppState.subscriptions.includes(distributorId);
                response = isSub ? 'Tu es maintenant abonne ! Je t\'enverrai des alertes.' : 'Tu ne recevras plus mes alertes.';
                newReplies = [
                    { text: 'Produits', action: 'products' },
                    { text: 'Itineraire', action: 'directions' }
                ];
                break;

            default:
                response = processNaturalMessage(action, d);
                newReplies = [
                    { text: 'Produits', action: 'products' },
                    { text: 'Prix', action: 'prices' },
                    { text: 'Itineraire', action: 'directions' }
                ];
        }

        addBotMessageToConversation(distributorId, response);
        addChatMessageToDOM('bot', bot.avatar, response);

        const quickReplies = document.getElementById('chat-quick-replies');
        quickReplies.innerHTML = '';
        newReplies.forEach(reply => {
            const btn = document.createElement('button');
            btn.className = 'quick-reply-btn';
            btn.textContent = reply.text;
            btn.onclick = () => handleQuickReply(reply.action, bot);
            quickReplies.appendChild(btn);
        });

    }, 400);
}

function processNaturalMessage(text, distributor) {
    const lower = text.toLowerCase();

    if (lower.includes('pizza') || lower.includes('mange')) {
        return `J'ai plein de bonnes choses ! Voici mes produits : ${distributor.products.slice(0, 3).map(p => p.name).join(', ')}...`;
    }

    if (lower.includes('prix') || lower.includes('combien') || lower.includes('cher')) {
        const cheapest = distributor.products.reduce((min, p) => p.price < min.price ? p : min);
        return `Le moins cher : ${cheapest.name} a ${cheapest.price.toFixed(2)}€`;
    }

    if (lower.includes('ou') || lower.includes('adresse') || lower.includes('trouv')) {
        return `Tu me trouves : ${distributor.address}`;
    }

    if (lower.includes('merci') || lower.includes('super') || lower.includes('cool')) {
        return "De rien ! A bientot !";
    }

    return `Je n'ai pas bien compris. Demande-moi les produits, les prix ou l'itineraire !`;
}

export function handleChatInput(text) {
    if (!text.trim() || !Conversations.active) return;

    const bot = getDistributorBot(Conversations.active);
    if (bot) {
        handleDistributorAction(text, bot);
    }
}

// ============================================
// LISTE CONVERSATIONS
// ============================================

export function updateConversationsList() {
    const list = document.getElementById('conversations-list');

    if (Conversations.list.length === 0) {
        list.innerHTML = `
            <div class="empty-conversations">
                <div class="empty-icon">💬</div>
                <p>Aucune conversation</p>
                <small>Clique sur un distributeur sur la carte pour lui parler</small>
            </div>
        `;
        return;
    }

    const sortedList = [...Conversations.list].sort((a, b) => {
        const aSubscribed = AppState.subscriptions.includes(a);
        const bSubscribed = AppState.subscriptions.includes(b);

        if (aSubscribed && !bSubscribed) return -1;
        if (!aSubscribed && bSubscribed) return 1;

        const aHistory = Conversations.history[a] || [];
        const bHistory = Conversations.history[b] || [];
        const aLast = aHistory[aHistory.length - 1]?.timestamp || 0;
        const bLast = bHistory[bHistory.length - 1]?.timestamp || 0;
        return bLast - aLast;
    });

    list.innerHTML = sortedList.map(id => {
        const d = AppState.distributors.find(dist => dist.id === id);
        if (!d) return '';

        const history = Conversations.history[id] || [];
        const lastMsg = history[history.length - 1];
        const preview = lastMsg ? lastMsg.text.substring(0, 25) + (lastMsg.text.length > 25 ? '...' : '') : 'Nouvelle conversation';
        const time = lastMsg ? formatTime(lastMsg.timestamp) : '';
        const isActive = Conversations.active === id;
        const isSubscribed = AppState.subscriptions.includes(id);
        const unreadCount = Conversations.unreadCounts[id] || 0;

        return `
            <div class="conversation-item ${isActive ? 'active' : ''} ${isSubscribed ? 'subscribed' : ''}" onclick="openConversation('${id}')">
                <div class="conversation-avatar">${d.emoji}</div>
                <div class="conversation-info">
                    <div class="conversation-name">
                        ${escapeHTML(d.name)}
                        ${isSubscribed ? '<span class="subscribed-icon">🔔</span>' : ''}
                    </div>
                    <div class="conversation-preview ${unreadCount > 0 ? 'unread' : ''}">${escapeHTML(preview)}</div>
                </div>
                <div class="conversation-meta">
                    <span class="conversation-time">${time}</span>
                    ${unreadCount > 0 ? `<span class="conversation-badge">${unreadCount}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// MESSAGES NON LUS
// ============================================

export function updateUnreadCounts() {
    Conversations.unreadCounts = {};

    Object.keys(Conversations.history).forEach(distributorId => {
        const messages = Conversations.history[distributorId];
        const unread = messages.filter(m => m.type === 'bot' && m.read === false).length;
        if (unread > 0) {
            Conversations.unreadCounts[distributorId] = unread;
        }
    });
}

export function markConversationAsRead(distributorId) {
    const messages = Conversations.history[distributorId] || [];
    messages.forEach(m => {
        if (m.type === 'bot') m.read = true;
    });
    delete Conversations.unreadCounts[distributorId];
    saveConversations();
    updateConversationsBadge();
}

// ============================================
// ABONNEMENT DEPUIS CHAT
// ============================================

export function updateChatSubscribeButton(distributorId) {
    const btn = document.getElementById('chat-subscribe');
    if (!btn) return;

    const isSubscribed = AppState.subscriptions.includes(distributorId);
    btn.classList.toggle('is-subscribed', isSubscribed);
    btn.setAttribute('aria-label', isSubscribed ? 'Se desabonner' : "S'abonner");
}

export function toggleChatSubscription() {
    if (!Conversations.active) return;

    const id = Conversations.active;
    toggleSubscription(id);
    updateChatSubscribeButton(id);
}

export function openReportFromChat() {
    if (!Conversations.active) return;
    const distributor = AppState.distributors.find(d => d.id === Conversations.active);
    if (!distributor) return;
    AppState.currentDistributor = distributor;

    // Import dynamique pour eviter la dep circulaire
    import('./activity.js').then(({ openReportModal }) => {
        openReportModal();
    });
}

// ============================================
// MESSAGES PROACTIFS
// ============================================

export function addProactiveMessage(distributorId, messageData) {
    const distributor = AppState.distributors.find(d => d.id === distributorId);
    if (!distributor) return;

    const msg = {
        type: 'bot',
        text: messageData.text,
        timestamp: Date.now(),
        read: false,
        proactive: true,
        category: messageData.category || 'info'
    };

    if (!Conversations.history[distributorId]) {
        Conversations.history[distributorId] = [];
    }
    Conversations.history[distributorId].push(msg);

    if (!Conversations.list.includes(distributorId)) {
        Conversations.list.unshift(distributorId);
    } else {
        Conversations.list = Conversations.list.filter(id => id !== distributorId);
        Conversations.list.unshift(distributorId);
    }

    Conversations.unreadCounts[distributorId] = (Conversations.unreadCounts[distributorId] || 0) + 1;

    saveConversations();
    updateConversationsList();
    updateConversationsBadge();
}

export function generateProactiveMessages() {
    const now = Date.now();
    const timeSlot = getTimeSlot();

    AppState.subscriptions.forEach(distributorId => {
        const distributor = AppState.distributors.find(d => d.id === distributorId);
        if (!distributor) return;

        const history = Conversations.history[distributorId] || [];
        const lastMessage = history[history.length - 1];
        const lastMessageTime = lastMessage?.timestamp || 0;
        const hoursSinceLastMessage = (now - lastMessageTime) / (1000 * 60 * 60);

        if (hoursSinceLastMessage >= 4) {
            const greeting = generateGreetingMessage(distributor, timeSlot);
            if (greeting) {
                addProactiveMessage(distributorId, greeting);
            }
        }

        if (Math.random() < 0.3 && hoursSinceLastMessage >= 2) {
            const alert = generateStockAlert(distributor);
            if (alert) {
                addProactiveMessage(distributorId, alert);
            }
        }
    });
}

function generateGreetingMessage(distributor, timeSlot) {
    const messages = GREETING_MESSAGES[timeSlot] || GREETING_MESSAGES.morning;
    const text = messages[Math.floor(Math.random() * messages.length)];
    return { text, category: `greeting_${timeSlot}` };
}

function generateStockAlert(distributor) {
    if (!distributor.products || distributor.products.length === 0) return null;

    const product = distributor.products[Math.floor(Math.random() * distributor.products.length)];

    const alertTypes = ['stock_back', 'new_product'];
    const alertType = alertTypes[Math.floor(Math.random() * alertTypes.length)];

    const templates = ALERT_MESSAGES[alertType];
    if (!templates) return null;

    let text = templates[Math.floor(Math.random() * templates.length)];
    text = text.replace('{product}', product.name);
    text = text.replace('{price}', product.price || '?');

    return { text, category: alertType };
}

export function generateWelcomeMessage(distributorId) {
    const distributor = AppState.distributors.find(d => d.id === distributorId);
    if (!distributor) return;

    const welcomeMessages = [
        `Super ! Tu es maintenant abonne. Je t'enverrai des alertes sur les nouveautes et les promos !`,
        `Bienvenue ! Je te tiendrai au courant des stocks et des bonnes affaires.`,
        `Merci de t'abonner ! Tu seras le premier informe des nouveaux produits.`
    ];

    const text = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
    addProactiveMessage(distributorId, { text, category: 'welcome' });
}
