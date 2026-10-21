// Decorative, feature-related animated scenes for the page background.
// Trusted constant markup only (no user input). All motion is CSS and respects reduced motion.

const blobs = (a, b) => `
  <span class="scene-blob" style="--x:-8%;--y:-10%;--s:46vmax;--c:rgb(${a} / .38);--d:22s"></span>
  <span class="scene-blob" style="--x:62%;--y:48%;--s:52vmax;--c:rgb(${b} / .34);--d:28s;animation-delay:-9s"></span>`;

const SCENES = {
  dots: (a, b) => `${blobs(a, b)}
    ${Array.from({ length: 14 }, (_, i) => `<span class="scene-dot" style="--l:${(i * 7 + 5) % 96}%;--dl:${-i * 1.7}s;--du:${9 + (i % 5) * 2}s;--sz:${6 + (i % 4) * 4}px"></span>`).join("")}`,

  waves: (a, b) => `${blobs(a, b)}
    <svg class="scene-wave w1" viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M0 60 C150 120 350 0 600 60 C850 120 1050 0 1200 60 L1200 120 L0 120Z" fill="rgb(${a} / .22)"/></svg>
    <svg class="scene-wave w2" viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M0 70 C200 10 400 120 600 70 C800 20 1000 120 1200 70 L1200 120 L0 120Z" fill="rgb(${b} / .20)"/></svg>
    ${Array.from({ length: 8 }, (_, i) => `<span class="scene-drop" style="--l:${(i * 13 + 6) % 94}%;--dl:${-i * 1.3}s;--du:${2.6 + (i % 3) * 0.7}s"></span>`).join("")}`,

  sun: (a, b) => `${blobs(a, b)}
    <span class="scene-sun"></span><span class="scene-rays"></span>`,

  pulse: (a, b) => `${blobs(a, b)}
    <span class="scene-ring" style="--dl:0s"></span><span class="scene-ring" style="--dl:-1.4s"></span><span class="scene-ring" style="--dl:-2.8s"></span>`,

  radar: (a, b) => `${blobs(a, b)}
    <span class="scene-radar"><span class="scene-sweep"></span></span>`,

  grid: (a, b) => `${blobs(a, b)}
    <span class="scene-grid"></span>`,

  route: (a, b) => `${blobs(a, b)}
    <span class="scene-route r1"></span><span class="scene-route r2"></span>`,
};

export function sceneMarkup(kind, accent, accent2) {
  return (SCENES[kind] || SCENES.dots)(accent, accent2);
}