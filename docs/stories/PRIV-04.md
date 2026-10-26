# PRIV-04 — Une page « Confidentialité » claire, et une phrase d'accueil exacte

- **Lot** : 2. Vie privée · **Gravité** : moyen · **Niveau conseillé** : medium, relecture par
  un modèle plus fort avant fusion, **texte complet validé par Stéphane** (il le lit dans la PR)
- **Prérequis** : PRIV-07 fusionnée (et donc PRIV-01, PRIV-02, PRIV-03, PRIV-05, PRIV-06 : la page
  décrit l'app **après** tout le lot 2). Dernière fiche du lot 2.
- **Branche** : `feat/page-confidentialite` · **Taille** : 6 fichiers de code (`index.html`,
  `css/panels.css`, `js/navigation.js`, `js/app.js`, `js/auth.js`, `js/operators.js`) + 2 tests.
  Au-dessus de la limite de 3, **exception acceptée** : une seule page et ses quatre liens, à garder
  dans une seule PR.
- **Constats couverts** (rapport du 2026-10-21) :
  - Aucune information sur les données personnelles, et une promesse inexacte à l'accueil :
    « Jamais partagée, jamais stockée » — `index.html:103`

## But
Chacun trouve, depuis l'accueil, la fenêtre de connexion, le formulaire « C'est ton
distributeur ? » et la page Compte, une page « Confidentialité » qui dit en français simple ce que
DistriMatch enregistre, pourquoi, combien de temps, qui le voit, et comment le consulter, le corriger
ou l'effacer ; et la phrase d'accueil sur la position est exacte.

## User story
En tant que visiteur ou membre, je veux lire ce que DistriMatch fait de mes données avant de donner
ma position, mon e-mail ou les informations de mon entreprise, afin de décider en connaissance de
cause et de savoir à qui écrire.

**Critères d'acceptation**
- [ ] L'accueil ne contient plus « Jamais partagée, jamais stockée » ; il dit : « Ta position sert à
      centrer la carte et à calculer les distances, directement sur ton téléphone. », suivi d'un lien
      « Confidentialité ».
- [ ] Le lien de l'accueil marche **avant** d'avoir accepté la localisation ; « Retour » (et le
      bouton retour du téléphone) ramène l'accueil.
- [ ] Fenêtre de connexion : sous le champ e-mail, un lien « Ce que devient ton e-mail » ouvre la page
      **par-dessus** la fenêtre ; « Retour » rend la fenêtre avec l'e-mail déjà saisi.
- [ ] Formulaire « C'est ton distributeur ? » : un lien « Ce que deviennent ces informations » ouvre
      la page par-dessus la fiche ; « Retour » rend la fiche et le formulaire tel qu'il était rempli.
- [ ] Page Compte : une ligne « Confidentialité » ouvre la page ; « Retour » ramène Compte.
- [ ] La page a sept rubriques, dans cet ordre : Qui est responsable · Ta position · Ce que l'app
      enregistre, et pourquoi · Ce qui est public · Les services utilisés · Combien de temps · Tes droits.
- [ ] Aucune adresse de contact inventée : les emplacements `[NOM DU RESPONSABLE]`,
      `[ADRESSE DE CONTACT]` et `[DATE DE MISE À JOUR]` sont gardés tant que Stéphane n'a pas choisi
      (voir « Action de Stéphane avant la fusion ») ; la PR est ouverte **en brouillon**.

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
Ni `index.html` ni `js/` ne contiennent « confidentialité », « données personnelles » ou « RGPD ».
L'app collecte pourtant l'e-mail (connexion), des avis, des signaux, des fiches ajoutées, une
demande d'exploitant (entreprise, message, puis SIRET et échange avec l'équipe), un abonnement aux
notifications et une mesure d'audience. La fenêtre de connexion demande l'e-mail sans dire ce qu'on
en fait (RGPD art. 13).

La phrase « Ta position est privée. Jamais partagée, jamais stockée. » est inexacte : la carte
demande à `tile.openstreetmap.org` les images du quartier affiché (donc de l'endroit où l'on est), et
un scan de QR code enregistre l'ouverture de la fiche d'un distributeur précis, avec l'heure.

**Ce qui a été vérifié dans le code (ne pas refaire) : la position elle-même n'est jamais envoyée au
serveur.** `AppState.userLocation` sert à centrer la carte (`js/map.js`), aux distances
(`js/utils.js`), au coup de pouce sur place (`js/availability.js`, calcul local), à la preuve de
présence pour une photo (`js/add-distributor.js`, `js/gmaps-ui.js`, calcul local, photos inactives).
Aucun appel Supabase ne la contient. À l'ajout d'une fiche, `lat` / `lng` viennent du **repère posé
sur la carte** (`onMapClickForPlacement`, déplaçable), pas du GPS. « Itinéraire » ouvre Google Maps
avec la position **du distributeur**. Les autres services contactés : Supabase, hCaptcha (script chargé avec la page,
PRIV-06 l'a laissé hors périmètre), tuiles OpenStreetMap, unpkg / jsDelivr (Leaflet,
supabase-js), le service de notification du navigateur, l'annuaire des entreprises de l'État
(`recherche-entreprises.api.gouv.fr`, interrogé par le navigateur de l'admin, `js/admin.js`).

**Choix de conception (déjà tranchés, ne pas refaire)** :
- Une **vue** dans l'app (même mécanisme que Compte : `VIEW_CONFIG` / `switchView` de
  `js/navigation.js`, `div.view-page` dans `index.html`), pas un fichier HTML séparé : cohérence,
  cache-busting, marche hors ligne. Contenu **statique** dans `index.html` (aucun rendu JS).
