// ==========================================
// SNACKMATCH V3.0 - MAP MANAGER
// ==========================================

const MapManager = {
    instances: {},
    markers: {},
    configs: {
        mini: {
            zoom: 14,
            zoomControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false
        },
        full: {
            zoom: 13,
            zoomControl: true,
            dragging: true,
            scrollWheelZoom: true
        },
        hybrid: {
            zoom: 13,
            zoomControl: true,
            dragging: true,
            scrollWheelZoom: true
        }
    },

    /**
     * Create or retrieve a map instance
     * @param {string} type - Map type: 'mini', 'full', or 'hybrid'
     * @param {string} containerId - Container element ID
     * @param {Object} customOptions - Optional custom options
     * @returns {Object} Leaflet map instance
     */
    create(type, containerId, customOptions = {}) {
        if (this.instances[type]) {
            this.instances[type].invalidateSize();
            return this.instances[type];
        }

        const config = { ...this.configs[type], ...customOptions };
        const map = L.map(containerId, config);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        this.instances[type] = map;
        this.markers[type] = {};

        return map;
    },

    /**
     * Add a marker to a map
     * @param {string} mapType - The map type
     * @param {string} markerId - Unique marker ID
     * @param {Object} options - Marker options (lat, lng, icon, popup)
     * @returns {Object} Leaflet marker instance
     */
    addMarker(mapType, markerId, options) {
        const map = this.instances[mapType];
        if (!map) {
            console.error(`Map not found: ${mapType}`);
            return null;
        }

        const marker = L.marker([options.lat, options.lng], {
            icon: options.icon
        }).addTo(map);

        if (options.popup) {
            marker.bindPopup(options.popup);
        }

        if (options.onClick) {
            marker.on('click', options.onClick);
        }

        this.markers[mapType][markerId] = marker;
        return marker;
    },

    /**
     * Remove a marker from a map
     * @param {string} mapType - The map type
     * @param {string} markerId - Unique marker ID
     */
    removeMarker(mapType, markerId) {
        const marker = this.markers[mapType]?.[markerId];
        if (marker) {
            this.instances[mapType].removeLayer(marker);
            delete this.markers[mapType][markerId];
        }
    },

    /**
     * Clear all markers from a map
     * @param {string} mapType - The map type
     */
    clearMarkers(mapType) {
        if (!this.markers[mapType]) return;

        Object.keys(this.markers[mapType]).forEach(markerId => {
            this.removeMarker(mapType, markerId);
        });
    },

    /**
     * Set map view
     * @param {string} mapType - The map type
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} zoom - Zoom level
     * @param {Object} options - Pan options
     */
    setView(mapType, lat, lng, zoom, options = {}) {
        const map = this.instances[mapType];
        if (map) {
            map.setView([lat, lng], zoom, options);
        }
    },

    /**
     * Get a map instance
     * @param {string} mapType - The map type
     * @returns {Object|null} Leaflet map instance
     */
    get(mapType) {
        return this.instances[mapType] || null;
    },

    /**
     * Get all markers for a map
     * @param {string} mapType - The map type
     * @returns {Object} Markers object
     */
    getMarkers(mapType) {
        return this.markers[mapType] || {};
    }
};
