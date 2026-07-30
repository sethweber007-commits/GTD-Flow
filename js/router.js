// A tiny hash router. Routes are registered with route(pattern, handler);
// patterns may include ':name' segments, passed to the handler as a single
// params object (e.g. '/projects/:id' → handler({ id })). notFound(handler)
// covers an empty or unmatched hash. startRouter() wires hashchange and does
// the first dispatch; navigate(path) changes the hash (and re-dispatches
// immediately if the hash wouldn't otherwise change, e.g. re-navigating to
// the page you're already on after an action).

const routes = [];
let notFoundHandler = null;

function compile(pattern) {
  const paramNames = [];
  const regexStr = pattern.replace(/:[^/]+/g, (m) => {
    paramNames.push(m.slice(1));
    return '([^/]+)';
  });
  return { regex: new RegExp('^' + regexStr + '$'), paramNames };
}

function currentPath() {
  return location.hash.replace(/^#/, '') || '/';
}

function updateActiveNav(path) {
  document.querySelectorAll('.nav-link').forEach((a) => {
    const linkPath = (a.getAttribute('href') || '').replace(/^#/, '');
    a.classList.toggle('active', !!linkPath && (linkPath === path || path.startsWith(linkPath + '/')));
  });
}

function dispatch() {
  const path = currentPath();
  for (const r of routes) {
    const match = path.match(r.regex);
    if (!match) continue;
    const params = {};
    r.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1])));
    r.handler(params);
    updateActiveNav(path);
    window.scrollTo(0, 0);
    return;
  }
  if (notFoundHandler) {
    notFoundHandler({});
    updateActiveNav(path);
    window.scrollTo(0, 0);
  }
}

export function route(pattern, handler) {
  routes.push({ ...compile(pattern), handler });
}

export function notFound(handler) {
  notFoundHandler = handler;
}

export function navigate(path) {
  const hash = '#' + path;
  if (location.hash === hash) dispatch();
  else location.hash = hash;
}

export function startRouter() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}
