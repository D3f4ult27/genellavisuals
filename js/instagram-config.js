/**
 * Instagram feed configuration for GENELLA Visuals.
 *
 * Default: loads cached posts from data/instagram-feed.json (refresh via scripts/fetch-instagram-feed.py).
 * Optional: set graphApiToken + graphApiUserId for live Instagram Graph API (Business/Creator account).
 */
window.INSTAGRAM_CONFIG = {
    username: 'genellavisuals',
    profileUrl: 'https://www.instagram.com/genellavisuals/',
    feedUrl: 'data/instagram-feed.json',
    cacheKey: 'genella_instagram_feed_v1',
    cacheTtlMs: 24 * 60 * 60 * 1000,
    footerLimit: 3,
    galleryLimit: 12,
    graphApiToken: null,
    graphApiUserId: null
};
