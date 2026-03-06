# Publishing the Wiki

This repository keeps wiki source files in `/wiki`.

## Why source is in-repo

- Wiki pages can be reviewed with normal PR flow
- Changes stay versioned with app releases
- Contributors can edit docs without special wiki access

## Enable GitHub Wiki

In GitHub repo settings:

1. Open `Settings`
2. Go to `General`
3. Enable `Wikis`

After enabling, the wiki git remote will exist:

- `https://github.com/Nivetha200111/Jarvis.wiki.git`

## Publish current pages

Preferred command:

```bash
/home/nivetha/Jarvis/scripts/publish-wiki.sh
```

Manual equivalent:

```bash
tmp_dir="$(mktemp -d)"
git clone https://github.com/Nivetha200111/Jarvis.wiki.git "$tmp_dir"
cp /home/nivetha/Jarvis/wiki/*.md "$tmp_dir"/
cd "$tmp_dir"
git add .
git commit -m "docs: initialize wiki pages"
git push
```

## Keep wiki in sync

Whenever `/wiki/*.md` changes:

1. Copy changed files into `Jarvis.wiki.git` clone
2. Commit and push there
