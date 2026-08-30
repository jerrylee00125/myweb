(function () {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.documentElement.classList.remove("no-js");
  document.documentElement.classList.add("js");

  function initIntro() {
    const modal = document.querySelector("[data-intro-modal]");
    if (!modal) return;

    const startButton = modal.querySelector("[data-intro-start]");
    const storageKey = "jerry-portfolio-intro-seen";
    let lastFocused = null;

    function hasSeenIntro() {
      try {
        return window.sessionStorage.getItem(storageKey) === "1";
      } catch (_error) {
        return false;
      }
    }

    function rememberIntro() {
      try {
        window.sessionStorage.setItem(storageKey, "1");
      } catch (_error) {
        // The experience still works when browser storage is unavailable.
      }
    }

    function open() {
      lastFocused = document.activeElement;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      modal.removeAttribute("inert");
      window.setTimeout(() => startButton?.focus(), reduceMotion.matches ? 0 : 120);
    }

    function close() {
      rememberIntro();
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      modal.setAttribute("inert", "");
      if (lastFocused instanceof HTMLElement) lastFocused.focus();
    }

    startButton?.addEventListener("click", close);
    modal.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;

      const controls = [...modal.querySelectorAll("button:not([disabled]), a[href]")];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    if (!hasSeenIntro()) open();
  }

  function initDrawer() {
    const drawer = document.querySelector("[data-canvas-drawer]");
    const toggle = document.querySelector("[data-menu-toggle]");
    const closeButton = drawer?.querySelector("[data-drawer-close]");
    const backdrop = document.querySelector("[data-drawer-backdrop]");
    if (!drawer || !toggle || !backdrop) return null;

    let lastFocused = null;

    function open() {
      lastFocused = document.activeElement;
      drawer.classList.add("is-open");
      backdrop.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
      drawer.removeAttribute("inert");
      toggle.setAttribute("aria-expanded", "true");
      closeButton?.focus();
    }

    function close({ restoreFocus = true } = {}) {
      drawer.classList.remove("is-open");
      backdrop.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
      drawer.setAttribute("inert", "");
      toggle.setAttribute("aria-expanded", "false");
      if (restoreFocus && lastFocused instanceof HTMLElement) lastFocused.focus();
    }

    toggle.addEventListener("click", open);
    closeButton?.addEventListener("click", () => close());
    backdrop.addEventListener("click", () => close());
    drawer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...drawer.querySelectorAll("button:not([disabled]), a[href]")];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    return { open, close, drawer };
  }

  function initCanvas() {
    const viewport = document.querySelector("[data-canvas-viewport]");
    const world = document.querySelector("[data-canvas-world]");
    if (!viewport || !world) return;

    const drawerApi = initDrawer();
    const nodes = [...world.querySelectorAll("[data-canvas-node]")];
    const focusLinks = [...document.querySelectorAll("[data-focus-target]")];
    const zoomInButton = document.querySelector("[data-zoom-in]");
    const zoomOutButton = document.querySelector("[data-zoom-out]");
    const resetButton = document.querySelector("[data-reset-view]");
    const status = document.querySelector("[data-canvas-status]");
    const minimap = document.querySelector("[data-minimap-world]");
    const minimapViewport = document.querySelector("[data-minimap-viewport]");
    const pointers = new Map();
    let frame = 0;
    let transitionTimer = 0;
    let currentId = "home";
    let camera = { x: 0, y: 0, scale: 0.72 };

    function dimensions() {
      return {
        viewportWidth: viewport.clientWidth,
        viewportHeight: viewport.clientHeight,
        worldWidth: world.offsetWidth,
        worldHeight: world.offsetHeight,
      };
    }

    function scaleLimits() {
      return window.innerWidth <= 767
        ? { min: 0.24, max: 1.15 }
        : window.innerWidth <= 1100
          ? { min: 0.28, max: 1.25 }
          : { min: 0.35, max: 1.4 };
    }

    function clampCamera(next = camera) {
      const { viewportWidth, viewportHeight, worldWidth, worldHeight } = dimensions();
      const scaledWidth = worldWidth * next.scale;
      const scaledHeight = worldHeight * next.scale;
      const edgeAllowanceX = Math.max(80, viewportWidth / 2 - 80);
      const edgeAllowanceY = Math.max(80, viewportHeight / 2 - 80);

      if (scaledWidth <= viewportWidth) {
        next.x = (viewportWidth - scaledWidth) / 2;
      } else {
        next.x = clamp(next.x, viewportWidth - scaledWidth - edgeAllowanceX, edgeAllowanceX);
      }

      if (scaledHeight <= viewportHeight) {
        next.y = (viewportHeight - scaledHeight) / 2;
      } else {
        next.y = clamp(next.y, viewportHeight - scaledHeight - edgeAllowanceY, edgeAllowanceY);
      }

      return next;
    }

    function resetViewportScroll() {
      if (viewport.scrollLeft !== 0) viewport.scrollLeft = 0;
      if (viewport.scrollTop !== 0) viewport.scrollTop = 0;
    }

    function setTransition(enabled) {
      window.clearTimeout(transitionTimer);
      world.classList.toggle("is-animating", enabled && !reduceMotion.matches);
      if (enabled && !reduceMotion.matches) {
        transitionTimer = window.setTimeout(() => world.classList.remove("is-animating"), 900);
      }
    }

    function nearestNode() {
      const { viewportWidth, viewportHeight } = dimensions();
      const centerX = (viewportWidth / 2 - camera.x) / camera.scale;
      const centerY = (viewportHeight / 2 - camera.y) / camera.scale;
      let closest = nodes[0];
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const node of nodes) {
        const nodeX = node.offsetLeft + node.offsetWidth / 2;
        const nodeY = node.offsetTop + node.offsetHeight / 2;
        const distance = Math.hypot(nodeX - centerX, nodeY - centerY);
        if (distance < closestDistance) {
          closest = node;
          closestDistance = distance;
        }
      }
      return closest;
    }

    function updateActiveState() {
      const closest = nearestNode();
      if (!closest) return;
      currentId = closest.dataset.canvasNode || "home";
      const title = closest.dataset.nodeTitle || "首頁";
      focusLinks.forEach((link) => {
        if (link.dataset.focusTarget === currentId) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      });
      if (status) status.textContent = `目前位置：${title} · ${Math.round(camera.scale * 100)}%`;
    }

    function updateMinimap() {
      if (!minimap || !minimapViewport) return;
      const { viewportWidth, viewportHeight, worldWidth, worldHeight } = dimensions();
      const worldViewX = -camera.x / camera.scale;
      const worldViewY = -camera.y / camera.scale;
      const worldViewWidth = viewportWidth / camera.scale;
      const worldViewHeight = viewportHeight / camera.scale;

      minimapViewport.style.left = `${clamp((worldViewX / worldWidth) * 100, 0, 100)}%`;
      minimapViewport.style.top = `${clamp((worldViewY / worldHeight) * 100, 0, 100)}%`;
      minimapViewport.style.width = `${clamp((worldViewWidth / worldWidth) * 100, 2, 100)}%`;
      minimapViewport.style.height = `${clamp((worldViewHeight / worldHeight) * 100, 2, 100)}%`;
    }

    function render() {
      frame = 0;
      resetViewportScroll();
      clampCamera(camera);
      world.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;
      const limits = scaleLimits();
      if (zoomInButton) zoomInButton.disabled = camera.scale >= limits.max - 0.01;
      if (zoomOutButton) zoomOutButton.disabled = camera.scale <= limits.min + 0.01;
      updateMinimap();
      updateActiveState();
    }

    function scheduleRender() {
      if (!frame) frame = window.requestAnimationFrame(render);
    }

    function nodeById(id) {
      return nodes.find((node) => node.dataset.canvasNode === id);
    }

    function focusNode(id, { updateUrl = false, animate = true } = {}) {
      const node = nodeById(id);
      if (!node) return false;

      const { viewportWidth, viewportHeight } = dimensions();
      const limits = scaleLimits();
      const insetX = window.innerWidth <= 767 ? 48 : 220;
      const insetY = window.innerWidth <= 767 ? 130 : 180;
      const fitScale = Math.min(
        (viewportWidth - insetX) / Math.max(node.offsetWidth, 1),
        (viewportHeight - insetY) / Math.max(node.offsetHeight, 1),
        1.08,
      );
      const preferred = Number.parseFloat(node.dataset.focusScale || "");
      const focusOffsetX = Number.parseFloat(node.dataset.focusOffsetX || "0");
      const focusOffsetY = Number.parseFloat(node.dataset.focusOffsetY || "0");
      camera.scale = clamp(Number.isFinite(preferred) ? preferred : fitScale, limits.min, limits.max);
      camera.x = viewportWidth / 2 - (node.offsetLeft + node.offsetWidth / 2 + focusOffsetX) * camera.scale;
      camera.y = viewportHeight / 2 - (node.offsetTop + node.offsetHeight / 2 + focusOffsetY) * camera.scale;
      resetViewportScroll();
      setTransition(animate);
      scheduleRender();
      currentId = id;

      if (updateUrl) {
        const url = new URL(window.location.href);
        url.hash = id === "home" ? "" : id;
        window.history.pushState({ canvasNode: id }, "", `${url.pathname}${url.search}${url.hash}`);
      }
      return true;
    }

    function zoomAt(screenX, screenY, nextScale) {
      const limits = scaleLimits();
      const targetScale = clamp(nextScale, limits.min, limits.max);
      const worldX = (screenX - camera.x) / camera.scale;
      const worldY = (screenY - camera.y) / camera.scale;
      camera.x = screenX - worldX * targetScale;
      camera.y = screenY - worldY * targetScale;
      camera.scale = targetScale;
      setTransition(false);
      scheduleRender();
    }

    function buildMinimap() {
      if (!minimap) return;
      minimap.querySelectorAll(".minimap-node").forEach((node) => node.remove());
      const { worldWidth, worldHeight } = dimensions();
      nodes.forEach((node) => {
        const dot = document.createElement("span");
        dot.className = "minimap-node";
        dot.title = node.dataset.nodeTitle || node.dataset.canvasNode;
        dot.style.left = `${((node.offsetLeft + node.offsetWidth / 2) / worldWidth) * 100}%`;
        dot.style.top = `${((node.offsetTop + node.offsetHeight / 2) / worldHeight) * 100}%`;
        minimap.appendChild(dot);
      });
      minimap.appendChild(minimapViewport);
    }

    focusLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        const id = link.dataset.focusTarget;
        if (!id || !nodeById(id)) return;
        event.preventDefault();
        drawerApi?.close({ restoreFocus: false });
        focusNode(id, { updateUrl: true, animate: true });
        viewport.focus({ preventScroll: true });
      });
    });

    viewport.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.0015);
        zoomAt(event.clientX - rect.left, event.clientY - rect.top, camera.scale * factor);
        return;
      }

      setTransition(false);
      if (event.shiftKey && Math.abs(event.deltaX) < 1) {
        camera.x -= event.deltaY;
      } else {
        camera.x -= event.deltaX;
        camera.y -= event.deltaY;
      }
      scheduleRender();
    }, { passive: false });

    viewport.addEventListener("pointerdown", (event) => {
      if (event.target.closest("a, button, iframe, input, textarea, select, [data-no-drag]")) return;
      viewport.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      viewport.classList.add("is-dragging");
      setTransition(false);
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId)) return;
      const before = [...pointers.values()];
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const after = [...pointers.values()];

      if (after.length === 1) {
        camera.x += after[0].x - before[0].x;
        camera.y += after[0].y - before[0].y;
      } else if (after.length >= 2) {
        const oldA = before[0];
        const oldB = before[1];
        const newA = after[0];
        const newB = after[1];
        const oldMid = { x: (oldA.x + oldB.x) / 2, y: (oldA.y + oldB.y) / 2 };
        const newMid = { x: (newA.x + newB.x) / 2, y: (newA.y + newB.y) / 2 };
        const oldDistance = Math.max(1, Math.hypot(oldA.x - oldB.x, oldA.y - oldB.y));
        const newDistance = Math.max(1, Math.hypot(newA.x - newB.x, newA.y - newB.y));
        const worldX = (oldMid.x - camera.x) / camera.scale;
        const worldY = (oldMid.y - camera.y) / camera.scale;
        const limits = scaleLimits();
        const nextScale = clamp(camera.scale * (newDistance / oldDistance), limits.min, limits.max);
        camera.scale = nextScale;
        camera.x = newMid.x - worldX * nextScale;
        camera.y = newMid.y - worldY * nextScale;
      }
      scheduleRender();
    });

    function releasePointer(event) {
      pointers.delete(event.pointerId);
      if (!pointers.size) viewport.classList.remove("is-dragging");
    }

    viewport.addEventListener("pointerup", releasePointer);
    viewport.addEventListener("pointercancel", releasePointer);
    viewport.addEventListener("lostpointercapture", releasePointer);

    viewport.addEventListener("keydown", (event) => {
      if (event.target.closest("a, button, input, textarea, select")) return;
      const step = event.shiftKey ? 180 : 80;
      let handled = true;
      setTransition(false);
      switch (event.key) {
        case "ArrowLeft": camera.x += step; break;
        case "ArrowRight": camera.x -= step; break;
        case "ArrowUp": camera.y += step; break;
        case "ArrowDown": camera.y -= step; break;
        case "+":
        case "=": zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, camera.scale + 0.12); break;
        case "-": zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, camera.scale - 0.12); break;
        case "Home": focusNode("home", { updateUrl: true, animate: true }); break;
        default: handled = false;
      }
      if (handled) {
        event.preventDefault();
        scheduleRender();
      }
    });

    zoomInButton?.addEventListener("click", () => {
      zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, camera.scale + 0.12);
    });
    zoomOutButton?.addEventListener("click", () => {
      zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, camera.scale - 0.12);
    });
    resetButton?.addEventListener("click", () => focusNode("home", { updateUrl: true, animate: true }));

    minimap?.addEventListener("click", (event) => {
      const rect = minimap.getBoundingClientRect();
      const { viewportWidth, viewportHeight, worldWidth, worldHeight } = dimensions();
      const worldX = ((event.clientX - rect.left) / rect.width) * worldWidth;
      const worldY = ((event.clientY - rect.top) / rect.height) * worldHeight;
      camera.x = viewportWidth / 2 - worldX * camera.scale;
      camera.y = viewportHeight / 2 - worldY * camera.scale;
      setTransition(true);
      scheduleRender();
    });

    function focusFromLocationHash({ animate = true } = {}) {
      const id = window.location.hash.replace("#", "") || "home";
      resetViewportScroll();
      focusNode(nodeById(id) ? id : "home", { updateUrl: false, animate });
      window.requestAnimationFrame(resetViewportScroll);
    }

    window.addEventListener("popstate", () => focusFromLocationHash({ animate: true }));
    window.addEventListener("hashchange", () => focusFromLocationHash({ animate: true }));

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        buildMinimap();
        focusNode(currentId, { updateUrl: false, animate: false });
      }, 120);
    });

    buildMinimap();
    focusFromLocationHash({ animate: false });

    const settleInitialHash = () => {
      window.requestAnimationFrame(() => {
        focusFromLocationHash({ animate: false });
        window.requestAnimationFrame(resetViewportScroll);
      });
    };

    if (document.readyState === "complete") {
      settleInitialHash();
    } else {
      window.addEventListener("load", settleInitialHash, { once: true });
    }
  }

  function initDetailMenu() {
    const toggle = document.querySelector("[data-detail-menu-toggle]");
    const nav = document.querySelector("[data-detail-nav]");
    if (!toggle || !nav) return;

    function close() {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", () => {
      const open = !nav.classList.contains("is-open");
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }

  function initLightbox() {
    const dialog = document.querySelector("[data-lightbox-dialog]");
    const triggers = [...document.querySelectorAll("[data-lightbox]")];
    if (!dialog || !triggers.length) return;

    const image = dialog.querySelector("[data-lightbox-image]");
    const caption = dialog.querySelector("[data-lightbox-caption]");
    const closeButton = dialog.querySelector("[data-lightbox-close]");
    const previousButton = dialog.querySelector("[data-lightbox-previous]");
    const nextButton = dialog.querySelector("[data-lightbox-next]");
    let currentIndex = 0;
    let lastFocused = null;

    function show(index) {
      currentIndex = (index + triggers.length) % triggers.length;
      const trigger = triggers[currentIndex];
      if (image) {
        image.src = trigger.dataset.full || trigger.querySelector("img")?.src || "";
        image.alt = trigger.dataset.alt || trigger.querySelector("img")?.alt || "放大圖片";
      }
      if (caption) caption.textContent = trigger.dataset.caption || trigger.querySelector("span")?.textContent || "";
      if (previousButton) previousButton.disabled = triggers.length < 2;
      if (nextButton) nextButton.disabled = triggers.length < 2;
    }

    function open(index) {
      lastFocused = document.activeElement;
      show(index);
      document.body.classList.add("lightbox-open");
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      closeButton?.focus();
    }

    function close() {
      document.body.classList.remove("lightbox-open");
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
      if (lastFocused instanceof HTMLElement) lastFocused.focus();
    }

    triggers.forEach((trigger, index) => trigger.addEventListener("click", () => open(index)));
    closeButton?.addEventListener("click", close);
    previousButton?.addEventListener("click", () => show(currentIndex - 1));
    nextButton?.addEventListener("click", () => show(currentIndex + 1));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        show(currentIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        show(currentIndex + 1);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && dialog.open) {
        event.preventDefault();
        close();
      }
    });
  }

  async function initVisitCounter() {
    const counter = document.querySelector("[data-visit-counter]");
    const count = counter?.querySelector("[data-visit-count]");
    if (!counter || !count) return;

    try {
      const response = await fetch("https://jerrylee-web.goatcounter.com/counter/TOTAL.json", {
        credentials: "omit",
      });
      if (!response.ok) return;

      const data = await response.json();
      if (typeof data.count !== "string" || !data.count.trim()) return;

      count.textContent = data.count.trim();
      counter.hidden = false;
    } catch (_error) {
      // Keep the optional counter hidden when the service is blocked or unavailable.
    }
  }

  function init() {
    initIntro();
    initCanvas();
    initDetailMenu();
    initLightbox();
    initVisitCounter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
