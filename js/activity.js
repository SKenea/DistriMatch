/**
 * DistriMatch - Feed d'activite, signalements, votes
 */

import {
    AppState, ActivityFeed, supabaseClient,
    selectedReportType, setSelectedReportType
} from './state.js';
import { escapeHTML, formatTime, showToast, saveToLocalStorage } from './utils.js';
import { updateProfileStats } from './navigation.js';

// ============================================
// PERSISTANCE ACTIVITE
// ============================================

const ACTIVITY_KEY = 'snackmatch_activity';

export function saveActivityFeed() {
    try {
        localStorage.setItem(ACTIVITY_KEY, JSON.stringify(ActivityFeed.items));
    } catch (e) {
        console.error('Erreur sauvegarde activite:', e);
    }
}

export function loadActivityFeed() {
    try {
        const data = localStorage.getItem(ACTIVITY_KEY);
        if (data) {
            ActivityFeed.items = JSON.parse(data) || [];
        }
    } catch (e) {
        console.error('Erreur chargement activite:', e);
        ActivityFeed.items = [];
    }
}

// ============================================
// ITEMS ACTIVITE
// ============================================

export function addActivityItem(type, distributorId, details = {}) {
    const d = AppState.distributors.find(dist => dist.id === distributorId);
    if (!d) return;

    const item = {
        id: Date.now(),
        type: type,
        distributorId: distributorId,
        distributorName: d.name,
        distributorEmoji: d.emoji,
        details: details,
        timestamp: Date.now(),
        confirmations: 0,
        denials: 0,
        userVote: null,
        resolved: false
    };

    ActivityFeed.items.unshift(item);

    if (ActivityFeed.items.length > 50) {
        ActivityFeed.items = ActivityFeed.items.slice(0, 50);
    }

    saveActivityFeed();
}

// ============================================
// AFFICHAGE FEED
// ============================================

function getReportLabel(type) {
    const labels = {
        'out_of_stock': 'Rupture de stock',
        'machine_down': 'Machine en panne',
        'price_change': 'Prix modifie',
        'new_product': 'Nouveau produit',
        'closed': 'Ferme',
        'verified': 'Tout est OK'
    };
    return labels[type] || type;
}

export function displayActivityFeed() {
    const list = document.getElementById('activity-list');
    const empty = document.getElementById('activity-empty');
    const count = document.getElementById('activity-count');

    let filtered = ActivityFeed.items;
    if (ActivityFeed.filter === 'reports') {
        filtered = ActivityFeed.items.filter(i => i.type === 'report');
    } else if (ActivityFeed.filter === 'subscriptions') {
        filtered = ActivityFeed.items.filter(i => i.type === 'subscription' || i.type === 'unsubscription' || i.type === 'favorite' || i.type === 'unfavorite');
    }

    count.textContent = `${filtered.length} action(s)`;

    if (filtered.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }

    empty.style.display = 'none';

    list.innerHTML = filtered.map(item => {
        let icon = '';
        let iconClass = '';
        let text = '';

        if (item.type === 'report') {
            icon = '⚠️';
            iconClass = item.details.type === 'verified' ? 'verified' : 'report';
            text = `Signalement <strong>${getReportLabel(item.details.type)}</strong> sur ${escapeHTML(item.distributorName)}`;
        } else if (item.type === 'subscription' || item.type === 'favorite') {
            icon = '🔔';
            iconClass = 'subscription';
            text = `Abonne a <strong>${escapeHTML(item.distributorName)}</strong>`;
        } else if (item.type === 'unsubscription' || item.type === 'unfavorite') {
            icon = '🔕';
            iconClass = 'subscription';
            text = `Desabonne de <strong>${escapeHTML(item.distributorName)}</strong>`;
        } else if (item.type === 'new_distributor') {
            icon = '📍';
            iconClass = 'verified';
            text = `Nouveau distributeur <strong>${escapeHTML(item.details.name || item.distributorName)}</strong> ajoute`;
        }

        const pointsHtml = item.details.points ? `<span class="activity-points">+${item.details.points} pts</span>` : '';

        let votesHtml = '';
        if (item.type === 'report' && !item.resolved) {
            const confirmClass = item.userVote === 'confirm' ? 'voted' : '';
            const denyClass = item.userVote === 'deny' ? 'voted' : '';
            votesHtml = `
                <div class="activity-votes">
                    <button class="vote-btn confirm ${confirmClass}" onclick="voteOnReport(${item.id}, 'confirm')" ${item.userVote ? 'disabled' : ''}>
                        Confirmer <span>${item.confirmations || 0}</span>
                    </button>
                    <button class="vote-btn deny ${denyClass}" onclick="voteOnReport(${item.id}, 'deny')" ${item.userVote ? 'disabled' : ''}>
                        Infirmer <span>${item.denials || 0}</span>
                    </button>
                </div>
            `;
        } else if (item.type === 'report' && item.resolved) {
            const result = item.confirmations >= item.denials ? 'Confirme' : 'Infirme';
            const resultClass = item.confirmations >= item.denials ? 'confirmed' : 'denied';
            votesHtml = `<div class="activity-resolved ${resultClass}">${result} par la communaute</div>`;
        }

        return `
            <div class="activity-item" data-id="${item.id}">
                <div class="activity-icon ${iconClass}">${icon}</div>
                <div class="activity-content">
                    <div class="activity-text">${text}</div>
                    <div class="activity-meta">
                        <span class="activity-time">${formatTime(item.timestamp)}</span>
                        ${pointsHtml}
                    </div>
                    ${votesHtml}
                </div>
            </div>
        `;
    }).join('');
}

