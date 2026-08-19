/* ===== Sidebar Resize & Collapse ===== */
(function () {
  var sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  var app = sidebar.parentElement;

  /* --- Inject toggle button (sibling of sidebar, not child) --- */
  var toggle = document.createElement('button');
  toggle.className = 'sidebar-toggle';
  toggle.innerHTML = '&#9664;'; /* left-pointing triangle */
  toggle.title = 'Collapse sidebar';
  app.insertBefore(toggle, sidebar.nextSibling);

  /* --- Inject resizer (child of sidebar) --- */
  var resizer = document.createElement('div');
  resizer.className = 'sidebar-resizer';
  sidebar.appendChild(resizer);

  /* --- Restore saved width --- */
  var saved = localStorage.getItem('sidebar-width');
  if (saved) {
    sidebar.style.width = saved + 'px';
    toggle.style.left = saved + 'px';
  }

  /* --- Collapse / expand --- */
  var collapsed = localStorage.getItem('sidebar-collapsed') === '1';
  /* Auto-collapse on small screens */
  if (window.innerWidth <= 768) collapsed = true;
  if (collapsed) {
    sidebar.classList.add('collapsed');
    toggle.classList.add('collapsed');
    toggle.innerHTML = '&#9654;'; /* right-pointing triangle */
    toggle.title = 'Expand sidebar';
  }

  toggle.addEventListener('click', function () {
    sidebar.classList.toggle('collapsed');
    var isCollapsed = sidebar.classList.contains('collapsed');
    toggle.classList.toggle('collapsed', isCollapsed);
    toggle.innerHTML = isCollapsed ? '&#9654;' : '&#9664;';
    toggle.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
    localStorage.setItem('sidebar-collapsed', isCollapsed ? '1' : '0');
  });

  /* --- Drag to resize --- */
  var dragging = false;
  var startX = 0;
  var startW = 0;

  resizer.addEventListener('mousedown', function (e) {
    if (sidebar.classList.contains('collapsed')) return;
    dragging = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var newW = startW + (e.clientX - startX);
    var min = 200;
    var max = 500;
    if (newW < min) newW = min;
    if (newW > max) newW = max;
    sidebar.style.width = newW + 'px';
    toggle.style.left = newW + 'px';
  });

  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('sidebar-width', sidebar.offsetWidth);
  });
})();
