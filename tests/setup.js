/**
 * Setup minimal pour tester les modules ES dans Node.js
 * Mock du DOM, localStorage, navigator, Leaflet
 */

// Mock localStorage
const store = {};
globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
};

// Mock DOM minimal
class MockElement {
    constructor(tag) {
        this.tagName = tag;
        this.className = '';
        this.textContent = '';
        this.innerHTML = '';
        this.style = {};
        this.children = [];
        this.classList = {
            _classes: new Set(),
            add: (c) => this.classList._classes.add(c),
            remove: (c) => this.classList._classes.delete(c),
            toggle: (c, force) => {
                if (force === undefined) {
                    this.classList._classes.has(c) ? this.classList._classes.delete(c) : this.classList._classes.add(c);
                } else if (force) {
                    this.classList._classes.add(c);
                } else {
                    this.classList._classes.delete(c);
                }
            },
            contains: (c) => this.classList._classes.has(c),
            toString: () => Array.from(this.classList._classes).join(' ')
        };
        this.dataset = {};
        this._listeners = {};
    }
    addEventListener(event, fn) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
    }
    removeEventListener(event, fn) {
        if (this._listeners[event]) {
            this._listeners[event] = this._listeners[event].filter(f => f !== fn);
        }
    }
    click() {
        (this._listeners['click'] || []).forEach(fn => fn({ stopPropagation: () => {} }));
    }
    appendChild(child) { this.children.push(child); return child; }
    remove() {}
    querySelector() { return null; }
    querySelectorAll() { return []; }
    getAttribute(name) { return this.dataset[name] || null; }
    setAttribute(name, value) { this.dataset[name] = value; }
    getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100 }; }
    scrollIntoView() {}
}

const elements = {};

globalThis.document = {
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => elements[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    _registerElement: (id, el) => { elements[id] = el; },
    _clearElements: () => { Object.keys(elements).forEach(k => delete elements[k]); }
};

globalThis.window = globalThis;
Object.defineProperty(globalThis, 'navigator', { value: { geolocation: null }, writable: true, configurable: true });

// Mock Leaflet
globalThis.L = {
    map: () => ({
        setView: () => ({}),
        addTo: () => ({}),
        invalidateSize: () => {},
        removeLayer: () => {},
        fitBounds: () => {}
    }),
    tileLayer: () => ({ addTo: () => {} }),
    marker: () => ({ addTo: () => ({}), bindPopup: () => ({}), on: () => ({}) }),
    divIcon: () => ({}),
    featureGroup: () => ({ getBounds: () => ({ pad: () => ({}) }) }),
    control: { zoom: () => ({ addTo: () => {} }) }
};

// Mock supabase
globalThis.supabase = undefined;