- Trois des quatre liens sont sous des couches plus hautes que les vues (`.view-page` = 150) :
  accueil 10 000, fiche 10 500, fenêtre de connexion 11 000. La page Confidentialité passe donc
  **au-dessus de tout**, plein écran (z-index 11 200), sous la fenêtre de confirmation (11 500) et
  les messages (12 000). Ainsi, on lit la page puis « Retour » rend exactement ce qui était dessous,
  saisie comprise (rien n'est fermé).
- Un **seul écouteur** sur `document` pour tout élément `[data-open-privacy]` (les liens de la
  fenêtre de connexion et du formulaire d'exploitant sont créés par JS à la volée). Il est posé
  **avant** `await initGeolocationOverlay()` dans `js/app.js` : les autres écouteurs (boutons
  retour...) ne sont posés qu'après la géolocalisation, le lien de l'accueil serait mort.
- Les liens sont des `<button type="button">` (pas de `<a href="#">` : le `#` toucherait l'URL et
  les liens profonds ; `type="button"` : sinon le bouton enverrait le formulaire qui le contient).
- « Retour » : rouvre la vue d'où l'on vient (Compte), sinon ferme la page seule (`goBackToMap`,
  qui cache les vues et laisse en place accueil, fiche et fenêtre de connexion). Le retour du
  téléphone passe par la couche `view` déjà gérée par `switchView` (`js/history.js`).

## Avant de coder
**Lire en entier** : `index.html` lignes 95-105 (fin de l'accueil) et la vue `#account-view`
(vers 631-703) ; `js/navigation.js` lignes 1-75 ; `js/app.js` lignes 20-26, 570-630 et 740-760 ;
`js/auth.js` lignes 229-262 (`openEmailModal`) ; `js/operators.js` lignes 124-150 (`openClaimForm`)
et 440-465 (écouteurs de `#dist-operator`) ; `css/panels.css` lignes 285-316 (`.view-page`) et
640-651 (`.account-page`, `.account-card`) ; `css/overlays.css` lignes 33-38, 82-85 et 2404
(`.geoloc-hint`).

**Réutiliser** (ne pas réécrire) : `switchView`, `goBackToMap`, `VIEW_CONFIG` (`js/navigation.js`) ;
les classes `account-page`, `account-card`, `account-section-label`, `account-row*`,
`page-header-inner`, `back-btn`, `stats-intro` ; `setupApp`, `loginForTest`, `openSignalableFiche`,
`BASE_URL`, `EVENTS_ROUTE` (`tests/functional/helpers.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n 'Jamais partagée, jamais stockée' index.html                        # 1 ligne (vers 103)
grep -n '<!-- Reinitialisation : seule action destructive de la page -->' index.html   # 1 ligne
grep -n 'PAGE TABLEAU DE BORD DU PILOTE (vues kpi_' index.html               # 1 ligne
grep -n "'my-additions':          { id: 'my-additions-view',    onShow: null }," js/navigation.js   # 1 ligne
grep -n '^export function goBackToMap() {' js/navigation.js                  # 1 ligne
grep -n 'performSearch, initFilterChips, updateProfileStats' js/app.js       # 1 ligne (import, vers 24)
grep -n "window.addEventListener('storage', handleStorageFromOtherTab);" js/app.js   # 1 ligne
grep -n "^document.addEventListener('DOMContentLoaded', async () => {" js/app.js     # 1 ligne
grep -n '<input type="email" placeholder="ton@email.com" required autofocus>' js/auth.js   # 1 ligne
grep -n '<textarea name="message" maxlength="500" rows="2"></textarea>' js/operators.js    # 1 ligne
grep -rn 'data-open-privacy\|privacy-view' index.html js css tests           # rien
grep -n 'css/panels.css?v=' index.html                                       # ?v=42 ou plus
grep -n '"./js/app.js": "./js/app.js?v=' index.html                          # ?v=108 ou plus
# Le lot 2 est bien en place (le texte de la page le décrit) :
ls supabase/033_account_deletion.sql                      # 1 fichier (PRIV-07)
grep -rn -i 'supprimer mon compte' index.html js/*.js     # rien : pas de bouton, suppression sur demande par e-mail (PRIV-07)
grep -c 'js.hcaptcha.com' index.html   # 1 : hCaptcha chargé avec la page (PRIV-06 l'a laissé hors périmètre)
grep -n 'getDeviceId' js/events.js                          # rien : mesure par session (PRIV-05)
grep -rn -i "13 month\|13 mois" supabase/*.sql              # au moins 1 ligne : purge des événements (PRIV-05)
grep -rn -i 'drop column.*user_id' supabase/*.sql | grep -i push   # rien : l'abonnement garde le compte connecté (024)
```
Si un contrôle du lot 2 échoue, **s'arrêter** : soit une story du lot n'est pas fusionnée, soit elle
a fait autrement que prévu, et une phrase de la page deviendrait fausse.

## Étapes

1. **index.html** — phrase d'accueil exacte + lien (vers la ligne 103).
   Avant :
   ```html
               <p class="geoloc-hint">Ta position est privée. Jamais partagée, jamais stockée.</p>
   ```
   Après :
   ```html
               <p class="geoloc-hint">Ta position sert à centrer la carte et à calculer les distances, directement sur ton téléphone.</p>
               <p class="geoloc-hint geoloc-privacy"><button type="button" class="privacy-link" data-open-privacy>Confidentialité</button></p>
   ```
   Phrase retenue par défaut : **variante A** ci-dessus. Variante B, si Stéphane la préfère dans la
   PR : « Ta position s'utilise sur ton téléphone, pour la carte et les distances : elle n'est pas
   envoyée à DistriMatch. » (avec l'apostrophe typographique ’). Ne **pas** écrire « reste » : le test
   `30. Ecran d'accueil` l'interdit.

2. **index.html** — ligne « Confidentialité » dans Compte. Juste **avant** la ligne
   `            <!-- Reinitialisation : seule action destructive de la page -->`, insérer :
   ```html
               <!-- PRIV-04 : page Confidentialite (lien data-open-privacy, js/app.js) -->
               <h3 class="account-section-label">Informations</h3>
               <section class="account-card">
                   <button class="account-row" id="account-privacy-row" data-open-privacy>
                       <span class="account-row-main">
                           <span class="account-row-icon" aria-hidden="true">🔒</span>
                           <span class="account-row-label">Confidentialité</span>
                       </span>
                       <svg class="account-row-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
                   </button>
               </section>

   ```

3. **index.html** — la vue. Avant (les deux lignes qui suivent la fin de `#account-view`) :
   ```html
       <!-- ============================================
            PAGE TABLEAU DE BORD DU PILOTE (vues kpi_*, js/stats.js)
   ```
   Après (le bloc neuf, puis ces deux mêmes lignes inchangées) :
   ```html
       <!-- PRIV-04 : page Confidentialite (js/navigation.js openPrivacyView / closePrivacyView ;
            au-dessus de l'accueil, de la fiche et de la connexion : css/panels.css) -->
       <div id="privacy-view" class="view-page view-hidden" inert>
           <div class="page-header-inner">
               <button class="back-btn" id="back-from-privacy" aria-label="Retour">
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                       <path d="M19 12H5M12 19l-7-7 7-7"/>
                   </svg>
               </button>
               <h2>Confidentialité</h2>
           </div>
           <div class="account-page privacy-page">
               <p class="stats-intro">Ce que DistriMatch enregistre, pourquoi, et comment le consulter, le corriger ou l’effacer.</p>

               <h3 class="account-section-label">Qui est responsable</h3>
               <section class="account-card">
                   <p>DistriMatch est édité par [NOM DU RESPONSABLE].</p>
                   <p>Pour toute question sur tes données, écris à <a href="mailto:[ADRESSE DE CONTACT]">[ADRESSE DE CONTACT]</a>.</p>
               </section>

               <h3 class="account-section-label">Ta position</h3>
               <section class="account-card">
                   <p>Ta position sert à centrer la carte, à calculer les distances et à savoir si tu es devant un distributeur. Ces calculs se font sur ton téléphone : ta position n’est pas envoyée à DistriMatch.</p>
                   <p>Pour dessiner la carte, ton téléphone demande à OpenStreetMap les images du quartier affiché, comme toute carte en ligne.</p>
                   <p>Quand tu ajoutes un distributeur, c’est l’emplacement que tu poses sur la carte qui est enregistré.</p>
               </section>

               <h3 class="account-section-label">Ce que l’app enregistre, et pourquoi</h3>
               <section class="account-card">
                   <ul>
                       <li><strong>Ton adresse e-mail</strong>, si tu te connectes : pour t’envoyer le lien et le code de connexion. Pas de mot de passe.</li>
                       <li><strong>Tes signaux</strong> (Dispo, Pas dispo, En service, Vide, En panne) : pour informer les autres membres. Ils sont liés à ton compte pour limiter les abus ; les autres membres ne voient pas qui a signalé (un exploitant vérifié signale sous l’étiquette « Info de l’exploitant »).</li>
                       <li><strong>Tes avis</strong> (note et commentaire) : publiés sous le nom « Membre DistriMatch ».</li>
                       <li><strong>Les distributeurs que tu ajoutes</strong> (nom, type, produits, emplacement) : l’équipe voit ton e-mail quand elle les valide, et tu peux échanger des messages avec elle à leur sujet.</li>
                       <li><strong>Tes modifications de fiches</strong> (produits ajoutés, renommés ou retirés, niveau de prix) : enregistrées avec ton compte dans un journal que seule l’équipe consulte, pour corriger une erreur ou un abus.</li>
                       <li><strong>Ta demande d’exploitant</strong> : ton lien avec le distributeur, le nom de l’entreprise, ton message, puis le SIRET et les messages échangés avec l’équipe. Ils servent à vérifier que l’entreprise exploite bien le distributeur ; l’équipe voit ton e-mail. Le code de vérification est envoyé à l’entreprise, par courrier à son adresse officielle ou par téléphone.</li>
                       <li><strong>Les notifications app fermée</strong>, si tu les actives : l’adresse d’abonnement fournie par ton navigateur, tes favoris, tes produits suivis, tes heures calmes et ton fuseau horaire. Aucun compte n’est nécessaire ; si tu es connecté, ton compte y est rattaché pour ne pas te prévenir de tes propres signaux.</li>
                       <li><strong>La mesure d’audience</strong> : ouverture de l’app ou d’une fiche, scan d’un QR code, signal envoyé, itinéraire demandé. Ces événements portent un identifiant tiré au hasard pour la visite, jamais enregistré avec ton compte. Ils servent à savoir si l’app est utile, distributeur par distributeur.</li>
                       <li><strong>Sur ton téléphone</strong> : tes favoris, tes produits suivis, tes réglages et les notifications reçues (favoris, produits suivis et heures calmes partent aussi dans l’abonnement si tu actives les notifications app fermée).</li>
                   </ul>
                   <p>Le compte, les contributions et la vérification d’exploitant servent le service que tu demandes. La mesure d’audience et la limite contre les abus relèvent de l’intérêt légitime de DistriMatch à faire fonctionner l’app. Les notifications app fermée dépendent de ton accord, que tu retires dans les réglages des notifications.</p>
               </section>

               <h3 class="account-section-label">Ce qui est public</h3>
               <section class="account-card">
                   <p>Tout le monde voit les fiches publiées, l’état des distributeurs, la dispo des produits et les avis, sous le nom « Membre DistriMatch ». Ton e-mail n’apparaît sur aucune fiche.</p>
               </section>

               <h3 class="account-section-label">Les services utilisés</h3>
               <section class="account-card">
                   <ul>
                       <li><strong>Supabase</strong> : la base de données et la connexion ; elle garde ce qui est décrit plus haut.</li>
                       <li><strong>hCaptcha</strong> : vérifie que la connexion vient d’une personne ; son script se charge avec la page.</li>
                       <li><strong>OpenStreetMap</strong> : les images de la carte.</li>
                       <li><strong>GitHub Pages et Cloudflare Pages</strong> : hébergent le site.</li>
                       <li><strong>unpkg et jsDelivr</strong> : fournissent la carte (Leaflet) et la liaison avec la base.</li>
                       <li><strong>Le service de notification de ton navigateur</strong> (Google, Apple ou Mozilla) : transmet les notifications app fermée.</li>
                       <li><strong>Google Maps</strong> : s’ouvre quand tu demandes un itinéraire, avec la position du distributeur.</li>
                       <li><strong>L’annuaire des entreprises de l’État</strong> : l’équipe y vérifie l’entreprise d’une demande d’exploitant.</li>
                   </ul>
                   <p>Ces services reçoivent l’adresse IP de ton téléphone quand il les contacte. Certains sont établis hors de l’Union européenne.</p>
               </section>

               <h3 class="account-section-label">Combien de temps</h3>
               <section class="account-card">
                   <ul>
                       <li><strong>Ton compte, tes avis, ta demande d’exploitant et ses messages</strong> : tant que tu gardes ton compte ; ils sont effacés avec lui.</li>
                       <li><strong>Tes signaux</strong> : gardés pour l’historique des distributeurs ; une fois ton compte supprimé, ils ne sont plus rattachés à personne.</li>
                       <li><strong>Tes modifications de fiches</strong> : gardées dans ce journal ; une fois ton compte supprimé, elles ne sont plus rattachées à personne.</li>
                       <li><strong>Les distributeurs que tu as ajoutés</strong>, et les messages échangés avec l’équipe à leur sujet : gardés, car ils servent à tous ; une fois ton compte supprimé, ils ne sont plus rattachés à personne.</li>
                       <li><strong>L’abonnement aux notifications app fermée</strong> : jusqu’à ce que tu le coupes, ou 60 jours après sa dernière mise à jour.</li>
                       <li><strong>La mesure d’audience</strong> : 13 mois.</li>
                       <li><strong>Sur ton téléphone</strong> : jusqu’à « Effacer mes données », dans la page Compte.</li>
                   </ul>
               </section>

               <h3 class="account-section-label">Tes droits</h3>
               <section class="account-card">
                   <p>Pour supprimer ton compte, écris à <a href="mailto:[ADRESSE DE CONTACT]">[ADRESSE DE CONTACT]</a> depuis l’adresse e-mail de ce compte. Ton e-mail, tes avis, ta demande d’exploitant et ses messages sont effacés ; tes signaux, tes modifications et les distributeurs que tu as ajoutés sont gardés, sans lien avec toi.</p>
                   <p>Tu peux aussi demander à consulter tes données, à les corriger, à les effacer, à les récupérer ou à en limiter l’usage, et t’opposer à leur utilisation : écris à <a href="mailto:[ADRESSE DE CONTACT]">[ADRESSE DE CONTACT]</a>.</p>
                   <p>Si tu estimes que tes droits ne sont pas respectés, tu peux adresser une réclamation à la CNIL : <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener">cnil.fr</a>.</p>
               </section>

               <p class="stats-intro privacy-updated">Mise à jour : [DATE DE MISE À JOUR]</p>
           </div>
       </div>

       <!-- ============================================
            PAGE TABLEAU DE BORD DU PILOTE (vues kpi_*, js/stats.js)
   ```
   Recopier le texte **à l'identique**, apostrophes typographiques `’` comprises (le test unitaire
   compare les titres caractère par caractère). Ne pas remplacer les emplacements entre crochets.

4. **css/panels.css** — à la **fin du fichier**, ajouter :
   ```css

   /* ============================================
      PAGE CONFIDENTIALITE (PRIV-04)
      ============================================ */
   /* Elle s'ouvre aussi depuis l'accueil (10000), la fiche (10500) et la fenetre de
      connexion (11000) : elle passe au-dessus d'elles, plein ecran, sous la fenetre de
      confirmation (11500) et les messages (--z-toast, 12000) */
   #privacy-view.view-page {
       top: 0;
       bottom: 0;
       z-index: 11200;
       padding-top: env(safe-area-inset-top, 0px);
   }
   .privacy-page .account-card { padding: 1rem 1.25rem; }
   .privacy-page .account-card p,
   .privacy-page .account-card li { font-size: 0.9rem; line-height: 1.55; color: var(--dark); }
   .privacy-page .account-card p { margin: 0 0 0.6rem; }
   .privacy-page .account-card p:last-child { margin-bottom: 0; }
   .privacy-page .account-card ul { margin: 0 0 0.6rem; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.6rem; }
   .privacy-page .account-card ul:last-child { margin-bottom: 0; }
   .privacy-page a { color: var(--primary-text); }
   .privacy-updated { margin-top: 1.5rem; }

   /* Lien « Confidentialité » (accueil, connexion, formulaire d'exploitant) : texte
      souligne, cible de 44 px de haut (cibles tactiles) */
   .privacy-link {
       display: inline-flex;
       align-items: center;
       min-height: 44px;
       padding: 0;
       background: none;
       border: none;
       font: inherit;
       color: inherit;
       text-decoration: underline;
       cursor: pointer;
   }
   .geoloc-hint.geoloc-privacy { margin-top: 0 !important; }
   .auth-modal-privacy,
   .operator-privacy { margin: 0; font-size: 0.85rem; color: #4B5563; }
   ```
   `!important` sur `.geoloc-privacy` : `.geoloc-hint` impose déjà `margin-top ... !important`
   (`css/overlays.css`, chargé après) ; la double classe l'emporte.

5. **js/navigation.js** — la vue et ses deux fonctions.
   a) Dans `VIEW_CONFIG`, avant :
   ```js
       'my-additions':          { id: 'my-additions-view',    onShow: null },
   ```
   après :
   ```js
       'my-additions':          { id: 'my-additions-view',    onShow: null },
       privacy:                 { id: 'privacy-view',         onShow: null },
   ```
   b) Juste **après** la fonction (avant le bloc `// BADGES`) :
   ```js
   export function goBackToMap() {
       switchTab('explore');
   }
   ```
   ajouter :
   ```js

   // ============================================
   // PAGE CONFIDENTIALITE (PRIV-04)
   // ============================================
   // Ouverte depuis l'accueil, la fenetre de connexion, la fiche (formulaire d'exploitant)
   // ou Compte. Elle passe au-dessus de tout (css/panels.css) : « Retour » rouvre la vue
   // d'ou l'on vient (Compte), sinon ferme la page seule et laisse en place l'accueil, la
   // fiche ou la fenetre de connexion restes dessous.
   let privacyReturn = null;   // { view: vue a rouvrir ou null, focus: element a refocaliser }

   export function openPrivacyView() {
       const active = document.querySelector('.view-page.view-active');
       const from = active ? Object.keys(VIEW_CONFIG).find(name => VIEW_CONFIG[name].id === active.id) : null;
       if (from !== 'privacy') privacyReturn = { view: from || null, focus: document.activeElement };
       switchView('privacy');
       document.getElementById('privacy-view')?.scrollTo?.(0, 0);
       document.getElementById('back-from-privacy')?.focus();
   }

   export function closePrivacyView() {
       const back = privacyReturn || { view: null, focus: null };
       privacyReturn = null;
       if (back.view) switchView(back.view);
       else goBackToMap();
       if (back.focus && document.contains(back.focus) && typeof back.focus.focus === 'function') back.focus.focus();
   }
   ```

6. **js/app.js** — import et écouteurs.
   a) Import (vers la ligne 24), avant :
   ```js
       switchView, switchTab, goBackToMap, registerViewCallback, updateBadges, updateConversationsBadge, closeSidebar, setFilter, openSearch, closeSearch, performSearch, initFilterChips, updateProfileStats
   ```
   après :
   ```js
       switchView, switchTab, goBackToMap, registerViewCallback, updateBadges, updateConversationsBadge, closeSidebar, setFilter, openSearch, closeSearch, performSearch, initFilterChips, updateProfileStats,
       openPrivacyView, closePrivacyView
   ```
   b) Juste **avant** la ligne `document.addEventListener('DOMContentLoaded', async () => {`
   (niveau du module), ajouter :
   ```js
   // Lien « Confidentialité » touche, ou qu'il soit : accueil, fenetre de connexion,
   // formulaire d'exploitant, Compte (PRIV-04)
   function handlePrivacyLinkClick(e) {
       if (e.target.closest('[data-open-privacy]')) openPrivacyView();
   }

   ```
   c) Juste **après** la ligne `    window.addEventListener('storage', handleStorageFromOtherTab);`
   (dans le rappel `DOMContentLoaded`, **avant** `await initGeolocationOverlay();`), ajouter :
   ```js

       // PRIV-04 : page Confidentialite. Poses AVANT l'attente de la geolocalisation, sinon
       // le lien de l'accueil ne repondrait qu'apres le consentement
       document.addEventListener('click', handlePrivacyLinkClick);
       document.getElementById('back-from-privacy')?.addEventListener('click', closePrivacyView);
   ```
   Ne **pas** mettre ces lignes avec les autres boutons retour (vers la ligne 743) : elles sont
   posées après la géolocalisation.

