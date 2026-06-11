#!/usr/bin/env python3
"""Refresh data/instagram-feed.json from @genellavisuals (image posts only).

Run periodically (e.g. weekly cron) to keep the cached feed current.
Requires network access; not run in the browser.
"""

import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

USERNAME = "genellavisuals"
PROFILE_URL = f"https://www.instagram.com/{USERNAME}/"
API_URL = f"https://www.instagram.com/api/v1/users/web_profile_info/?username={USERNAME}"
HEADERS = {
    "User-Agent": "Instagram 219.0.0.12.117 Android",
    "X-IG-App-ID": "936619743392459",
}
OUTPUT = Path(__file__).resolve().parent.parent / "data" / "instagram-feed.json"

CATEGORIES = ["fashion", "lifestyle", "natural", "wedding"]
SIZE_CLASSES = ["", "small-height", "large-small-height", "large-height", "medium-large-height", "medium-small-height"]


def infer_category(caption: str, index: int) -> str:
    text = caption.lower()
    if "wedding" in text:
        return "wedding"
    if "fashion" in text:
        return "fashion"
    if "corporate" in text or "brand" in text:
        return "lifestyle"
    return CATEGORIES[index % len(CATEGORIES)]


def main() -> int:
    req = urllib.request.Request(API_URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.load(resp)

    edges = (
        payload.get("data", {})
        .get("user", {})
        .get("edge_owner_to_timeline_media", {})
        .get("edges", [])
    )

    posts = []
    for edge in edges:
        node = edge.get("node", {})
        if node.get("is_video"):
            continue

        caption_edges = node.get("edge_media_to_caption", {}).get("edges", [])
        caption = caption_edges[0]["node"]["text"] if caption_edges else ""
        idx = len(posts)

        posts.append({
            "id": node.get("id"),
            "shortcode": node.get("shortcode"),
            "permalink": f"https://www.instagram.com/p/{node.get('shortcode')}/",
            "thumbnail": node.get("thumbnail_src"),
            "image": node.get("display_url"),
            "caption": caption[:200],
            "category": infer_category(caption, idx),
            "sizeClass": SIZE_CLASSES[idx % len(SIZE_CLASSES)],
            "timestamp": node.get("taken_at_timestamp"),
        })

    if not posts:
        print("No image posts fetched.", file=sys.stderr)
        return 1

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(
            {
                "username": USERNAME,
                "profileUrl": PROFILE_URL,
                "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "posts": posts,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Saved {len(posts)} posts to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
