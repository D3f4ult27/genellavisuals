/* Before/After Image Comparison
   - Fixed frame: both images share the same dimensions
   - Before sits on top of after; only the clip edge moves
   - Drag left to reveal full after, drag right to reveal full before
*/
(function () {
    'use strict';

    function initCompare(el) {
        var container = el;
        var overlay = container.querySelector('.ba-overlay');
        var divider = container.querySelector('.ba-divider');
        var handle = container.querySelector('.ba-handle');
        var baseImg = container.querySelector('.ba-img--base');
        var overlayImg = container.querySelector('.ba-img--overlay');

        var rect = null;
        var percent = 50;
        var dragging = false;
        var raf = null;

        function syncImageSizes() {
            rect = container.getBoundingClientRect();
            var w = Math.round(rect.width);
            var h = Math.round(rect.height);

            if (overlayImg && w > 0 && h > 0) {
                overlayImg.style.width = w + 'px';
                overlayImg.style.height = h + 'px';
            }
        }

        function updateUI(p) {
            p = Math.max(0, Math.min(100, p));
            percent = p;

            if (overlay) {
                overlay.style.width = p + '%';
            }

            if (divider) {
                divider.style.left = p + '%';
            }

            if (handle) {
                handle.style.left = p + '%';
                handle.setAttribute('aria-valuenow', Math.round(p));
            }
        }

        function getPercentFromEvent(clientX) {
            if (!rect) return percent;
            var x = clientX - rect.left;
            return Math.max(0, Math.min(100, (x / rect.width) * 100));
        }

        function scheduleUpdate(p) {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(function () {
                updateUI(p);
                raf = null;
            });
        }

        function refreshLayout() {
            syncImageSizes();
            updateUI(percent);
        }

        function onPointerDown(e) {
            if (e.target !== handle && e.target !== container && !container.contains(e.target)) {
                return;
            }

            dragging = true;
            syncImageSizes();

            var p = getPercentFromEvent(e.clientX);
            scheduleUpdate(p);

            if (container.setPointerCapture && e.pointerId !== undefined) {
                try {
                    container.setPointerCapture(e.pointerId);
                } catch (err) { /* unsupported */ }
            }

            e.preventDefault();
        }

        function onPointerMove(e) {
            if (!dragging) return;
            scheduleUpdate(getPercentFromEvent(e.clientX));
        }

        function onPointerUp(e) {
            if (!dragging) return;
            dragging = false;

            if (container.releasePointerCapture && e.pointerId !== undefined) {
                try {
                    container.releasePointerCapture(e.pointerId);
                } catch (err) { /* unsupported */ }
            }
        }

        function onKeyDown(e) {
            if (e.target !== handle) return;

            var step = e.shiftKey ? 10 : 5;
            var newPercent = percent;

            if (e.key === 'ArrowLeft' || e.key === 'Left') {
                newPercent = Math.max(0, percent - step);
                e.preventDefault();
            } else if (e.key === 'ArrowRight' || e.key === 'Right') {
                newPercent = Math.min(100, percent + step);
                e.preventDefault();
            }

            if (newPercent !== percent) {
                syncImageSizes();
                scheduleUpdate(newPercent);
            }
        }

        if (handle) {
            handle.addEventListener('pointerdown', onPointerDown);
            handle.addEventListener('keydown', onKeyDown);
        }

        container.addEventListener('pointerdown', function (e) {
            if (e.target === handle) return;
            onPointerDown(e);
        });

        container.addEventListener('pointermove', onPointerMove);
        container.addEventListener('dragstart', function (e) { e.preventDefault(); });
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);

        window.addEventListener('resize', refreshLayout);

        if (typeof ResizeObserver === 'function') {
            var ro = new ResizeObserver(refreshLayout);
            ro.observe(container);
        }

        if (baseImg) {
            baseImg.addEventListener('load', refreshLayout);
        }
        if (overlayImg) {
            overlayImg.addEventListener('load', refreshLayout);
        }

        refreshLayout();
    }

    document.addEventListener('DOMContentLoaded', function () {
        var nodes = document.querySelectorAll('[data-ba]');

        function findGalleryImage(name) {
            var exts = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg'];
            var names = [name, name.toLowerCase(), name.charAt(0).toUpperCase() + name.slice(1)];

            return new Promise(function (resolve) {
                var ni = 0;
                var ei = 0;

                function tryNext() {
                    if (ni >= names.length) return resolve(null);
                    if (ei >= exts.length) { ei = 0; ni++; return tryNext(); }

                    var url = 'img/gallery/' + names[ni] + '.' + exts[ei++];
                    var img = new Image();
                    img.onload = function () { resolve(url); };
                    img.onerror = tryNext;
                    img.src = url;
                }

                tryNext();
            });
        }

        nodes.forEach(function (n) {
            var baseImg = n.querySelector('.ba-img--base');
            var overlayImg = n.querySelector('.ba-img--overlay');

            Promise.all([findGalleryImage('before'), findGalleryImage('after')])
                .then(function (results) {
                    if (results[1] && baseImg) baseImg.src = results[1];
                    if (results[0] && overlayImg) overlayImg.src = results[0];
                })
                .finally(function () {
                    initCompare(n);
                });
        });
    });
})();
