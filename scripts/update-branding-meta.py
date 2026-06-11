#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = {
    "about.html": "https://www.genella.co.tz/about.html",
    "services.html": "https://www.genella.co.tz/services.html",
    "pricing.html": "https://www.genella.co.tz/pricing.html",
    "portfolio.html": "https://www.genella.co.tz/portfolio.html",
    "portfolio-details.html": "https://www.genella.co.tz/portfolio-details.html",
    "gallery.html": "https://www.genella.co.tz/gallery.html",
    "contact.html": "https://www.genella.co.tz/contact.html",
}

META_TEMPLATE = """
    <meta name="author" content="Genella Visuals">
    <meta name="copyright" content="Genella Visuals">
    <link rel="icon" href="img/f-logo.png" type="image/png">
    <link rel="apple-touch-icon" href="img/f-logo.png">
    <link rel="manifest" href="site.webmanifest">
    <meta property="og:site_name" content="Genella Visuals">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="en_US">
    <meta property="og:url" content="{og_url}">
    <meta property="og:title" content="{og_title}">
    <meta property="og:description" content="{og_desc}">
    <meta property="og:image" content="https://www.genella.co.tz/img/logo.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@genellavisuals">
    <meta name="twitter:title" content="{og_title}">
    <meta name="twitter:description" content="{og_desc}">"""


def esc_attr(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
    )


for filename, og_url in PAGES.items():
    path = ROOT / filename
    text = path.read_text(encoding="utf-8")
    text = text.replace('<html lang="zxx">', '<html lang="en">')

    if 'meta name="author"' in text:
        print(f"skip {filename}")
        continue

    title_m = re.search(r"<title>(.*?)</title>", text, re.S)
    desc_m = re.search(r'<meta name="description" content="(.*?)">', text)
    title = title_m.group(1).strip()
    desc = desc_m.group(1).strip()
    meta_block = META_TEMPLATE.format(
        og_url=og_url,
        og_title=esc_attr(title),
        og_desc=esc_attr(desc),
    )
    text = text.replace(f"    <title>{title}</title>", f"    <title>{title}</title>{meta_block}", 1)
    path.write_text(text, encoding="utf-8")
    print(f"updated {filename}")
