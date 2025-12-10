// ==========================================
// SNACKMATCH V3.0 - CARD UTILITIES
// ==========================================

const CardUtils = {
    /**
     * Get distributor type from products
     * @param {Object} distributor - Distributor object
     * @returns {string} Distributor type
     */
    getDistributorType(distributor) {
        // DEPRECATED: Use getDominantCategory() instead
        return this.getDominantCategory(distributor);
    },

    /**
     * Get dominant category from distributor products
     * @param {Object} distributor - Distributor object
     * @returns {string} Dominant category name
     */
    getDominantCategory(distributor) {
        if (!distributor.products || distributor.products.length === 0) return 'default';
        const categories = [...new Set(distributor.products.map(p => p.category))];
        return categories[0] || 'default';
    },

    /**
     * Get distributor status info
     * @param {Object} distributor - Distributor object
     * @returns {Object} Status object with label, emoji, color
     */
    getStatus(distributor) {
        const now = Date.now();
        const lastVerified = distributor.lastVerified || 0;
        const timeSinceVerification = now - lastVerified;
        const oneHour = 1000 * 60 * 60;

        if (distributor.status === 'verified' && timeSinceVerification < oneHour) {
            return { label: 'Vérifié récemment', emoji: '✅', color: 'green' };
        }

        const recentReports = distributor.reports?.filter(r => now - r.timestamp < oneHour * 24) || [];

        if (recentReports.some(r => r.type === 'closed')) {
            return { label: 'Fermé', emoji: '🔒', color: 'red' };
        }

        if (recentReports.some(r => r.type === 'machine_down')) {
            return { label: 'En panne', emoji: '⚠️', color: 'orange' };
        }

        if (recentReports.some(r => r.type === 'out_of_stock')) {
            return { label: 'Rupture', emoji: '❌', color: 'orange' };
        }

        if (timeSinceVerification < oneHour * 24) {
            return { label: 'Vérifié', emoji: '✓', color: 'green' };
        }

        if (timeSinceVerification < oneHour * 24 * 7) {
            return { label: 'Non vérifié', emoji: '❓', color: 'gray' };
        }

        return { label: 'Ancien', emoji: '⏱️', color: 'gray' };
    },

    /**
     * Format distance with appropriate unit
     * @param {number} distance - Distance in km
     * @returns {string} Formatted distance
     */
    formatDistance(distance) {
        if (distance < 1) {
            return `${Math.round(distance * 1000)} m`;
        }
        return `${distance.toFixed(1)} km`;
    },

    /**
     * Generate star rating HTML
     * @param {number} rating - Rating value (0-5)
     * @returns {string} HTML string with stars
     */
    getStars(rating) {
        const full = Math.floor(rating);
        const half = rating % 1 >= 0.5 ? 1 : 0;
        const empty = 5 - full - half;

        return '⭐'.repeat(full) + (half ? '⭐' : '') + '☆'.repeat(empty);
    },

    /**
     * Get status color for CSS
     * @param {string} color - Color name
     * @returns {string} CSS color value
     */
    getStatusColor(color) {
        const colors = {
            green: '#10b981',
            orange: '#f59e0b',
            red: '#ef4444',
            gray: '#6b7280'
        };
        return colors[color] || colors.gray;
    },

    /**
     * Get favorite heart icon
     * @param {number} distributorId - Distributor ID
     * @returns {string} Heart icon (filled or empty)
     */
    getFavoriteIcon(distributorId) {
        // This will be defined in favorites.js
        if (typeof isFavorite === 'function' && isFavorite(distributorId)) {
            return '❤️';
        }
        return '🤍';
    }
};
