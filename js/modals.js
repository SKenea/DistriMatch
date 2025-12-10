// ==========================================
// SNACKMATCH V3.0 - MODAL MANAGER
// ==========================================

const ModalManager = {
    current: null,

    /**
     * Open a modal by ID
     * @param {string} modalId - The modal element ID
     * @param {Object} options - Optional configuration
     */
    open(modalId, options = {}) {
        // Close any currently open modal first
        this.closeAll();

        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`Modal not found: ${modalId}`);
            return;
        }

        // Handle different modal types
        if (modalId === 'favorites-page') {
            modal.style.display = 'block';
        } else {
            modal.classList.add('active');
        }

        this.current = modalId;

        // Execute onOpen callback if provided
        if (options.onOpen) options.onOpen();
    },

    /**
     * Close a specific modal
     * @param {string} modalId - The modal element ID
     */
    close(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        // Handle different modal types
        if (modalId === 'favorites-page') {
            modal.style.display = 'none';
        } else {
            modal.classList.remove('active');
        }

        if (this.current === modalId) {
            this.current = null;
        }
    },

    /**
     * Close all open modals
     */
    closeAll() {
        // Close all class-based modals
        document.querySelectorAll('.modal-clean.active').forEach(modal => {
            modal.classList.remove('active');
        });

        // Close special modals
        document.querySelectorAll('.notif-panel.active, .search-overlay.active').forEach(el => {
            el.classList.remove('active');
        });

        // Close favorites page
        const favoritesPage = document.getElementById('favorites-page');
        if (favoritesPage && favoritesPage.style.display === 'block') {
            favoritesPage.style.display = 'none';
        }

        this.current = null;
    },

    /**
     * Check if a modal is currently open
     * @param {string} modalId - The modal element ID
     * @returns {boolean}
     */
    isOpen(modalId) {
        return this.current === modalId;
    },

    /**
     * Get the currently open modal ID
     * @returns {string|null}
     */
    getCurrent() {
        return this.current;
    }
};
