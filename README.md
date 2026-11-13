<p align="center">
  <img src="assets/icon.png" width="120" alt="Bayeux">
</p>

# 🧵 Bayeux

*[Leer en español](README.es.md)*

An embed service (the preview a chat app draws when you paste a link) for X/Twitter links. It stitches the images of a post into **a single horizontal strip**, in order and with a few pixels between them.

The name comes from the [Bayeux Tapestry](https://en.wikipedia.org/wiki/Bayeux_Tapestry): one continuous embroidered story that you read by moving sideways, which is exactly what the service does with the photos. It is a sibling of [Ronda](https://github.com/JosueMeserom/ronda) and [Segovia](https://github.com/JosueMeserom/segovia), two other projects of mine named after places.

---

## 🤔 The problem

When you paste an X link in Discord, the embed only shows the first image. FxTwitter and FixupX fix that, but when the post has 3 or 4 photos they lay them out as a grid:

```
            normal embed              Bayeux
          ┌─────────┬─────────┐   ┌───┬───┬───┬───┐
          │    1    │    2    │   │ 1 │ 2 │ 3 │ 4 │
          ├─────────┼─────────┤   │   │   │   │   │
          │    3    │    4    │   │   │   │   │   │
          └─────────┴─────────┘   └───┴───┴───┴───┘
           the drawing breaks      reads as a whole
```

Many artists split a tall illustration into several images, either as a style or because X limits the size. The grid ruins that reading. Bayeux detects that specific case and stitches the images in a row.

---

## 🚀 How to use it

Replace `x.com` with the host where you run Bayeux:

```
https://x.com/user/status/1234567890
https://your-host.example.net/user/status/1234567890
```

- If the visitor is a **preview bot** (the program Discord, Telegram, Slack, WhatsApp or Mastodon use to read the link and draw the preview), it gets a minimal HTML page with the meta tags.
- If it is a **person with a browser**, I redirect them to the original post with a `302`. Suffixes in the copied link (`/photo/1`) are kept.

If the automatic detection gets it wrong, you can force it from the URL:

| Parameter | What it does |
|---|---|
| `?layout=row` | Forces the strip |
| `?layout=grid` | Forces the grid |
| `?layout=auto` | Default |
| `?gap=N` | Forces the gap between panels, in pixels |
| `?gap=auto` | Default |
| `?zoom=100` | Computes the gap like X's wide layout (desktop at 100%) |
| `?zoom=300` | Like the narrow layout (mobile, or 300% zoom). Default |
| `?q=N` | Compression quality, 40 to 100. Only on `/strip/`, because it does not change the dimensions |

So you don't have to edit the link by hand every time, there is a [userscript](#-userscript-to-copy-links) that adds a button to every post on X to copy the link already changed.

---

## 🧠 How it decides to stitch a row

It stitches a row when **all** of this is true:

1. The post has between **2 and 4 photos**.
2. There is **no video or GIF** mixed in (if there is, stitching makes no sense).
3. The **heights match** within a tolerance, 2% by default.

In real cuts the heights are identical, so the 2% is only a margin: it lets through a rounding difference of a few pixels (24 on a photo 1206 tall) without letting in photos that have nothing to do with each other.

Otherwise it falls back to the usual behaviour: a grid for several photos, a single image for one.

The good signal is the **height**, not the aspect ratio. Someone who cuts an illustration into strips keeps the height and lets the widths vary by a few pixels. You can see it in real posts: four photos of `410×1206`, `409×1206`, `407×1206` and `406×1206`. Same height, different widths. If I also required a uniform aspect ratio, I would reject uneven cuts that are perfectly valid.

⚠️ **Note**: the heuristic (the rough rule it decides with) does not look at the images, only at their dimensions. Two unrelated photos taken in the same orientation also have the same height and will come out as a row. That is what `?layout=grid` is for.

---

## 🖼️ How the embed is built

This part is fun, because it is not obvious.

A normal link can only fill in a title, a description and an image with OpenGraph meta tags (the standard a page uses to tell a chat app what to show of it). That gives a plain embed. What Bayeux does is declare this as well:

```html
<link rel="alternate" type="application/activity+json" href="...">
```

Discord has **native Mastodon support**, so when it sees that line it downloads `/api/v1/statuses/:id` and draws the embed from there: the author's avatar, large text, stats in bold and a footer with the date of the post. It is the only way to get that; plain OpenGraph does not reach.

The difference from other services is in the `media_attachments` field of that document. They declare **the separate photos**, and that is why Discord puts them in its grid. Bayeux declares **a single attachment**, the strip already stitched. Same nice embed, and nobody cuts the drawing apart.

Every other client (Telegram, WhatsApp) still gets normal OpenGraph.

### Quotes

If the post **quotes another one**, the quote goes in the body as a `<blockquote>`, which is what makes Discord draw the side bar so it stands apart from the post's own text. I cut it at 200 characters, because a long quote would stretch the embed without adding anything. "Citando" (quoting) links to the quoted post and the handle links to the profile of whoever wrote it.

And if the post **has no media of its own but the quoted one does**, the quoted media is shown. Without that, a "look at this" quoting someone else ended up with no image. The post's own media always wins when it exists.

⚠️ **Note**: the media appears in the media area of the embed, below the quote, and not inside the quote box. That is not my choice: Discord only draws images from `media_attachments`, and the body does not accept `<img>`.

### Videos and GIFs

A post with a video does not go through composition: **I declare the original MP4** and the client plays it. I have checked that `video.twimg.com` serves it with `content-type: video/mp4`, `accept-ranges` and open CORS, so no proxy is needed.

- Through OpenGraph: `og:video`, `og:video:type`, its dimensions, `og:type: video.other` and `twitter:card: player`. The `og:image` becomes the thumbnail.
- Through the Mastodon document, which is how Discord gets it: a `media_attachments` entry of type `video`.
- The body of the embed also carries a **download link** to the MP4, a `⬇️` at the end of the stats line so it does not add a single line. It is needed because Discord's player has no download button of its own.

**GIFs** are a separate case. X does not store them as GIFs, but as a short MP4. At first I declared it as `gifv`, which is the type Mastodon has for this, but Discord draws it as a normal video, with controls and no loop. To look like a GIF it has to be an animated image, so in the Mastodon document I link the **animated WebP that FxEmbed makes** from that same MP4 (`gif.fxtwitter.com`), which is what FxTwitter declares for these posts. OpenGraph still gets the MP4, and the `⬇️` also downloads the MP4.

If a post had a video and photos at the same time (X does not allow it today), the video wins.

### The parameters travel inside the id

⚠️ **Note**: on the Mastodon path **no query string survives**. Discord takes the id from the link and builds the `/api/v1/statuses/:id` URL itself, so any `?layout=` or `?gap=` is lost on the way. That is why the layout and the gap, already resolved, travel **encoded inside the id**, which Discord requires to be numeric:

```
without parameters:   2095001889784164697
with parameters:      9 1 016 2095001889784164697
                      │ │ │   └ the usual id
                      │ │ └ gap in pixels, three digits
                      │ └ layout: 1 row, 2 grid
                      └ version marker
```

A bare id is still understood, so the embeds Discord already has cached do not break.

---

## 📏 How much gap to leave

The pieces of a post are **not always contiguous**. It can be measured: comparing the difference between adjacent columns inside a panel with the difference across the cut tells you how much content is missing. In two real posts I got this:

| Post | Panels | Missing | % of width |
|---|---|---|---|
| 4 photos of 410×1206 | 4 | ~19px | 4.63% |
| 3 photos of 841×1277 | 3 | ~1px | 0.12% |

So **there is no universal number**, because it depends on how each person cut their drawing. Some make up for the gap X is going to add and others cut flush.

That is why Bayeux does not try to guess what is missing, but to **reproduce what you see on X**, which is the reference the artist works with.

X always separates by **6 CSS pixels**: 4 between borders plus 1 of border on each side. That is the same on desktop and on mobile. What changes is the size it draws the pieces at, so the **proportion** is not the same:

| Layout | Piece height | Gap / height |
|---|---|---|
| Wide (desktop at 100%) | 700 CSS px | 0.857 % |
| Narrow (mobile, or 300% zoom) | 464 CSS px | 1.292 % |

I calibrate on the **narrow** one, which at the default height of 2000px is **26px**. `?zoom=100` switches to the wide one (17px) and `?zoom=300` is the default.

#### Why the narrow one by default

Four reasons, and the last one weighs the most:

1. **It is where the cuts fit.** Measuring on the image itself how much content is missing between pieces gives 15 to 25 source px. The narrow layout gives 15.6 and the wide one 10.3, which falls outside the range.
2. **It is the view where the post gets checked.** Artists look at how it turned out on their phone, so it is reasonable to think they cut with that gap in mind.
3. **It looks better**, and not only as a matter of taste: below a certain width, a break reads as a defect (a compression line, a scaling glitch) and not as a decision. Above it, it reads like the gutter between comic panels: it separates without breaking the unity. The whole point of this service is that you notice the second one.
4. **The error does not cost the same in both directions.** Going over leaves a gap that is a bit generous but clearly intended; falling short makes the lines look like noise. When in doubt, it is better to err high.

Both values are real measurements, not a curve. X changes layout at a breakpoint I have not located, so an in-between `?zoom=` snaps to the closer of the two instead of interpolating, because interpolating would be making up a number.

It is no accident that the gap is a proportion of the **height** and not of the width: when the row does not fit, X **does not shrink it**, it lets it overflow with horizontal scroll. The width of the container does not enter the calculation, and that is why all of this is computed from the metadata, without downloading any image. If a specific post needs something else, `?gap=N` forces it.

---

## 🗺️ Routes

| Route | What it does |
|---|---|
| `GET /:handle/status/:id` | HTML with meta tags for bots, `302` to x.com for people |
| `GET /:handle/status/:id/*` | The same, swallowing suffixes like `/photo/1` |
| `GET /strip/:id.webp` | The stitched image. Accepts `?layout=`. Also answers to `.jpg`, which was the first format: I keep it so the embeds that were already cached do not break. There the gap is black, because JPEG has no transparency |
| `GET /api/v1/statuses/:id` | The Mastodon-style document Discord asks for |
| `GET /users/:handle/statuses/:id` | Only exists so the previous link is not a 404 |
| `GET /oembed?id=` | oEmbed response |
| `GET /icon.png` | The logo, if one is configured |
| `GET /health` | Liveness check, with no external dependencies |
| `GET /` | Short landing page (see [Static landing page](#static-landing-page) if you prefer to serve it from the proxy) |

---

## 📦 Installing with pm2

I run it with pm2 (a process manager for Node, which keeps it running and brings it back if it dies):

```bash
git clone <this-repo> bayeux && cd bayeux
npm ci
cp .env.example .env && $EDITOR .env    # at least: ALLOWED_HOSTS and PUBLIC_BASE_URL
npm run build

pm2 start ecosystem.config.cjs
pm2 save          # freezes the current process list
pm2 startup       # prints a command, run it with sudo
```

`pm2 save` plus `pm2 startup` is what brings the service back on its own after the server reboots. If you skip the `save`, the automatic start will bring up an empty list.

Install log rotation too, because otherwise the logs grow until they fill your disk:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

⚠️ **Note**: `pm2 restart bayeux` (by name) **does not re-read** `ecosystem.config.cjs`. pm2 keeps the configuration it registered the first time. To make it re-read, you have to pass it the file:

```bash
pm2 restart ecosystem.config.cjs        # re-reads port, node_args, memory, paths...
```

With one exception: the `env` block is **not** applied that way either, nor with `--update-env`. To change variables through it you have to recreate the app:

```bash
pm2 delete bayeux && pm2 start ecosystem.config.cjs && pm2 save
```

(In this project it does not matter, because the variables do not come from `env` but from the `.env` file Node loads with `--env-file-if-exists`.)

### Watchdog

pm2 restarts the process if it dies, but it does not cover the case where it stays alive and stops answering. `scripts/vigilar.sh` checks `/health` from outside and restarts it if needed. I call it from cron every five minutes:

```bash
*/5 * * * * HEALTH_URL=http://127.0.0.1:3000/health /path/to/bayeux/scripts/vigilar.sh >/dev/null 2>&1
```

It tries three times before calling anything down (a one-second blip is not an outage), writes what happens to `~/bayeux-vigilante.log` and, if you set `WEBHOOK_URL`, notifies you on Discord. With `DRY_RUN=1` it detects but does not restart, which is how you test it without touching anything.

### Quick check

```bash
curl -sH "User-Agent: Discordbot/2.0" http://localhost:3000/user/status/ID | grep -i "og:"
```

You should see an `og:url` pointing to **x.com** (not to your service) and an `og:image` pointing to your `/strip/`.

### About Docker

There is no Dockerfile on purpose. `sharp` (the library I stitch the images with) ships native libvips binaries, and they make a well-built image (multi-stage, the right variant for the platform, not breaking on Alpine) more work than the whole deployment. With pm2 this is three commands. If you need it in a container, start from `node:24-slim`. I have not tried that image, but outside a container Bayeux passes the tests and stitches the same on Node 20, 22, 24 and 26.

---

## 🌐 Behind a reverse proxy

The process listens **only locally**, never on `0.0.0.0`. The one that exposes it to the outside is the reverse proxy (the web server that receives requests from outside and passes them to Bayeux), which also handles TLS.

The proxy has to pass two headers, because the absolute URL of the `og:image` is built from them:

- `X-Forwarded-Host`, the host the request came in through.
- `X-Forwarded-Proto`, that is, `https`.

Without them, Bayeux falls back to `PUBLIC_BASE_URL` and the bot will download the image from a different host than the one pasted in the chat.

### Several hostnames at once

Bayeux is designed to answer on **several subdomains pointing to the same process**. The base URL is taken from each request, not from a constant, so the `og:image` always goes out through the subdomain that was pasted.

Two things you have to configure properly:

- **`ALLOWED_HOSTS`**: every hostname you serve. The incoming host is compared against that list, and what gets written in the HTML is *the entry in the list*, not the header received. That way a tampered `Host` cannot get into the HTML.
- **`TRUST_PROXY`**: the IP or CIDR (an IP range, like `172.17.0.0/16`) of the proxy. **Do not set it to `true`**, because then anyone can fake `X-Forwarded-For` and the per-IP rate limit stops being of any use.

### Example with Caddy

Caddy sends `X-Forwarded-Host` and `X-Forwarded-Proto` by default in `reverse_proxy`, so you do not have to declare them:

```caddyfile
bayeux.example.net, tirax.example.net, panox.example.net {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

### Static landing page

In `landing/` there is a single-page landing, with no dependencies and no build step, that can be served straight from the proxy instead of by the process. It has a link converter and a comparison generated **by the service itself**, so the images come from `/strip/` and you have to leave that route pointing to the backend:

```caddyfile
bayeux.example.net, tirax.example.net {
	handle / {
		root * /path/to/bayeux/landing
		file_server
	}
	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
```

⚠️ **Note**: they have to be `handle` blocks, not a bare `reverse_proxy`. `handle /` only captures the exact root, and everything else (`/strip/`, `/icon.png`, `/api/v1/statuses/`) still reaches the process, which is exactly what is needed.

⚠️ **Note**: if your Caddy runs **inside a container**, `127.0.0.1` is the container itself and it will not reach anything. In that case point it to the gateway of the Docker bridge (`172.17.0.1`), set Bayeux's `HOST` to that as well, and use that network in `TRUST_PROXY`. That is how I have it.

---

## 🔧 Environment variables

They all have a reasonable default. The full, commented file is [`.env.example`](.env.example) (commented in English and Spanish).

### Server

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Listening port |
| `HOST` | `127.0.0.1` | Interface. Leave it local if there is a proxy in front |
| `TRUST_PROXY` | `127.0.0.1` | IP or CIDR of the trusted proxy. Never `true` |
| `LOG_LEVEL` | `info` | Log level |

### Hostnames

| Variable | Default | What it does |
|---|---|---|
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Fallback if the incoming host is not valid |
| `ALLOWED_HOSTS` | `localhost:3000,...` | Allowlist of hosts that can be reflected |
| `HOST_LAYOUTS` | *(empty)* | Fixed layout per host, like `tirax.example.net=row` |

### Upstream API

| Variable | Default | What it does |
|---|---|---|
| `FX_API_BASE` | `https://api.fxtwitter.com` | Base of the API |
| `FETCH_TIMEOUT_MS` | `6000` | Timeout of each outgoing request |
| `OUTBOUND_USER_AGENT` | `Bayeux/0.1 (...)` | User agent Bayeux goes out with |

### Composition

| Variable | Default | What it does |
|---|---|---|
| `MAX_PHOTOS` | `4` | Maximum number of panels |
| `MAX_HEIGHT` | `2000` | Common height the panels are normalised to. High, so it does not rescale more than needed |
| `MAX_PIXELS` | `12000000` | Pixel budget of the canvas. If it is exceeded, the height drops on its own |
| `MAX_DOWNLOAD_BYTES` | `12582912` | Limit per downloaded image |
| `GAP` | `auto` | Gap between panels. See [How much gap to leave](#-how-much-gap-to-leave) |
| `X_DISPLAY_HEIGHT` | `1393` | Height of the piece in the reference screenshot |
| `X_DISPLAY_GAP` | `18` | Gap in that same screenshot. Only the ratio is used |
| `BG_COLOR` | `transparent` | Colour of the gap. With `transparent` you see the chat background |
| `WEBP_QUALITY` | `92` | WebP quality |
| `JPEG_QUALITY` | `88` | JPEG quality |
| `ROW_HEIGHT_TOLERANCE` | `0.02` | Tolerated spread of heights, `(max-min)/max` |
| `ROW_ASPECT_TOLERANCE` | *(disabled)* | The same over `w/h`. See the note below |

⚠️ **Note**: `ROW_ASPECT_TOLERANCE` is disabled by default because in vertical cuts the widths vary and the heights do not. It is for one very specific case: filtering out posts whose heights match by chance with wildly different widths (a 400px panel next to a 3000px banner). A generous value like `0.5` drops those oddities without touching real cuts, but a strict one like `0.05` breaks the detection.

### Cache and limits

| Variable | Default | What it does |
|---|---|---|
| `CACHE_DIR` | `./cache` | Directory of the composed images |
| `CACHE_MAX_BYTES` | `536870912` | Total size before pruning (512 MB) |
| `CACHE_MAX_AGE_DAYS` | `30` | Age before pruning |
| `RATE_LIMIT_MAX` | `60` | Requests per IP and window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window of the limit |

Where these numbers come from:

- **60 requests per minute** is plenty for normal use, because each pasted link is two or three requests from the bot, and it slows down anyone who starts asking for variants of the same strip to fill the cache.
- **512 MB** is about 1,600 strips, at around 310 KB each.
- **30 days** is more than enough, because Discord keeps the image on its own CDN and almost never asks for it again. If a pruned strip is needed again, it is stitched again.

### Branding

| Variable | Default | What it does |
|---|---|---|
| `SITE_NAME` | `Bayeux` | Name shown in the footer of the embed |
| `THEME_COLOR` | `#1d1f23` | Accent colour of the embed |
| `BRAND_ICON` | `assets/icon.png` | Logo served at `/icon.png`. If the file is missing, it is not declared |
| `REPO_URL` | *(empty)* | Link to the code on the landing page |

---

## 🧩 How it works inside

```
bot ──> /:handle/status/:id
          ├─ api.fxtwitter.com   (metadata: URLs, width, height)
          ├─ decides the layout  (row / grid / single)
          └─ HTML with the meta tags and the link to the Mastodon document

bot ──> /strip/:id.webp?layout=row
          ├─ in the cache? served as is, without touching the API
          └─ if not: downloads the photos, stitches with sharp, stores and serves
```

Things that may not be obvious at first sight:

- **The dimensions are computed without downloading anything.** The API already returns the real width and height of each photo, so the HTML can declare the exact dimensions before the image exists. The same plan feeds the HTML and the composition, so they cannot drift apart.
- **The `og:image` has the layout fixed** (`?layout=row`). Thanks to that the cache key is known from the URL, and a hit is served without calling the API.
- **A single photo is not composed.** It links straight to `pbs.twimg.com` at the original resolution. Zero bandwidth and zero quality loss.
- **The gap between panels is transparent**, so it shows the colour of the chat instead of a black band in light theme. That is why the output is WebP, which keeps the alpha channel (the transparency) and also weighs half as much as JPEG.
- **Two simultaneous requests for the same post compose one image**, not two.
- **The cache size limit is checked on write**, not only in the periodic pruning. Since the key includes layout, format and gap, one post allows many variants, and between prunings nothing would stop it from growing.
- **Never a bare 500.** If the API fails or the post does not exist, I return an error HTML page with `200` and the original link intact, because in Discord a 4xx or a 5xx looks like a broken link with no explanation.

There is no database. The cache lives on disk and is pruned by size and age.

---

## 🧷 Userscript to copy links

`tools/bayeux.user.js` is a userscript (a small script that a manager like Tampermonkey runs on a specific website). It adds a button to every post on X, **in the action bar right after Share**, that copies the Bayeux link of that post. It works the same in the timeline and on the page of a single post.

You install it with [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/): open the file, the manager detects it by its `// ==UserScript==` header and offers to install it. The only things you can change are the two constants at the top:

```js
const HOST = 'bayeux.ultrak.dynu.net';   // your subdomain
const PARAMS = '';                       // e.g. '?layout=row' if you always want it
```

`HOST` comes set to my instance, so the script works as is. If you run your own Bayeux, put your host there.

The button **only appears where it is of use**: on posts with photos of their own and no video. A text-only post, or one that quotes another with drawings, does not show it, because there is no strip to stitch there.

### How it knows the post has photos

It looks at the `/status/<id>/photo/N` links, not at the `[data-testid="tweetPhoto"]` container. I measured the reason on a real page load: the links appear **at the same time** as the action bar, and the container takes 89ms longer. Waiting for it made the button show up late and, when it did, move the whole row, because X's counters are `flex: 1 1 0%` and shrink to make room for it. Checking that the id in the link is the id of the post also takes care of quotes, whose photos carry the id of the quoted post.

⚠️ **Note**: X rewrites its interface every so often. The script relies only on three things that have been stable for years: the `article` of each post, the `data-testid` of its buttons and the one of the photos. If the button ever stops appearing, most likely one of the three has changed.

### Size and position of the button

It does not set sizes of its own: **it measures the icon of a neighbouring button and matches it**, because X uses 18.75px in the timeline and 22.5px on the page of a post. And it stretches to the full height of the bar instead of having a fixed height, which is what put it 6px out of line.

Also, the button takes up the width of its icon and not that of the hover circle, which sticks out of the box on both sides. That is how X does it with Share and Bookmark.

About the position: X deliberately groups Bookmark and Share together at the end, because its four counters have `flex: 1 1 0%` and take up all the free space. One more button in the middle of that block looks odd wherever you put it.

That is why the script **spreads the whole bar evenly**, with a single rule:

```css
div[role="group"]:has(> .bayeux-btn) > * {
  flex: 0 1 auto !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}
```

It cancels the `flex-grow` of the counters and the margins of X and of other extensions, and lets `justify-content: space-between` do the spreading. I measured it: the gaps become identical (38.1px with seven icons, 47.6 with six) without changing the total width of the bar.

⚠️ **Note**: this does override X's styles, unlike the rest of the script. The `:has()` limits it to the bars where I have put a button, and since it is CSS there is nothing React can undo on a re-render. If you do not like it, `EQUIDISTANTE = false` at the top of the file goes back to respecting X's design and just copies the spacing of the other extensions.

### Narrow bars

Spreading only works if there is room to spare. In narrow columns, like the replies on the right of the photo viewer, the icons do not fit even touching each other, and spreading makes all the missing space come out of the counters, whose numbers end up overlapping. So if, after spreading, the children of a bar end up touching (with no gap between them), that bar is marked with `data-bayeux-apretada` and goes back to X's layout.

Even so they do not fit in the reply column of the viewer, which is 254px wide: with my button and the one from Media Harvest (another extension that adds its own) each counter is left with 38px, and a "1K" needs about 55. So in tight bars **the added buttons move into the Share menu**: the Bayeux one and those of other extensions that come after Share. When you open that menu they appear at the end as "Copiar enlace de Bayeux" (copy Bayeux link) and with the name of each extension, and choosing an extension's entry clicks its hidden button underneath. The bar stays exactly as X designed it. The entries are clones of X's own, so they follow its theme with no styles of their own.

If you open Share with the keyboard instead of the mouse or a finger, the menu comes up without those entries. I have not covered that yet.

---

## ⚠️ Limitations

No sugar-coating:

- **Discord scales the embed image into a box of about 400×300.** A strip of 4 vertical panels goes in there as a thin band; you can sense the continuity, but the real detail only shows when you click. This cannot be fixed from the service, it is how Discord draws it.
- **The strip takes up less height than a grid, and that is unavoidable.** Being wide, it uses up the 400px of width before the 300 of height and stays at about 200. A grid, being squarer, reaches 300. No image format or padding changes that, scaling is proportional.
- **The heuristic does not read the images**, only their dimensions.
- **4 photos at most**, which is X's limit anyway.
- **It depends on FxTwitter's public API.** If it goes down or changes, Bayeux goes down with it. There is no scraping of its own as a fallback.
- **GIFs also depend on FxEmbed's converter** (`gif.fxtwitter.com`). If it stops answering, the embed of a GIF is left without an image.
- **Videos are not stitched or re-encoded.** I declare X's original MP4 so the client plays it, with its poster thumbnail. There is no strip because there is nothing to stitch.
- **Protected or deleted posts** return the error embed, not the content.

---

## 🔒 Privacy

Bayeux has no accounts, cookies, analytics or ads, and no database either.

- **What it keeps on disk** are the already stitched strips of public posts, in the cache, and they are deleted on their own by size and age.
- **The logs** record each request (path, post id and the IP it comes from), never the text of the posts. With `pm2-logrotate` set up as above they stay at seven files of 10 MB.
- **Outwards** it only talks to `api.fxtwitter.com`, to ask for the post data, and to `pbs.twimg.com`, to download the photos it stitches.
- **The userscript** asks for no permissions (`@grant none`) and does not connect to anything: it only writes the link to your clipboard when you press the button.

---

## 🧪 Development

```bash
npm run dev      # tsx in watch mode
npm test         # vitest, no network
npm run lint     # tsc --noEmit
npm run build    # compiles to dist/
```

The tests do not touch the network. The API responses are replaced by fixtures (fixed test data) with dimensions taken from real posts, and the test images are generated with sharp on the fly.

`npm run lint` is `tsc --noEmit` and not a style linter. In a strict-mode TypeScript project it catches more real problems, and it is quite a few dependencies fewer.

### Comparing compression settings

In `tools/comparar.html` there is a standalone page (you open it with a double click, it is not deployed) that draws the same strip with two sets of parameters side by side, with their weight and download time. I made it to choose the compression settings by looking at them instead of guessing.

---

## 🙏 Credits

- [FxEmbed](https://github.com/FxEmbed/FxEmbed) (MIT). Bayeux uses its public API `api.fxtwitter.com`, and the idea of stitching the images comes from its *mosaic* component. Without that project this would not exist.
- I generated the logo with **Recraft (V4.1 Vector)** and retouched it by hand.
- Node, Fastify, [sharp](https://github.com/lovell/sharp) and undici.

---

## 📄 License

MIT. You can read it in [LICENSE](LICENSE).

Bayeux is not affiliated with, associated with, authorised or endorsed by X Corp. The names "X" and "Twitter" and their trademarks belong to their respective owners.