7. **js/auth.js** — lien sous le champ e-mail de `openEmailModal`. Avant :
   ```js
                   <input type="email" placeholder="ton@email.com" required autofocus>
   ```
   après :
   ```js
                   <input type="email" placeholder="ton@email.com" required autofocus>
                   <p class="auth-modal-privacy"><button type="button" class="privacy-link" data-open-privacy>Ce que devient ton e-mail</button></p>
   ```
   Rien d'autre dans auth.js : l'écouteur de `document` (étape 6) gère le clic.

8. **js/operators.js** — lien dans le formulaire « C'est ton distributeur ? » (`openClaimForm`).
   Avant :
   ```js
                   <textarea name="message" maxlength="500" rows="2"></textarea>
               </label>
               <p class="operator-form-error" id="dist-operator-error" role="alert" hidden></p>
   ```
   après :
   ```js
                   <textarea name="message" maxlength="500" rows="2"></textarea>
               </label>
               <p class="operator-privacy"><button type="button" class="privacy-link" data-open-privacy>Ce que deviennent ces informations</button></p>
               <p class="operator-form-error" id="dist-operator-error" role="alert" hidden></p>
   ```
   Ne rien ajouter à l'écouteur de `#dist-operator` : le clic remonte jusqu'à `document`.

9. **index.html** — versions `?v=` : monter de 1 **toutes** les entrées de l'import map (même
   valeur, ex. 108 → 109 ou plus selon master) et le `?v=` de `css/panels.css` (ex. 42 → 43).

