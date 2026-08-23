// Minimal hash router.
const routes = [];
let notFoundHandler = () => {};

export function route(pattern, handler) {
  const paramNames = [];
  const regex = new RegExp(
    '^' +
      pattern.replace(/:[a-zA-Z]+/g, (m) => {
        paramNames.push(m.slice(1));
        return '([^/]+)';
      }) +
      '$'
  );
  routes.push({ regex, paramNames, handler });
}

export function notFound(handler) {
  notFoundHandler = handler;
}

export function navigate(path) {
  if (location.hash.slice(1) === path) {
    render();
  } else {
    location.hash = path;
  }
}

async function render() {
  const path = location.hash.slice(1) || '/inbox';
  // Some views (e.g. Calendar) add a class to #view-root for layout needs
  // specific to that page — reset it on every navigation so it doesn't leak
  // into whatever view is rendered next.
  const viewRoot = document.getElementById('view-root');
  if (viewRoot) viewRoot.className = '';
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
      await r.handler(params);
      highlightNav(path);
      return;
    }
  }
  await notFoundHandler();
  highlightNav(path);
}

function highlightNav(path) {
  document.querySelectorAll('.nav-link').forEach((a) => {
    const href = a.getAttribute('href').slice(1);
    a.classList.toggle('active', path === href || (href !== '/' && path.startsWith(href)));
  });
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}