export function updateActivityBadge() {
    const badge = document.getElementById('activity-badge');
    const recentCount = ActivityFeed.items.filter(i =>
        Date.now() - i.timestamp < 24 * 60 * 60 * 1000
    ).length;

    if (recentCount > 0) {
        badge.textContent = recentCount > 9 ? '9+' : recentCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

export function setActivityFilter(filter) {
    ActivityFeed.filter = filter;

    document.querySelectorAll('.activity-filter').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    displayActivityFeed();
}

// ============================================
// VOTES
// ============================================

export async function voteOnReport(activityId, voteType) {
    const item = ActivityFeed.items.find(i => i.id === activityId);
    if (!item || item.userVote || item.resolved) return;

    if (supabaseClient && item.details?.supabaseId) {
        try {
            const { error } = await supabaseClient.rpc('cast_vote', {
                p_report_id: item.details.supabaseId,
                p_vote_type: voteType
            });
            if (error) throw error;
            console.log('[DistriMatch] Vote envoye sur Supabase');
        } catch (e) {
            console.warn('[DistriMatch] Erreur vote Supabase:', e.message);
        }
    }

    item.userVote = voteType;
    if (voteType === 'confirm') {
        item.confirmations = (item.confirmations || 0) + 1;
    } else {
        item.denials = (item.denials || 0) + 1;
    }

    checkReportResolution(item);

    AppState.points += 2;
    saveToLocalStorage();

    saveActivityFeed();
    displayActivityFeed();
    showToast(`Vote enregistre ! +2 points`, 'success');
}

function checkReportResolution(item) {
    const THRESHOLD = 3;

    if (item.confirmations >= THRESHOLD) {
        item.resolved = true;
        showToast(`Signalement confirme par la communaute !`, 'success');
    } else if (item.denials >= THRESHOLD) {
        item.resolved = true;
        showToast(`Signalement infirme par la communaute`, 'warning');
    }
}

export function getUnverifiedReportsForDistributor(distributorId) {
    return ActivityFeed.items.filter(item =>
        item.type === 'report' &&
        item.distributorId === distributorId &&
        !item.resolved
    ).length;
}

// ============================================
// SIGNALEMENTS
// ============================================

export function openReportModal() {
    if (!AppState.currentDistributor) return;

    const distributor = AppState.currentDistributor;

    document.getElementById('report-name').textContent = distributor.name;
    document.getElementById('report-address').textContent = distributor.address;

    const select = document.getElementById('report-product');
    select.innerHTML = distributor.products.map(p =>
        `<option value="${escapeHTML(p.name)}">${escapeHTML(p.name)}</option>`
    ).join('');

    document.getElementById('report-modal').classList.add('active');
}

export function selectReportType(type) {
    setSelectedReportType(type);

    document.querySelectorAll('.report-type-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.type === type);
    });

    const productSelect = document.getElementById('report-product-select');
    productSelect.style.display = ['out_of_stock', 'price_change'].includes(type) ? 'block' : 'none';

    document.getElementById('submit-report').disabled = false;
}

export async function submitReport() {
    if (!selectedReportType || !AppState.currentDistributor) return;

    const selectedBtn = document.querySelector(`.report-type-btn[data-type="${selectedReportType}"]`);
    const points = parseInt(selectedBtn?.dataset.points || '10');

    let supabaseReportId = null;
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.rpc('submit_report', {
                p_distributor_id: AppState.currentDistributor.id,
                p_report_type: selectedReportType,
                p_product_name: null,
                p_points: points
            });
            if (error) throw error;
            supabaseReportId = data;
            console.log('[DistriMatch] Signalement envoye sur Supabase, id:', supabaseReportId);
        } catch (e) {
            console.warn('[DistriMatch] Erreur signalement Supabase:', e.message);
        }
    }

    AppState.reports++;
    AppState.points += points;
    saveToLocalStorage();
    updateProfileStats();

    addActivityItem('report', AppState.currentDistributor.id, {
        type: selectedReportType,
        points: points,
        supabaseId: supabaseReportId
    });

    showToast(`Merci pour ton signalement ! +${points} points`, 'success');

    document.getElementById('report-modal').classList.remove('active');
    setSelectedReportType(null);
    updateActivityBadge();
}

