# NOTIF-06 — Réglages des notifications gardés et vocabulaire cohérent

- **Lot** : 5. Notifications · **Gravité** : faible · **Niveau conseillé** : medium
- **Prérequis** : **NOTIF-05 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter
  (NOTIF-02 à NOTIF-05 modifient `js/notifications.js` et `js/push.js` juste avant celle-ci).
- **Branche** : `fix/reglages-notifications` · **Taille** : 6 fichiers de code (`js/notifications.js`,
  `js/utils.js`, `js/push.js`, `js/state.js`, `js/app.js`, `supabase/functions/push-notify/logic.js`)
  + `index.html` + 3 fichiers de tests. **Aucune migration.** **Textes à valider par Stéphane avant fusion.**
- **Constats couverts** (rapport du 2026-10-21) :
  - Vocabulaire des notifications incohérent : « de nouveau plein », « fonctionne », « Machine » — `index.html:1049`
    (aujourd'hui ligne 1144 ; aussi `js/notifications.js:151-153`, `js/state.js:135-138`, `logic.js:52-54`)
  - Heures calmes : les minutes saisies sont silencieusement perdues — `index.html:867` (aujourd'hui 962-963)
  - Réglages des notifications perdus sans « Sauvegarder » — `index.html:894` (aujourd'hui 989-993)
  - Heures calmes : minutes ignorées en silence, champ vidé = NaN — `js/notifications.js:469` (aujourd'hui 473-476)
  - Déjà corrigé : **rien** (les 4 constats ont été revérifiés le 2026-11-06 sur `master` b970d4d : tous présents).

## But
Les réglages des notifications sont gardés dès qu'on les touche, minutes des heures calmes comprises,
et une notification parle comme la fiche : « vide », « en panne », « de nouveau en service », jamais
« Machine », « fonctionne » ni « plein ».

## User story
En tant que membre qui règle ses notifications, je veux que mes réglages soient gardés et les textes
cohérents avec la fiche, afin de comprendre mes notifications et de ne pas être dérangé pendant mes
heures calmes.

**Critères d'acceptation**
- [ ] Heures calmes « De 22:30 À 07:45 » : la page les réaffiche telles quelles ; l'app ne notifie pas
      à 22:45 ni à 07:30, et notifie de nouveau à 07:45.
- [ ] Champ d'heure vidé : l'heure précédente revient dans le champ, un toast le dit, rien de vide ni
      `NaN` n'est enregistré ni envoyé au serveur.
- [ ] Réglages enregistrés anciens abîmés (`start: null`) : l'app applique 22:00 - 08:00 et les affiche.
- [ ] Plus de bouton « Sauvegarder » : chaque interrupteur, heure ou distance est enregistré dès qu'il
      change ; Retour puis réouverture montrent le réglage changé.
- [ ] Textes : « Distributeur signalé vide », « Distributeur signalé en panne », « De nouveau en
      service », « De nouveau dispo », « Produit suivi dispo » ; messages « <nom> : signalé vide »,
      « <nom> : signalé en panne », « <nom> : de nouveau en service » ; mêmes messages app fermée.
- [ ] Centre vide : « … quand il est vide, en panne ou de nouveau en service. »

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Minutes gardées sur le téléphone** (décision du lot) : `quietHours.start` / `quietHours.end`
  deviennent des chaînes `"HH:MM"` (la valeur du champ `<input type="time">`). Les anciens nombres
  (`22`, `8`, réglages déjà enregistrés, valeurs par défaut de `state.js` et de `app.js`) restent
  acceptés : **pas de migration des réglages**, `state.js` et `app.js` gardent `start: 22, end: 8`.
  Toute lecture passe par `resolveQuietRange` (utils.js) qui rend des minutes depuis minuit, avec
  22:00 / 08:00 pour une valeur absente ou abîmée (`null`, `NaN`, texte).
- **Serveur en heures entières, inchangé** : la colonne `push_subscriptions.quiet_start/quiet_end`
  est un `smallint 0..23` (migration 024) et `isQuietTime` (logic.js) compte en heures. Pas de
  migration : `quietHoursForServer` envoie la plage d'heures **qui couvre** celle choisie (début
  arrondi à l'heure d'avant, fin à l'heure d'après) : 22:30 - 07:45 part en 22 - 8. App fermée, le
  calme peut donc commencer et finir jusqu'à 59 min plus tôt / plus tard que choisi, mais jamais de
  notification pendant les heures calmes. App ouverte : à la minute près.
- **Champ vide refusé** : on remet l'heure précédente dans le champ, toast « Heure incomplète : on
  garde HH:MM » (type `info`), et on enregistre l'heure précédente normalisée (`"22:00"`).
- **Enregistrement immédiat** : un écouteur `change` sur `#notif-enabled`, `#quiet-hours-enabled`,
  `#quiet-start`, `#quiet-end`, `#geofence-enabled`, `#geofence-radius` appelle
  `saveNotificationSettingsFromUI` (fonction gardée, toast « Paramètres sauvegardés » retiré : un
  toast à chaque toucher serait du bruit). Écouteurs posés **une seule fois**, depuis
  `openNotificationSettings` (seul chemin vers la page), avec la garde `dataset.wired` sur
  `#notification-settings` comme `initPushSettings`. **Rien à brancher dans `app.js`.**
  `#push-enabled` garde son propre écouteur (push.js), il n'est pas dans la liste.
- **Bouton « Sauvegarder » retiré**, remplacé (dans le même `<div class="settings-actions">`, aucun
  CSS à changer) par l'aide « Tes réglages sont enregistrés dès que tu les changes. ». L'export
  `window.saveNotificationSettingsFromUI` (app.js) ne sert plus : retiré, ainsi que son nom dans
  l'`import` de `app.js`.
- **Vocabulaire** (tableau ci-dessous) : tournure « <nom> : signalé vide » (pas d'accord avec un nom
  dont le genre est inconnu, suit le « Signalé vide » de la fiche). Les messages « produit » (`stock`,
  `restock`) **ne changent pas** : l'écran d'accueil montre « Œufs vu dispo chez La Ferme du Moulin »
  comme exemple réel (index.html, « meme texte que l'app ») ; les changer obligerait à changer
  l'accueil, hors périmètre. `buildPushMessage` (logic.js) reste **identique** à
  `buildFavoriteMessage` (test « memes textes que le centre de notifications »).
- Label « A » des heures calmes → « À » (texte d'interface avec accent).
- **Déploiement** : `logic.js` tourne sur le serveur. L'agent **ne déploie pas** ; après fusion,
  Claude (modèle principal) lance `node scripts/deploy-push.mjs`. À écrire dans la PR.

### Textes avant / après (à valider par Stéphane)

| Où | Avant | Après |
|---|---|---|
| Titre `empty` (state.js) | Machine signalée vide | Distributeur signalé vide |
| Titre `broken` | Machine signalée en panne | Distributeur signalé en panne |
| Titre `working` | Machine de nouveau en service | De nouveau en service |
| Titre `restock` | De nouveau disponible | De nouveau dispo |
| Titre `stock` | Produit disponible ! | Produit suivi dispo |
| Message `empty` (app + app fermée) | La Ferme a été signalée vide | La Ferme : signalé vide |
| Message `broken` | La Ferme a été signalée en panne | La Ferme : signalé en panne |
| Message `working` | La Ferme fonctionne de nouveau | La Ferme : de nouveau en service |
| Messages `stock` / `restock` | Œufs vu dispo chez La Ferme / Pain de nouveau vu dispo chez La Ferme | inchangés |
| Centre vide (index.html) | … quand il est vide, en panne ou de nouveau plein. | … quand il est vide, en panne ou de nouveau en service. |
| Réglages, heures calmes | De … A … | De … À … |
| Réglages, bas de page | bouton « Sauvegarder » | « Tes réglages sont enregistrés dès que tu les changes. » |
| Toast après un réglage | Paramètres sauvegardés | (aucun) |
| Toast, champ d'heure vidé | (aucun, NaN enregistré) | Heure incomplète : on garde 22:00 |

## Avant de coder
**Lire en entier** : `js/notifications.js` lignes 1-35 et la section `PARAMETRES UI` (vers 450-490) ;
`js/push.js` `subscriptionParams` (vers 52-66) ; `js/utils.js` lignes 360-370 ; `js/state.js` lignes
128-139 ; `supabase/functions/push-notify/logic.js` `buildPushMessage` et `isQuietTime` ;
`index.html` page `#notification-settings` (vers 930-995) et `#notifications-empty` (vers 1140) ;
`tests/unit/unit.test.js` blocs `isQuietHours` (vers 1510) et `EPIC-T25` (vers 1955-2010) ;
`tests/functional/notifications.spec.js` tests « 6. » (vers 96-160) et « 40. » (vers 295-360).

**Réutiliser** : `showToast`, `saveNotificationPrefs` (`js/utils.js`) ; `syncPushSubscription` (`js/push.js`,
déjà importé dans notifications.js) ; la garde `dataset.wired` (modèle : `initPushSettings`, push.js) ;
`setupApp` (`tests/functional/helpers.js`, déjà appelé par le `beforeEach` de notifications.spec.js) ;
l'ouverture des réglages par `(await import('./js/notifications.js')).openNotificationSettings()` (test « 40. »).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -c "    diffGeofence, escapeHTML, showToast, timeAgo," js/notifications.js           # 1
grep -c "    const { start, end } = NotificationPrefs.quietHours;" js/notifications.js           # 1 (isQuietHours)
grep -c "    if (!settingsView) return;" js/notifications.js                                     # 1 (openNotificationSettings)
grep -c "padStart(2, '0')}:00\`;" js/notifications.js                                           # 2
grep -c "parseInt(startTime.split(':')\[0\]);" js/notifications.js                              # 1
grep -c "    showToast('Paramètres sauvegardés', 'success');" js/notifications.js               # 1
grep -c "a été signalée\|fonctionne de nouveau" js/notifications.js                              # 3
grep -c "a été signalée\|fonctionne de nouveau" supabase/functions/push-notify/logic.js          # 3
grep -c "title: 'Machine\|title: 'De nouveau disponible'\|title: 'Produit disponible !'" js/state.js   # 5
grep -c "    const quiet = NotificationPrefs.quietHours;" js/push.js                             # 1
grep -c "quiet.enabled ? quiet.start : null,\|quiet.enabled ? quiet.end : null," js/push.js      # 2
grep -c "} from './utils.js';" js/push.js                                                        # 1 (une seule ligne d'import d'utils)
grep -n "^export function loadNotificationPrefs() {" js/utils.js                                 # 1 ligne (366 environ)
grep -c "quietTimeToMinutes\|resolveQuietRange\|quietHoursForServer\|isInQuietRange\|formatQuietTime" js/utils.js   # 0
grep -n "quietHours" js/*.js                    # 11 lignes exactement : app.js 1, notifications.js 8, push.js 1, state.js 1
grep -c 'onclick="saveNotificationSettingsFromUI()"' index.html                                 # 1
grep -c '<label>A <input type="time" id="quiet-end"' index.html                                 # 1
grep -c "ou de nouveau plein." index.html                                                        # 1
grep -c "^window.saveNotificationSettingsFromUI = saveNotificationSettingsFromUI;" js/app.js     # 1
grep -c "openNotificationSettings, saveNotificationSettingsFromUI, updateRadiusDisplay" js/app.js   # 1
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html      # noter V (123 le 2026-11-06, plus après NOTIF-01..05)
```
Si `grep -n "quietHours" js/*.js` montre une 12e ligne (par exemple une minuterie de NOTIF-04 qui lit
`quietHours.end` comme un nombre d'heures) : **s'arrêter et signaler** (elle casserait avec `"07:45"`).

## Étapes

1. **js/utils.js** — fonctions pures des heures calmes, juste **après** la fonction `loadNotificationPrefs`
   (après sa ligne `}`, une ligne vide puis ce bloc). Avant :
   ```js
   export function loadNotificationPrefs() {
       const parsed = loadStore(NOTIFICATION_PREFS_KEY);
       if (parsed) Object.assign(NotificationPrefs, parsed);
   }
   ```
   Après :
   ```js
   export function loadNotificationPrefs() {
       const parsed = loadStore(NOTIFICATION_PREFS_KEY);
       if (parsed) Object.assign(NotificationPrefs, parsed);
   }

   // Heures calmes (NOTIF-06). Une heure est « HH:MM » (valeur du champ des reglages) ou,
   // pour les reglages enregistres avant, un nombre d'heures entier (22). Rend les minutes
   // depuis minuit (0..1439), ou null si la valeur est absente ou abimee (null, NaN, texte).
   const QUIET_DEFAULT_START = 22 * 60;
   const QUIET_DEFAULT_END = 8 * 60;

   export function quietTimeToMinutes(value) {
       if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 23 ? value * 60 : null;
       const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(value ?? ''));
       if (!match) return null;
       const hours = Number(match[1]);
       const minutes = Number(match[2]);
       return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
   }

   export function formatQuietTime(minutes) {
       return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
   }

   // Debut et fin en minutes ; valeur abimee = 22:00 / 08:00 (valeurs par defaut).
   export function resolveQuietRange(quiet) {
       return {
           start: quietTimeToMinutes(quiet?.start) ?? QUIET_DEFAULT_START,
           end: quietTimeToMinutes(quiet?.end) ?? QUIET_DEFAULT_END
       };
   }

   // Vrai si minuteOfDay est dans [debut, fin[ ; la plage peut passer minuit ; debut = fin : jamais.
   export function isInQuietRange(startMinutes, endMinutes, minuteOfDay) {
       if (startMinutes > endMinutes) return minuteOfDay >= startMinutes || minuteOfDay < endMinutes;
       return minuteOfDay >= startMinutes && minuteOfDay < endMinutes;
   }

   // Le serveur (push-notify, migration 024) ne connait que des heures entieres : on lui envoie
   // la plage qui couvre celle choisie (debut a l'heure d'avant, fin a l'heure d'apres), pour ne
   // jamais notifier app fermee pendant les heures calmes. null / null = pas d'heures calmes.
   export function quietHoursForServer(quiet) {
       if (!quiet?.enabled) return { start: null, end: null };
       const { start, end } = resolveQuietRange(quiet);
       return { start: Math.floor(start / 60), end: Math.ceil(end / 60) % 24 };
   }
   ```

2. **js/notifications.js** — importer les nouvelles fonctions. Avant :
   ```js
       diffGeofence, escapeHTML, showToast, timeAgo,
   ```
   Après :
   ```js
       quietTimeToMinutes, formatQuietTime, resolveQuietRange, isInQuietRange,
       diffGeofence, escapeHTML, showToast, timeAgo,
   ```

3. **js/notifications.js**, `isQuietHours` — comparer à la minute. Avant :
   ```js
   export function isQuietHours() {
       if (!NotificationPrefs.quietHours.enabled) return false;

       const now = new Date();
       const hour = now.getHours();
       const { start, end } = NotificationPrefs.quietHours;

       if (start > end) {
           return hour >= start || hour < end;
       }
       return hour >= start && hour < end;
   }
   ```
   Après :
   ```js
   export function isQuietHours() {
       if (!NotificationPrefs.quietHours.enabled) return false;

       // NOTIF-06 : a la minute pres (« HH:MM » ou ancien nombre d'heures), valeur abimee = 22:00 / 08:00
       const now = new Date();
       const { start, end } = resolveQuietRange(NotificationPrefs.quietHours);
       return isInQuietRange(start, end, now.getHours() * 60 + now.getMinutes());
   }
   ```

4. **js/state.js** — titres des notifications. Avant :
   ```js
       stock: { icon: '📦', title: 'Produit disponible !', template: '{product} est dispo chez {name}' },
   ```
   Après :
   ```js
       stock: { icon: '📦', title: 'Produit suivi dispo', template: '{product} est dispo chez {name}' },
   ```
   Puis, avant :
   ```js
       empty: { icon: '🚫', title: 'Machine signalée vide' },
       broken: { icon: '⚠️', title: 'Machine signalée en panne' },
       restock: { icon: '✅', title: 'De nouveau disponible' },
       working: { icon: '✅', title: 'Machine de nouveau en service' }
   ```
   Après :
   ```js
       empty: { icon: '🚫', title: 'Distributeur signalé vide' },
       broken: { icon: '⚠️', title: 'Distributeur signalé en panne' },
       restock: { icon: '✅', title: 'De nouveau dispo' },
       working: { icon: '✅', title: 'De nouveau en service' }
   ```

5. **js/notifications.js**, `buildFavoriteMessage` — messages d'état. Avant :
   ```js
           case 'broken': return `${distributorName} a été signalée en panne`;
           case 'working': return `${distributorName} fonctionne de nouveau`;
           case 'empty': return `${distributorName} a été signalée vide`;
   ```
   Après :
   ```js
           case 'broken': return `${distributorName} : signalé en panne`;
           case 'working': return `${distributorName} : de nouveau en service`;
           case 'empty': return `${distributorName} : signalé vide`;
   ```

6. **supabase/functions/push-notify/logic.js**, `buildPushMessage` — **exactement** le même
   remplacement qu'à l'étape 5 (mêmes 3 lignes avant, mêmes 3 lignes après). Ne rien toucher d'autre
   dans ce fichier.

7. **js/notifications.js**, `openNotificationSettings` — brancher l'enregistrement immédiat. Avant :
   ```js
       if (!settingsView) return;
   ```
   Après :
   ```js
       if (!settingsView) return;
       wireNotificationSettings(settingsView);
   ```
   Puis, dans la même fonction, avant :
   ```js
       document.getElementById('quiet-start').value = `${String(NotificationPrefs.quietHours.start).padStart(2, '0')}:00`;
       document.getElementById('quiet-end').value = `${String(NotificationPrefs.quietHours.end).padStart(2, '0')}:00`;
   ```
   Après :
   ```js
       const quiet = resolveQuietRange(NotificationPrefs.quietHours);
       document.getElementById('quiet-start').value = formatQuietTime(quiet.start);
       document.getElementById('quiet-end').value = formatQuietTime(quiet.end);
   ```

8. **js/notifications.js**, `saveNotificationSettingsFromUI` — heures à la minute, champ vide refusé,
   plus de toast. Avant :
   ```js
       const startTime = document.getElementById('quiet-start').value;
       const endTime = document.getElementById('quiet-end').value;
       NotificationPrefs.quietHours.start = parseInt(startTime.split(':')[0]);
       NotificationPrefs.quietHours.end = parseInt(endTime.split(':')[0]);
   ```
   Après :
   ```js
       const previous = resolveQuietRange(NotificationPrefs.quietHours);
       NotificationPrefs.quietHours.start = readQuietTimeInput('quiet-start', previous.start);
       NotificationPrefs.quietHours.end = readQuietTimeInput('quiet-end', previous.end);
   ```
   Puis supprimer **la seule ligne** (le reste de la fonction, y compris ce que NOTIF-04 / NOTIF-05
   y ont ajouté, ne bouge pas) :
   ```js
       showToast('Paramètres sauvegardés', 'success');
   ```

9. **js/notifications.js** — deux fonctions de module, placées **juste au-dessus** de la ligne
   `export function openNotificationSettings() {` (une ligne vide après le bloc) :
   ```js
   // NOTIF-06 : chaque reglage est enregistre des qu'il change (plus de bouton « Sauvegarder » :
   // Retour ou Echap perdaient les changements). Ecouteurs poses une seule fois.
   const AUTO_SAVED_SETTINGS = ['notif-enabled', 'quiet-hours-enabled', 'quiet-start', 'quiet-end', 'geofence-enabled', 'geofence-radius'];

   function wireNotificationSettings(settingsView) {
       if (settingsView.dataset.wired) return;
       settingsView.dataset.wired = '1';
       AUTO_SAVED_SETTINGS.forEach(function wireSetting(id) {
           document.getElementById(id)?.addEventListener('change', function saveSetting() { saveNotificationSettingsFromUI(); });
       });
   }

   // Heure « HH:MM » d'un champ, minutes comprises. Vide ou incomplete : l'heure precedente
   // revient dans le champ et on le dit (jamais de NaN enregistre ni envoye au serveur).
   function readQuietTimeInput(id, previousMinutes) {
       const input = document.getElementById(id);
       const minutes = quietTimeToMinutes(input.value);
       if (minutes !== null) return formatQuietTime(minutes);
       const kept = formatQuietTime(previousMinutes);
       input.value = kept;
       showToast(`Heure incomplète : on garde ${kept}`, 'info');
       return kept;
   }
   ```

10. **js/push.js** — importer la conversion. Sur la **seule** ligne qui se termine par
    `} from './utils.js';`, insérer `quietHoursForServer, ` juste après `import { ` (le reste de la ligne
    ne change pas). Le 2026-11-06 : avant
    ```js
    import { showToast, showActionToast, saveNotificationPrefs, urlBase64ToUint8Array, needsHomeScreenForPush, shouldHintHomeScreenFavorites } from './utils.js';
    ```
    après
    ```js
    import { quietHoursForServer, showToast, showActionToast, saveNotificationPrefs, urlBase64ToUint8Array, needsHomeScreenForPush, shouldHintHomeScreenFavorites } from './utils.js';
    ```

11. **js/push.js**, `subscriptionParams` — heures entières pour le serveur. Avant :
    ```js
        const quiet = NotificationPrefs.quietHours;
    ```
    Après :
    ```js
        // NOTIF-06 : heures entieres pour le serveur, plage qui couvre les minutes choisies
        const quiet = quietHoursForServer(NotificationPrefs.quietHours);
    ```
    Puis, avant :
    ```js
            p_quiet_start: quiet.enabled ? quiet.start : null,
            p_quiet_end: quiet.enabled ? quiet.end : null,
    ```
    Après :
    ```js
            p_quiet_start: quiet.start,
            p_quiet_end: quiet.end,
    ```

12. **js/app.js** — retirer l'export devenu inutile. Avant :
    ```js
        startGeofenceMonitoring, processQueuedNotifications, openNotificationSettings, saveNotificationSettingsFromUI, updateRadiusDisplay, promptAddProductFollow, unfollowProduct, openNotificationsView, updateNotificationsBadge, clearAllNotifications
    ```
    Après (seul `saveNotificationSettingsFromUI, ` disparaît ; si NOTIF-04/05 ont changé d'autres noms de
    cette ligne, ne retirer que ce nom) :
    ```js
        startGeofenceMonitoring, processQueuedNotifications, openNotificationSettings, updateRadiusDisplay, promptAddProductFollow, unfollowProduct, openNotificationsView, updateNotificationsBadge, clearAllNotifications
    ```
    Puis supprimer la ligne :
    ```js
    window.saveNotificationSettingsFromUI = saveNotificationSettingsFromUI;
    ```

13. **index.html** — label « À ». Avant :
    ```html
                        <label>A <input type="time" id="quiet-end" value="08:00"></label>
    ```
    Après :
    ```html
                        <label>À <input type="time" id="quiet-end" value="08:00"></label>
    ```

14. **index.html** — plus de bouton « Sauvegarder ». Avant :
    ```html
                <div class="settings-actions">
                    <button class="btn-primary-clean" onclick="saveNotificationSettingsFromUI()">
                        Sauvegarder
                    </button>
                </div>
    ```
    Après :
    ```html
                <div class="settings-actions">
                    <p class="setting-hint">Tes réglages sont enregistrés dès que tu les changes.</p>
                </div>
    ```

15. **index.html** — centre de notifications vide. Avant :
    ```html
                <p>Ajoute un distributeur à tes favoris : tu seras prévenu quand il est vide, en panne ou de nouveau plein.</p>
    ```
    Après :
    ```html
                <p>Ajoute un distributeur à tes favoris : tu seras prévenu quand il est vide, en panne ou de nouveau en service.</p>
    ```

16. **index.html** — cinq modules JS changent : monter le `?v=` de **toutes** les entrées de l'import
    map à la même valeur V+1. Aucun CSS ne change (aucun `?v=` de `<link>` à toucher).

## Tests

### Test 1 — heures calmes à la minute et texte des notifications (unitaires)
- **Fichier** : `tests/unit/unit.test.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
- **Code à ajouter** :
  ```js

  // ============================================
  // REGLAGES ET TEXTES DES NOTIFICATIONS (NOTIF-06)
  // ============================================

  const { quietTimeToMinutes, formatQuietTime, resolveQuietRange, isInQuietRange, quietHoursForServer } = await import('../../js/utils.js');
  const { NOTIFICATION_TYPES } = await import('../../js/state.js');
  const { subscriptionParams } = await import('../../js/push.js');

  describe('Heures calmes a la minute (NOTIF-06)', () => {
      it('« HH:MM » et ancien nombre d’heures acceptes ; vide, null, NaN refuses', () => {
          assert.equal(quietTimeToMinutes('22:30'), 1350);
          assert.equal(quietTimeToMinutes('07:45'), 465);
          assert.equal(quietTimeToMinutes('22:30:00'), 1350);
          assert.equal(quietTimeToMinutes(22), 1320);
          for (const bad of ['', null, undefined, NaN, '24:00', '7:45', 23.5, 'abc']) assert.equal(quietTimeToMinutes(bad), null, String(bad));
          assert.equal(formatQuietTime(465), '07:45');
          assert.deepEqual(resolveQuietRange({ start: null, end: NaN }), { start: 1320, end: 480 });
          assert.deepEqual(resolveQuietRange({ start: '22:30', end: 8 }), { start: 1350, end: 480 });
      });

      it('plage qui passe minuit, fin exclue', () => {
          assert.equal(isInQuietRange(1350, 465, 1349), false);
          assert.equal(isInQuietRange(1350, 465, 1350), true);
          assert.equal(isInQuietRange(1350, 465, 464), true);
          assert.equal(isInQuietRange(1350, 465, 465), false);
          assert.equal(isInQuietRange(840, 960, 900), true);
          assert.equal(isInQuietRange(600, 600, 600), false);
      });

      it('isQuietHours a la minute pres, et 22:00 - 08:00 si le reglage est abime', () => {
          const saved = { ...NotificationPrefs.quietHours };
          const at = (hour, minute) => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 8, hour, minute) }); };
          try {
              NotificationPrefs.quietHours = { enabled: true, start: '22:30', end: '07:45' };
              at(22, 15); assert.equal(isQuietHours(), false);
              at(22, 30); assert.equal(isQuietHours(), true);
              at(7, 44); assert.equal(isQuietHours(), true);
              at(7, 45); assert.equal(isQuietHours(), false);
              NotificationPrefs.quietHours = { enabled: true, start: null, end: null };
              at(23, 0); assert.equal(isQuietHours(), true);
              at(9, 0); assert.equal(isQuietHours(), false);
          } finally {
              mock.timers.reset();
              NotificationPrefs.quietHours = saved;
          }
      });

      it('serveur : heures entieres qui couvrent la plage choisie, jamais de valeur vide', () => {
          assert.deepEqual(quietHoursForServer({ enabled: true, start: '22:30', end: '07:45' }), { start: 22, end: 8 });
          assert.deepEqual(quietHoursForServer({ enabled: true, start: 22, end: 8 }), { start: 22, end: 8 });
          assert.deepEqual(quietHoursForServer({ enabled: true, start: '23:30', end: '23:50' }), { start: 23, end: 0 });
          assert.deepEqual(quietHoursForServer({ enabled: true, start: null, end: 'x' }), { start: 22, end: 8 });
          assert.deepEqual(quietHoursForServer({ enabled: false, start: '22:30', end: '07:45' }), { start: null, end: null });
          const saved = { ...NotificationPrefs.quietHours };
          try {
              NotificationPrefs.quietHours = { enabled: true, start: '22:30', end: '07:45' };
              const fakeSub = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } }) };
              const params = subscriptionParams(fakeSub);
              assert.equal(params.p_quiet_start, 22);
              assert.equal(params.p_quiet_end, 8);
          } finally {
              NotificationPrefs.quietHours = saved;
          }
      });
  });

  describe('Textes des notifications : le vocabulaire de la fiche (NOTIF-06)', () => {
      it('ni « machine », ni « fonctionne », ni « plein », ni « signalée »', () => {
          const titles = Object.values(NOTIFICATION_TYPES).map(t => t.title);
          const messages = ['empty', 'broken', 'working', 'stock', 'restock'].map(type => buildFavoriteMessage('La Ferme', { type, product: 'Œufs' }));
          const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
          const start = index.indexOf('id="notifications-empty"');
          const empty = index.slice(start, index.indexOf('</p>', start)).replace(/<[^>]+>/g, ' ');
          for (const text of [...titles, ...messages, empty]) assert.doesNotMatch(text, /machine|fonctionne|plein|signalée/i, text);
          assert.match(empty, /vide, en panne ou de nouveau en service/);
          assert.equal(NOTIFICATION_TYPES.empty.title, 'Distributeur signalé vide');
          assert.equal(NOTIFICATION_TYPES.working.title, 'De nouveau en service');
          assert.equal(buildFavoriteMessage('La Ferme', { type: 'empty' }), 'La Ferme : signalé vide');
          assert.equal(buildFavoriteMessage('La Ferme', { type: 'broken' }), 'La Ferme : signalé en panne');
          assert.equal(buildFavoriteMessage('La Ferme', { type: 'working' }), 'La Ferme : de nouveau en service');
          assert.equal(buildPushMessage('La Ferme', { type: 'working' }), 'La Ferme : de nouveau en service');
      });
  });
  ```
- **Doit échouer avant les étapes 1-11** : `quietTimeToMinutes is not a function` (TypeError dans ces
  tests seulement : l'import dynamique rend `undefined`, le reste du fichier tourne), `isQuietHours()`
  rend `false` à 22:30 (une chaîne comparée à un nombre), et le titre vaut « Machine signalée vide ».

### Test 2 — réglages gardés sans bouton (fonctionnel)
- **Fichier** : `tests/functional/notifications.spec.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
- **Code à ajouter** :
  ```js

  // ============================================
  // 41. REGLAGES DES NOTIFICATIONS GARDES (NOTIF-06)
  // ============================================

  test.describe('41. Reglages des notifications gardes (NOTIF-06)', () => {
      async function openSettings(page) {
          await page.evaluate(async () => (await import('./js/notifications.js')).openNotificationSettings());
          await page.waitForSelector('#notification-settings.view-active');
      }

      function storedPrefs(page) {
          return page.evaluate(() => JSON.parse(localStorage.getItem('snackmatch_notification_prefs') || '{}'));
      }

      test('chaque réglage est gardé dès qu’on le change, minutes comprises, sans bouton', async ({ page }) => {
          await openSettings(page);
          await expect(page.locator('#notification-settings')).not.toContainText('Sauvegarder');
          await page.locator('#notif-enabled').uncheck();
          await page.fill('#quiet-start', '22:30');
          await page.fill('#quiet-end', '07:45');
          await page.click('#back-from-notif-settings');
          const prefs = await storedPrefs(page);
          expect(prefs.enabled).toBe(false);
          expect(prefs.quietHours.start).toBe('22:30');
          expect(prefs.quietHours.end).toBe('07:45');
          await openSettings(page);
          await expect(page.locator('#notif-enabled')).not.toBeChecked();
          await expect(page.locator('#quiet-start')).toHaveValue('22:30');
          await expect(page.locator('#quiet-end')).toHaveValue('07:45');
      });

      test('heure effacée : l’ancienne est gardée, jamais de valeur vide', async ({ page }) => {
          await openSettings(page);
          await page.fill('#quiet-start', '23:15');
          await page.evaluate(() => {
              const input = document.getElementById('quiet-start');
              input.value = '';
              input.dispatchEvent(new Event('change', { bubbles: true }));
          });
          await expect(page.locator('.toast').last()).toContainText('Heure incomplète : on garde 23:15');
          await expect(page.locator('#quiet-start')).toHaveValue('23:15');
          expect((await storedPrefs(page)).quietHours.start).toBe('23:15');
      });
  });
  ```
- **Doit échouer avant les étapes 7-9 et 14** : le premier test s'arrête sur `not.toContainText('Sauvegarder')` ;
  le second ne voit aucun toast (aucun écouteur `change`).

### Tests existants à adapter (nouveaux textes)
- `tests/integration/dom.test.js` :
  - `assert.match(notif.message, /Pain du Coin a été signalée vide/);` → `assert.match(notif.message, /Pain du Coin : signalé vide/);`
  - `{ type: 'empty', distributorId: 'dist-x', message: 'X a été signalée vide', read: false, timestamp: Date.now() }`
    → même ligne avec `message: 'X : signalé vide'`
  - `assert.match(row.textContent, /Machine signalée vide/);` → `assert.match(row.textContent, /Distributeur signalé vide/);`
- `tests/functional/notifications.spec.js` (test « machine en favori signalee vide… ») :
  - `` await expect(banner).toContainText(`${dist.name} a été signalée vide`); `` → `` `${dist.name} : signalé vide` ``
  - `await expect(row).toContainText('Machine signalée vide');` → `'Distributeur signalé vide'`
  - `` await expect(row).toContainText(`${dist.name} a été signalée vide`); `` → `` `${dist.name} : signalé vide` ``
- Ne **pas** toucher `Baguette vu dispo chez Pain du Coin` (dom.test.js), `Œufs vu dispo chez La Ferme`
  (unit.test.js) ni `Œufs vu dispo chez` (onboarding.spec.js) : les messages produit ne changent pas.

## Vérification (dans l'ordre)
```bash
node --check js/notifications.js && node --check js/utils.js && node --check js/push.js && node --check js/state.js && node --check js/app.js && node --check supabase/functions/push-notify/logic.js   # aucune sortie
grep -c "saveNotificationSettingsFromUI" js/app.js index.html            # 0 et 0
grep -c "a été signalée\|fonctionne de nouveau" js/notifications.js supabase/functions/push-notify/logic.js   # 0 et 0
npm test        # tout vert, dont « Heures calmes a la minute (NOTIF-06) », « Textes des notifications », « memes textes que le centre de notifications », « isQuietHours » et « cache-busting »
npx playwright test --project=functional -g "NOTIF-06"                                      # 2 passed
npx playwright test --project=functional -g "Centre de notifications|favoris qui notifient|Notifications app fermee|Suivre un produit|Ecran d"   # tout vert
npm run test:functional                                                                     # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat   # js/notifications.js, js/utils.js, js/push.js, js/state.js, js/app.js, supabase/functions/push-notify/logic.js, index.html, tests/unit/unit.test.js, tests/integration/dom.test.js, tests/functional/notifications.spec.js (+ BACKLOG.md)
```

## Hors périmètre
- Minutes côté serveur (migration de `push_subscriptions.quiet_start/quiet_end` et de `push_subscribe`,
  `isQuietTime` à la minute) : la plage couvrante suffit, voir « Ce qui est déjà tranché ».
- Messages « produit » (`stock` / `restock`, « Œufs vu dispo chez … ») et l'exemple de l'écran
  d'accueil : inchangés.
- Message de proximité « … est a 120m de toi » (accent, espace) : périmètre de NOTIF-04.
- « Machine en panne » de la modale « Signaler » (chat inactif) et « des machines » du tableau de bord :
  ce ne sont pas des notifications.
- Toast « Produit "…" retire » (accent) et « Distance: » des réglages : non signalés par la revue.
- Règle CSS `.settings-actions .btn-primary-clean` devenue inutile : laissée (toucher le CSS = bump `?v=`).
- Plage de presque 24 h dont le début et la fin tombent dans la même heure (ex. 08:30 - 08:15) :
  le serveur ne peut pas la représenter, il ne coupe que de 8 h à 9 h. Cas absurde, accepté.

## Pièges connus
- **Stories voisines** : NOTIF-02/03/04/05 modifient aussi `js/notifications.js` et `js/push.js`.
  - `saveNotificationSettingsFromUI` : NOTIF-04 (redémarrage du geofence) et NOTIF-05
    (`refreshPushSettings()`) ont pu y ajouter des lignes. L'étape 8 ne remplace **que** les 4 lignes
    d'heures et la ligne du toast : garder tout le reste tel quel.
  - `openNotificationSettings` : NOTIF-05 a pu y changer l'appel à `refreshPushSettings` ; l'étape 7 ne
    touche que `if (!settingsView) return;` et les deux lignes `quiet-start` / `quiet-end`.
  - `js/push.js` : NOTIF-05 réécrit l'abonnement (`ensureSubscription`, `enablePush`, `refreshPushSettings`),
    pas `subscriptionParams` ; si les lignes `quiet.enabled ? …` ont disparu ou changé, **s'arrêter**.
  - `logic.js` : NOTIF-01 y modifie `decideBaseEvent` / `eventForSubscriber` ; l'étape 6 ne touche que
    les 3 lignes de `buildPushMessage`.
  - `isQuietHours` : NOTIF-04 (file des heures calmes délivrée à leur fin) a pu ajouter un calcul de la
    prochaine fin des heures calmes ; voir le contrôle `grep -n "quietHours"` (11 lignes) : s'il en
    montre plus, s'arrêter.
- `quietHours.start` peut être un nombre (`22`, anciens réglages, `state.js`, `app.js`) ou une chaîne
  (`"22:30"`) : ne **jamais** le lire autrement que par `resolveQuietRange` / `quietHoursForServer`.
  Ne pas changer `start: 22, end: 8` dans `state.js` ni dans `app.js`.
- Étape 9 : l'écouteur appelle `saveNotificationSettingsFromUI()` **sans argument** (fonction nommée
  `saveSetting`) : ne pas passer la fonction directement à `addEventListener`.
- Test 1 : réassigner `NotificationPrefs.quietHours` puis le **remettre** (`saved`) ; les tests
  `isQuietHours` plus haut modifient ses champs.
- Test 2 : `page.fill` sur un `<input type="time">` envoie bien `input` puis `change` ; pour le champ
  vide, garder l'`evaluate` (fill('') n'est pas fiable sur ce type de champ).
- Fichiers en **CRLF** (tous ceux de la story) : outil Edit ; si un bloc refuse, petit script Node dans
  le scratchpad (voir README). Garder les emojis de `state.js` intacts (fichier UTF-8).
- Bump de **toutes** les entrées de l'import map à la **même** valeur.
- **Ne pas lancer** `node scripts/deploy-push.mjs` : c'est Claude (modèle principal) qui déploie après fusion.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (la page des réglages n'est pas dans le script de captures ; textes listés dans la PR)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée)
- [ ] PR : tableau des textes avant / après recopié pour validation par Stéphane, et rappel « après
      fusion : `node scripts/deploy-push.mjs` (Claude principal) »

## Modèle de PR
**Titre** : `fix(notifications): reglages gardes sans bouton, heures calmes a la minute, vocabulaire de la fiche`

**Corps** : constats couverts ; causes (heure seule gardée par `parseInt`, champ vide = `NaN` ;
enregistrement seulement par un bouton en bas de page ; textes « Machine » / « fonctionne » / « plein ») ;
correction (minutes sur le téléphone, plage couvrante en heures entières pour le serveur, enregistrement
à chaque changement, nouveaux textes) ; **tableau des textes avant / après à valider par Stéphane** ;
tests ajoutés et adaptés ; sorties des commandes de vérification ; « à faire après fusion : déployer
push-notify (`node scripts/deploy-push.mjs`, Claude principal) ».
