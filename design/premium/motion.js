// <tg-kf frames="0{opacity:0;transform:scale(.9)} .2{opacity:1;transform:none;easing:cubic-bezier(.2,.9,.3,1)} 1{opacity:1}" dur="6000">
// CSS-like keyframes on the shared global clock (startTime 0), so every loop on the page stays in sync with <tg-motion>.
(function () {
  if (customElements.get('tg-kf')) return;
  const camel = s => s.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  function parse(src) {
    const out = [], re = /(-?[\d.]+)\s*\{([^}]*)\}/g; let m;
    while ((m = re.exec(src))) {
      const f = { offset: Math.max(0, Math.min(1, parseFloat(m[1]))) };
      m[2].split(';').forEach(d => { const i = d.indexOf(':'); if (i < 0) return; const k = camel(d.slice(0, i)), v = d.slice(i + 1).trim(); if (k) f[k === 'clipPath' ? 'clipPath' : k] = v; });
      out.push(f);
    }
    return out;
  }
  class TgKf extends HTMLElement {
    connectedCallback() { if (!this.style.display) this.style.display = this.hasAttribute('inline') ? 'inline-block' : 'block'; requestAnimationFrame(() => this.start()); }
    disconnectedCallback() { this.a && this.a.cancel(); }
    static get observedAttributes() { return ['frames', 'dur']; }
    attributeChangedCallback() { if (this.isConnected) this.start(); }
    start() {
      this.a && this.a.cancel();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const fr = parse(this.getAttribute('frames') || ''); if (fr.length < 2) return;
      try {
        this.a = this.animate(fr, { duration: +(this.getAttribute('dur') || 6000), iterations: Infinity, easing: 'linear', fill: 'both' });
        this.a.startTime = +(this.getAttribute('offset') || 0);
      } catch (e) { console.warn('tg-kf', e); }
    }
  }
  customElements.define('tg-kf', TgKf);
})();