## Tests

### Test unitaire (garde-fou)
- **Fichier** : `tests/unit/unit.test.js`, à la **fin du fichier** (`readFileSync` est déjà importé).
- **Nom** : `describe('Confidentialité (PRIV-04)')`, trois `it`.
- **Code à ajouter** :
  ```js

  // PRIV-04 : page Confidentialite et phrase d'accueil exacte
  describe('Confidentialité (PRIV-04)', () => {
      const root = new URL('../../', import.meta.url);
      const html = readFileSync(new URL('index.html', root), 'utf8');

      it('l’accueil ne promet plus « jamais partagée, jamais stockée »', () => {
          assert.ok(!/jamais stock/i.test(html), 'index.html contient encore « jamais stockée »');
          assert.ok(!/jamais partag/i.test(html), 'index.html contient encore « jamais partagée »');
      });

      it('la page contient les sept rubriques attendues, sans « tap » ni « machine »', () => {
          const start = html.indexOf('id="privacy-view"');
          assert.ok(start > 0, 'vue #privacy-view absente de index.html');
          const page = html.slice(start, html.indexOf('PAGE TABLEAU DE BORD DU PILOTE', start));
          const titles = [...page.matchAll(/<h3 class="account-section-label">([^<]+)<\/h3>/g)].map(m => m[1].trim());
          assert.deepEqual(titles, ['Qui est responsable', 'Ta position', 'Ce que l’app enregistre, et pourquoi',
              'Ce qui est public', 'Les services utilisés', 'Combien de temps', 'Tes droits']);
          for (const s of ['Supabase', 'hCaptcha', 'OpenStreetMap', 'CNIL', '13 mois']) assert.ok(page.includes(s), `« ${s} » attendu`);
          assert.ok(!/\btap\b|machine/i.test(page.replace(/<[^>]+>/g, ' ')), 'ni « tap » ni « machine »');
      });

      it('un lien vers la page dans l’accueil, Compte, la connexion et la demande d’exploitant', () => {
          const welcome = html.slice(html.indexOf('id="geoloc-overlay"'), html.indexOf('<!-- Navigation Top -->'));
          const account = html.slice(html.indexOf('id="account-view"'), html.indexOf('id="privacy-view"'));
          assert.ok(welcome.includes('data-open-privacy'), 'accueil');
          assert.ok(account.includes('data-open-privacy'), 'Compte');
          for (const f of ['js/auth.js', 'js/operators.js']) {
              assert.ok(readFileSync(new URL(f, root), 'utf8').includes('data-open-privacy'), f);
          }
      });
  });
  ```