// ============================================
// CHARGEMENT SUPABASE
// ============================================

export async function loadReportsFromSupabase() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('reports')
            .select('id, distributor_id, report_type, product_name, points, confirmations, denials, resolved, created_at')
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        if (!data || data.length === 0) return;

        const { data: { session } } = await supabaseClient.auth.getSession();
        let userVotes = {};
        if (session) {
            const { data: votes } = await supabaseClient
                .from('votes')
                .select('report_id, vote_type')
                .eq('user_id', session.user.id);
            if (votes) {
                votes.forEach(v => { userVotes[v.report_id] = v.vote_type; });
            }
        }

        const existingSupabaseIds = new Set(
            ActivityFeed.items
                .filter(i => i.details?.supabaseId)
                .map(i => i.details.supabaseId)
        );

        data.forEach(report => {
            if (existingSupabaseIds.has(report.id)) {
                const existing = ActivityFeed.items.find(i => i.details?.supabaseId === report.id);
                if (existing) {
                    existing.confirmations = report.confirmations || 0;
                    existing.denials = report.denials || 0;
                    existing.resolved = report.resolved || false;
                    if (userVotes[report.id]) {
                        existing.userVote = userVotes[report.id];
                    }
                }
                return;
            }

            const d = AppState.distributors.find(dist => dist.id === report.distributor_id);
            if (!d) return;

            ActivityFeed.items.push({
                id: report.id,
                type: 'report',
                distributorId: report.distributor_id,
                distributorName: d.name,
                distributorEmoji: d.emoji,
                details: {
                    type: report.report_type,
                    points: report.points || 10,
                    supabaseId: report.id
                },
                timestamp: new Date(report.created_at).getTime(),
                confirmations: report.confirmations || 0,
                denials: report.denials || 0,
                userVote: userVotes[report.id] || null,
                resolved: report.resolved || false
            });
        });

        ActivityFeed.items.sort((a, b) => b.timestamp - a.timestamp);

        if (ActivityFeed.items.length > 50) {
            ActivityFeed.items = ActivityFeed.items.slice(0, 50);
        }

        saveActivityFeed();
        console.log('[DistriMatch] Signalements Supabase charges:', data.length);
    } catch (e) {
        console.warn('[DistriMatch] Erreur chargement signalements Supabase:', e.message);
    }
}
