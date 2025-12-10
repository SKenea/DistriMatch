// ==========================================
// SNACKMATCH V3.0 - EVENT MANAGER
// ==========================================

const EventManager = {
    handlers: {},

    /**
     * Initialize global event delegation
     */
    init() {
        // Delegate all clicks
        document.body.addEventListener('click', this.handleClick.bind(this));

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboard.bind(this));
    },

    /**
     * Handle all click events via delegation
     * @param {Event} e - Click event
     */
    handleClick(e) {
        const target = e.target;

        // Close buttons
        if (target.closest('.close-modal')) {
            const modal = target.closest('.modal-clean');
            if (modal) {
                ModalManager.close(modal.id);
            }
            return;
        }

        // Nav items
        const navItem = target.closest('.nav-item');
        if (navItem) {
            const view = navItem.dataset.view;
            if (view && typeof switchView === 'function') {
                switchView(view);
            }
            return;
        }

        // Favorite buttons
        if (target.closest('.favorite-btn')) {
            const btn = target.closest('.favorite-btn');
            const distributorId = parseInt(btn.dataset.distributorId);
            if (distributorId && typeof handleFavoriteClick === 'function') {
                handleFavoriteClick(distributorId, btn);
            }
            e.stopPropagation();
            return;
        }

        // Report buttons
        if (target.closest('.report-btn')) {
            const btn = target.closest('.report-btn');
            const distributorId = parseInt(btn.dataset.distributorId);
            if (distributorId && typeof openReportModal === 'function') {
                const distributor = mockDistributors.find(d => d.id === distributorId);
                if (distributor) openReportModal(distributor);
            }
            e.stopPropagation();
            return;
        }

        // Directions buttons
        if (target.closest('.directions-btn')) {
            const btn = target.closest('.directions-btn');
            const lat = parseFloat(btn.dataset.lat);
            const lng = parseFloat(btn.dataset.lng);
            if (lat && lng) {
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
            }
            e.stopPropagation();
            return;
        }

        // Report type buttons
        if (target.closest('.report-type-btn')) {
            const btn = target.closest('.report-type-btn');
            const reportType = btn.dataset.type;
            if (reportType) {
                document.querySelectorAll('.report-type-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                if (typeof selectedReportType !== 'undefined') {
                    selectedReportType = reportType;
                }
                // Enable submit button
                const submitBtn = document.getElementById('submit-report');
                if (submitBtn) submitBtn.disabled = false;

                // Show/hide conditional inputs
                const productSelect = document.getElementById('report-product-select');
                const priceInput = document.getElementById('report-price-input');

                if (productSelect) {
                    productSelect.style.display = ['out_of_stock', 'price_change', 'new_product'].includes(reportType) ? 'block' : 'none';
                }
                if (priceInput) {
                    priceInput.style.display = reportType === 'price_change' ? 'block' : 'none';
                }

                if (reportType === 'out_of_stock' && typeof populateProductSelect === 'function') {
                    populateProductSelect();
                }
            }
            return;
        }
    },

    /**
     * Handle keyboard events
     * @param {Event} e - Keyboard event
     */
    handleKeyboard(e) {
        // ESC key - close modals
        if (e.key === 'Escape') {
            ModalManager.closeAll();
            return;
        }

        // Arrow keys for swipe (if in swipe view)
        if (typeof currentView !== 'undefined' && currentView === 'swipe') {
            if (e.key === 'ArrowLeft' && typeof handleSwipe === 'function') {
                handleSwipe('left');
            } else if (e.key === 'ArrowRight' && typeof handleSwipe === 'function') {
                handleSwipe('right');
            }
        }
    },

    /**
     * Register a custom event handler
     * @param {string} name - Handler name
     * @param {Function} handler - Handler function
     */
    register(name, handler) {
        this.handlers[name] = handler;
    },

    /**
     * Trigger a custom event handler
     * @param {string} name - Handler name
     * @param {*} data - Data to pass to handler
     */
    trigger(name, data) {
        if (this.handlers[name]) {
            this.handlers[name](data);
        }
    }
};