- **Doit échouer avant** : « jamais stockée » est encore dans `index.html` et `#privacy-view`
  n'existe pas.

### Tests fonctionnels
- **Fichier** : `tests/functional/confidentialite.spec.js` (nouveau : un fichier par domaine).
- **Nom du groupe** : `49. Confidentialité (PRIV-04)`, quatre tests.
- **Code complet du fichier** :
  ```js
  /**
   * DistriMatch - Tests fonctionnels : page Confidentialite (PRIV-04)
   *
   * La page s'ouvre depuis l'accueil (avant le consentement a la localisation), la
   * fenetre de connexion, le formulaire « C'est ton distributeur ? » et Compte ;
   * « Retour » (ou le retour du telephone) la ferme et rend ce qui etait dessous,
   * saisie comprise. La base est simulee la ou il le faut. Lancer : npm run test:functional
   */
  import { test, expect } from '@playwright/test';
  import { BASE_URL, EVENTS_ROUTE, setupApp, loginForTest, openSignalableFiche } from './helpers.js';

  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  test.describe('49. Confidentialité (PRIV-04)', () => {
      test('accueil : le lien ouvre la page avant la localisation, Retour et retour du téléphone ramènent l’accueil', async ({ browser }) => {
          const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
          await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
          const page = await context.newPage();
          await page.goto(BASE_URL);
          await page.waitForSelector('#geoloc-btn', { state: 'visible', timeout: 15000 });
          await expect(page.locator('#geoloc-overlay')).not.toContainText('jamais stockée');
          await page.click('#geoloc-overlay [data-open-privacy]');
          await expect(page.locator('#privacy-view')).toHaveClass(/view-active/);
          await expect(page.locator('#privacy-view h2')).toHaveText('Confidentialité');
          await page.click('#back-from-privacy');
          await expect(page.locator('#privacy-view')).not.toHaveClass(/view-active/);
          await expect(page.locator('#geoloc-btn')).toBeVisible();
          await page.click('#geoloc-overlay [data-open-privacy]');
          await expect(page.locator('#privacy-view')).toHaveClass(/view-active/);
          await page.goBack({ waitUntil: 'commit' }).catch(() => {});
          await expect(page.locator('#privacy-view')).not.toHaveClass(/view-active/);
          await expect(page.locator('#geoloc-btn')).toBeVisible();
          await context.close();
      });

      test('Compte : la ligne ouvre la page, Retour ramène Compte', async ({ page, context }) => {
          await setupApp(page, context);
          await page.evaluate(() => window.switchView('account'));
          await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
          await page.click('#account-privacy-row');
          await expect(page.locator('#privacy-view')).toHaveClass(/view-active/);
          await page.click('#back-from-privacy');
          await expect(page.locator('#account-view')).toHaveClass(/view-active/);
          await expect(page.locator('#privacy-view')).not.toHaveClass(/view-active/);
      });

      test('connexion : le lien sous l’e-mail ouvre la page par-dessus, Retour rend la fenêtre et la saisie', async ({ page, context }) => {
          await setupApp(page, context);
          await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
          await page.click('#btn-add-distributor');
          await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });
          await page.fill('.auth-modal input[type="email"]', 'moi@example.test');
          await page.click('.auth-modal [data-open-privacy]');
          await expect(page.locator('#privacy-view')).toHaveClass(/view-active/);
          await page.click('#back-from-privacy');   // echoue si la fenetre de connexion recouvre la page
          await expect(page.locator('#privacy-view')).not.toHaveClass(/view-active/);
          await expect(page.locator('.auth-modal input[type="email"]')).toHaveValue('moi@example.test');
      });

      test('« C’est ton distributeur ? » : le lien ouvre la page par-dessus la fiche, Retour rend le formulaire rempli', async ({ page, context }) => {
          await setupApp(page, context);
          await page.route('**/rest/v1/rpc/is_admin', r => r.fulfill(json(false)));
          await page.route('**/rest/v1/rpc/my_operated_distributors', r => r.fulfill(json([])));
          await page.route(u => u.pathname.endsWith('/rest/v1/operator_requests'), r => r.fulfill(json([])));
          await page.route(u => u.pathname.endsWith('/rest/v1/operator_request_messages'), r => r.fulfill(json([])));
          await loginForTest(page);
          await openSignalableFiche(page, { login: false });
          await page.click('.dist-tab[data-tab="apropos"]');
          await page.click('#dist-operator-claim');
          await page.fill('#dist-operator-form input[name="company"]', 'Ferme Exemple');
          await page.click('#dist-operator-form [data-open-privacy]');
          await expect(page.locator('#privacy-view')).toHaveClass(/view-active/);
          await page.click('#back-from-privacy');   // echoue si la fiche recouvre la page
          await expect(page.locator('#privacy-view')).not.toHaveClass(/view-active/);
          await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
          await expect(page.locator('#dist-operator-form input[name="company"]')).toHaveValue('Ferme Exemple');
      });
  });
  ```
