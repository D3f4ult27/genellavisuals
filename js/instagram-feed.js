/**
 * Instagram feed loader for footer thumbnails and gallery page.
 * Uses local JSON cache with localStorage TTL; optional Graph API when configured.
 */
(function ($) {
    'use strict';

    var config = window.INSTAGRAM_CONFIG || {};
    var FALLBACK_FOOTER = [
        { permalink: config.profileUrl, thumbnail: 'img/instagram/insta-1.jpg', caption: 'Instagram post' },
        { permalink: config.profileUrl, thumbnail: 'img/instagram/insta-2.jpg', caption: 'Instagram post' },
        { permalink: config.profileUrl, thumbnail: 'img/instagram/insta-3.jpg', caption: 'Instagram post' }
    ];

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function readCache() {
        try {
            var raw = localStorage.getItem(config.cacheKey);
            if (!raw) return null;
            var cached = JSON.parse(raw);
            if (!cached || !cached.expiresAt || Date.now() > cached.expiresAt) return null;
            return cached.data;
        } catch (e) {
            return null;
        }
    }

    function writeCache(data) {
        try {
            localStorage.setItem(config.cacheKey, JSON.stringify({
                expiresAt: Date.now() + (config.cacheTtlMs || 86400000),
                data: data
            }));
        } catch (e) {
            /* localStorage unavailable */
        }
    }

    function fetchGraphApi() {
        var token = config.graphApiToken;
        var userId = config.graphApiUserId;
        if (!token || !userId) {
            return Promise.reject(new Error('Graph API not configured'));
        }

        var url = 'https://graph.instagram.com/' + userId +
            '/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp' +
            '&limit=' + (config.galleryLimit || 12) +
            '&access_token=' + encodeURIComponent(token);

        return fetch(url)
            .then(function (res) {
                if (!res.ok) throw new Error('Graph API request failed');
                return res.json();
            })
            .then(function (payload) {
                var posts = (payload.data || [])
                    .filter(function (item) { return item.media_type === 'IMAGE'; })
                    .map(function (item, index) {
                        return {
                            id: item.id,
                            permalink: item.permalink,
                            thumbnail: item.media_url,
                            image: item.media_url,
                            caption: (item.caption || '').slice(0, 200),
                            category: inferCategory(item.caption, index),
                            sizeClass: sizeClassForIndex(index)
                        };
                    });

                return {
                    username: config.username,
                    profileUrl: config.profileUrl,
                    fetchedAt: new Date().toISOString(),
                    posts: posts
                };
            });
    }

    function fetchJsonFeed() {
        return fetch(config.feedUrl)
            .then(function (res) {
                if (!res.ok) throw new Error('Feed JSON unavailable');
                return res.json();
            });
    }

    function loadFeed() {
        var cached = readCache();
        if (cached && cached.posts && cached.posts.length) {
            return Promise.resolve(cached);
        }

        var chain = Promise.resolve();

        if (config.graphApiToken && config.graphApiUserId) {
            chain = fetchGraphApi().catch(function () {
                return fetchJsonFeed();
            });
        } else {
            chain = fetchJsonFeed();
        }

        return chain
            .then(function (data) {
                if (data && data.posts && data.posts.length) {
                    writeCache(data);
                }
                return data;
            })
            .catch(function () {
                return null;
            });
    }

    var CATEGORIES = ['fashion', 'lifestyle', 'natural', 'wedding'];
    var SIZE_CLASSES = ['', 'small-height', 'large-small-height', 'large-height', 'medium-large-height', 'medium-small-height'];

    function inferCategory(caption, index) {
        var text = (caption || '').toLowerCase();
        if (text.indexOf('wedding') !== -1) return 'wedding';
        if (text.indexOf('fashion') !== -1) return 'fashion';
        if (text.indexOf('corporate') !== -1 || text.indexOf('brand') !== -1) return 'lifestyle';
        return CATEGORIES[index % CATEGORIES.length];
    }

    function sizeClassForIndex(index) {
        return SIZE_CLASSES[index % SIZE_CLASSES.length];
    }

    function imagePosts(posts) {
        return (posts || []).filter(function (post) {
            return post.image || post.thumbnail;
        });
    }

    function renderFooter($container, posts) {
        var limit = config.footerLimit || 3;
        var items = imagePosts(posts).slice(0, limit);
        if (!items.length) {
            items = FALLBACK_FOOTER;
        }

        var html = items.map(function (post) {
            var src = post.thumbnail || post.image;
            var alt = escapeHtml(post.caption || 'Instagram post from GENELLA Visuals');
            var href = post.permalink || config.profileUrl;
            return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer" aria-label="View on Instagram">' +
                '<img src="' + escapeHtml(src) + '" alt="' + alt + '" loading="lazy" decoding="async" width="120" height="120">' +
                '</a>';
        }).join('');

        $container.html(html);
    }

    function buildGalleryItem(post) {
        var sizeClass = post.sizeClass ? ' ' + post.sizeClass : '';
        var category = post.category || 'lifestyle';
        var image = escapeHtml(post.image || post.thumbnail);
        var caption = escapeHtml(post.caption || 'Instagram post');
        return '<div class="gf-item' + sizeClass + ' set-bg ' + category + '" data-setbg="' + image + '">' +
            '<a href="' + image + '" class="gf-icon image-popup" title="' + caption + '" aria-label="View image: ' + caption + '">' +
            '<span class="icon_plus"></span></a>' +
            '</div>';
    }

    function applyBackgrounds($scope) {
        $scope.find('.set-bg').each(function () {
            var bg = $(this).data('setbg');
            if (bg) {
                $(this).css('background-image', 'url(' + bg + ')');
            }
        });
    }

    function initGalleryIsotope($grid) {
        if (!$grid.length || typeof $.fn.isotope !== 'function') return;

        if ($grid.data('isotope')) {
            $grid.isotope('destroy');
        }

        $grid.isotope({
            itemSelector: '.gf-item',
            percentPosition: true,
            masonry: {
                columnWidth: '.gf-item',
                horizontalOrder: true
            }
        });
    }

    function bindImagePopup($scope) {
        if (typeof $.fn.magnificPopup !== 'function') return;
        $scope.find('.image-popup').magnificPopup({ type: 'image' });
    }

    function renderGallery($grid, posts) {
        var limit = config.galleryLimit || 12;
        var items = imagePosts(posts).slice(0, limit);

        if (!items.length) {
            return;
        }

        $grid.html(items.map(buildGalleryItem).join(''));
        applyBackgrounds($grid);
        initGalleryIsotope($grid);
        bindImagePopup($grid);
    }

    function init() {
        var $footerTargets = $('.fw-instagram[data-instagram-feed]');
        var $gallery = $('.gallery-filter[data-instagram-gallery]');

        if (!$footerTargets.length && !$gallery.length) {
            return;
        }

        loadFeed().then(function (data) {
            var posts = data && data.posts ? data.posts : [];

            $footerTargets.each(function () {
                renderFooter($(this), posts);
            });

            if ($gallery.length) {
                renderGallery($gallery, posts);
            }
        });
    }

    window.GenellaInstagram = {
        init: init,
        loadFeed: loadFeed
    };

    $(init);
}(jQuery));
