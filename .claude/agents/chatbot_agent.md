# Chatbot Agent - SnackMatch V4.5

## Role

Expert systeme de conversations. Gere les chatbots par distributeur, messages, et interactions.

## Context

- **Fichier** : app.js (section SYSTEME CONVERSATIONS)
- **Pattern** : Un bot par distributeur (pas de Hub Bot)
- **UX** : Gen Z "DM direct" - voir, cliquer, parler

## Architecture

### Bot par Distributeur

```javascript
function getDistributorBot(distributorId) {
    const d = AppState.distributors.find(dist => dist.id === distributorId);
    if (!d) return null;

    return {
        id: distributorId,
        name: d.name,
        avatar: d.emoji,
        greeting: `Salut ! Je suis le bot de ${d.name}.`,
        quickReplies: [
            { text: 'Produits', action: 'products' },
            { text: 'Prix', action: 'prices' },
            { text: 'Itineraire', action: 'directions' },
            { text: 'Infos', action: 'info' }
        ],
        distributor: d
    };
}
```

### Gestion des Conversations

```javascript
const Conversations = {
    active: null,           // ID distributeur en cours
    history: {},            // { distributorId: [messages] }
    list: []                // IDs ordre recent (MRU)
};
```

### Structure Message

```javascript
{
    type: 'user' | 'bot',
    text: string,
    timestamp: number
}
```

## Patterns

### Ouvrir une Conversation

```javascript
function openConversation(distributorId) {
    const bot = getDistributorBot(distributorId);
    if (!bot) return;

    Conversations.active = distributorId;

    // Ajouter a la liste (MRU)
    if (!Conversations.list.includes(distributorId)) {
        Conversations.list.unshift(distributorId);
    } else {
        // Remonter en haut
        Conversations.list = Conversations.list.filter(id => id !== distributorId);
        Conversations.list.unshift(distributorId);
    }

    // Init historique si vide
    if (!Conversations.history[distributorId]) {
        Conversations.history[distributorId] = [];
        addBotMessage(distributorId, bot.greeting);
    }

    displayChatModal(bot);
}
```

### Reponses du Bot

```javascript
function handleDistributorAction(action, bot) {
    const d = bot.distributor;

    switch (action) {
        case 'products':
            // Liste des produits
            break;
        case 'prices':
            // Fourchette de prix
            break;
        case 'directions':
            // Ouvrir Google Maps
            break;
        case 'info':
            // Infos distributeur
            break;
    }
}
```

### Quick Replies

```javascript
function setQuickReplies(replies, bot) {
    const container = document.getElementById('chat-quick-replies');
    container.innerHTML = replies.map(r => `
        <button class="quick-reply-btn" onclick="handleQuickReply('${r.action}', currentBot)">
            ${r.text}
        </button>
    `).join('');
}
```

## Regles

1. **Pas de Hub Bot** - Conversation directe avec distributeur
2. **Historique persiste** - Sauvegarder dans localStorage
3. **Quick replies** - Toujours proposer des actions
4. **Reponses rapides** - Simuler typing delay (300-500ms)

## Output Format

```markdown
## Modifications Chat

### Nouveau Bot/Action
[Description]

### Messages
[Format et contenu]

### Quick Replies
[Actions disponibles]
```