- **Doivent échouer avant la correction** : aucun élément `[data-open-privacy]` ni
  `#account-privacy-row` n'existe, chaque `page.click` sur le lien expire.
- Les routes simulées sont posées **avant** `loginForTest` (la connexion relit l'état d'exploitant).

## Vérification (dans l'ordre)
```bash
grep -n -i 'jamais stock' index.html                                   # rien
grep -c 'data-open-privacy' index.html                                 # 2 (accueil + Compte)
grep -n '\[NOM DU RESPONSABLE\]\|\[ADRESSE DE CONTACT\]\|\[DATE DE MISE' index.html   # 5 lignes (l'adresse : 3 fois, sur 3 lignes), à citer dans la PR
node --test --test-name-pattern="PRIV-04" tests/unit/unit.test.js      # 3 tests passent
npx playwright test --project=functional -g "PRIV-04"                  # 4 passed
npx playwright test --project=functional -g "30. Ecran d"              # accueil : 1 passed
npx playwright test --project=functional -g "10. Politique"            # fenêtre de connexion : tous passent
npx playwright test --project=functional -g "33. Demande"              # formulaire d'exploitant : tous passent
npx playwright test --project=functional -g "23. Bouton retour"        # tous passent
npm test                                                               # tout vert (dont cache-busting)
npm run test:functional                                                # en arrière-plan (~10 min) : tout vert, instables notés
```

## Action de Stéphane avant la fusion
L'exécutant **ne fusionne pas** et ouvre la PR **en brouillon** (`gh pr create --draft`). Avant
la fusion, Stéphane :
1. **Choisit le nom du responsable** (`[NOM DU RESPONSABLE]` : son nom, ou celui de sa structure)
   et **l'adresse de contact** (`[ADRESSE DE CONTACT]`, trois fois). Ne jamais mettre d'adresse
   personnelle sans son accord explicite ; ne rien inventer.
2. **Valide la phrase d'accueil** : variante A (par défaut) ou B (étape 1).
3. **Lit le texte complet de la page** dans la PR et le corrige s'il le souhaite.
Puis Claude (modèle principal) remplace les trois emplacements (`[DATE DE MISE À JOUR]` = jour
de la fusion, ex. « 30 octobre 2026 »), relance `npm test` et `-g "PRIV-04"`, et passe la PR en
« prête ».

## Hors périmètre
- Bandeau de cookies ou de consentement : l'app ne dépose pas de traceur publicitaire ; non.
- Page Confidentialité en fichier HTML séparé, ou en anglais : non.
- Bouton « Télécharger mes données » ou demande de droits par formulaire : la demande se fait par
  e-mail.
- Ajouter un bouton « Supprimer mon compte » : non, la suppression se fait sur demande par e-mail (PRIV-07).
- Toucher à la suppression du compte (PRIV-07), à hCaptcha (PRIV-06), à la mesure (PRIV-05) : la page
  les décrit, elle ne les change pas.
- Le texte de la fenêtre de connexion au-dessus du champ (« Pour ajouter, modifier ou suivre... ») :
  inchangé.
- La règle générique `.view-page` : ne pas la modifier, seule `#privacy-view` passe au-dessus.

## Pièges connus
- **Écouteurs posés après la géolocalisation** : si `handlePrivacyLinkClick` est branché avec les
  boutons retour (vers la ligne 743 de `js/app.js`), le lien de l'accueil ne fait rien avant le
  consentement et le premier test échoue. Le poser juste après `handleStorageFromOtherTab`.
- **`<button>` sans `type="button"`** dans la fenêtre de connexion ou le formulaire d'exploitant :
  il enverrait le formulaire. Pas de `<a href="#">` non plus.
- **z-index** : ne pas dépasser 11 500 (fenêtre de confirmation) ni 12 000 (messages) ; ne pas
  descendre sous 11 000, sinon la page passe sous la fenêtre de connexion.
- **« reste »** interdit dans l'accueil (test `30. Ecran d'accueil`) ; ni « tap » ni « machine »
  nulle part dans la page (test unitaire).
- **Apostrophes** : les titres des rubriques contiennent `’` (U+2019), pas `'`. Copier depuis la
  fiche, ne pas retaper.
- **Emplacements entre crochets** : ne pas les remplacer par une valeur trouvée ailleurs (git config,
  e-mail de commit, CLAUDE.md) ; c'est le choix de Stéphane.
- **CNIL** : autorité de contrôle du responsable (en France). Ce n'est pas un « territoire en dur »
  au sens de CLAUDE.md : la page dit qui est responsable, pas où l'app fonctionne.
- **Fins de ligne CRLF** dans tous les fichiers touchés : pour les blocs de plusieurs lignes
  (vue de l'étape 3), passer par un petit script Node dans le scratchpad (voir README).

## Terminé quand
- [ ] Contrôles passés (dont ceux du lot 2), tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : oui, écran `compte` (`node tests/tools/capture-iphone.mjs PRIV-04-avant-compte compte`,
      puis `PRIV-04-apres-compte compte`)
- [ ] Story cochée dans BACKLOG.md, PR ouverte **en brouillon** (non fusionnée), emplacements à
      remplir listés dans la PR

## Modèle de PR
**Titre** : `feat(confidentialite): page Confidentialité et phrase d'accueil exacte`

**Corps** : constat corrigé (aucune information sur les données, promesse inexacte à l'accueil),
ce qui change (page Confidentialité par-dessus tout, quatre liens, phrase d'accueil variante A et
la variante B proposée), **le texte complet de la page recopié dans la PR** pour que Stéphane le
lise, la liste des emplacements à remplir (`[NOM DU RESPONSABLE]`, `[ADRESSE DE CONTACT]` ×3,
`[DATE DE MISE À JOUR]`), tests ajoutés, sorties des commandes de vérification, chemins des
captures, éléments non faits.
