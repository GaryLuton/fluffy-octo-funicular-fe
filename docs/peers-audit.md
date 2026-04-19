# Peers / Flovee data-flow audit

Scope: map how the post author, the friends list, and the
`friends.html?flovee=1` deep link relate to each other, so the next PR can
collapse everything onto a single canonical `peers` object keyed by slug.

## 1. Two unrelated "flovee" namespaces exist today

There are two parallel concepts that both get called "flovee" in the code:

| Concept | Data source | What it is | Slug space |
|---|---|---|---|
| **AI bestie** (appears as a post author, chat contact, About panel) | `FLOVEE_DATA` | Characters: Lumi, Delara, Vesper, Zola, Miro, Seraph, Remi, Nox | `lumi`, `vesper`, … |
| **Reply-suggestion ghostwriter** (appears as "X suggests" inside a regular contact chat) | `FLOVEE_NAMES` | Names: Luna, Rosie, Nora, Coco, Raven, Lyra, … | keyed by *aesthetic*, no slug |

`FLOVEE_DATA` is defined in **two places** with slightly different shapes:
- `public/lifestyle.html:6591-6600` — adds `color`, `darkColor`, `gradient`
- `public/friends.html:309-318` — name/emoji/vibe/aesthetic only

`FLOVEE_NAMES` is defined in **three places** (same values):
- `public/friends.html:301`
- `public/catalog.html:228`
- `public/activities.html:380` (as `FLOVEE_MAP`, partly)
- mirrored by `public/stuflover-tour.js:27`

The aesthetic → bestie-slug mapping (`FLOVEE_AE_MAP`) is **also duplicated**:
- `public/friends.html:319`
- `public/lifestyle.html:6607` (inline inside `getUserFloveeId`)

## 2. Where the post author is defined

The Flovee post card on the home feed is rendered by `loadFloveePost()` in
`public/lifestyle.html:6612`. The author identity comes from the backend
response `data.post.flovee_id` (e.g. `"vesper"`), used at
`lifestyle.html:6628` to look up the character in `FLOVEE_DATA`. The card
renders the name at line 6659 and the "reply to <name>" button at line 6686.

## 3. Where the friends list is defined

- **AI besties**: `public/friends.html:309-318` — `FLOVEE_DATA`. Slugs present:
  `lumi, delara, vesper, zola, miro, seraph, remi, nox`. **Vesper is present.**
- **Local contacts**: `public/friends.html:338` — loaded from
  `localStorage['stuflover_contacts']`, added via the UI; not hardcoded.
- **Remote friends**: `public/friends.html:351` — loaded from `/api/friends`.

## 4. How `friends.html?flovee=1` picks a peer (the bug)

`handleUrlParams()` at `public/friends.html:1337-1363` reads `?flovee=1` and
calls `openChat(FLOVEE_CONTACT_ID)` at line 1356. The critical point: the
`FLOVEE_CONTACT_ID` it opens is **not** derived from the URL — it is computed
once at page load from the user's own aesthetic profile:

```
friends.html:330  const floveeId = FLOVEE_AE_MAP[topAe] || 'remi';
friends.html:332  const FLOVEE_CONTACT_ID = 'flovee:' + floveeId;
```

So a user whose top aesthetic maps to `lumi` will always land on Lumi, even
after clicking "reply to Vesper" on the home feed. This is the Vesper/Lumi
mismatch.

The reply flow:

```
lifestyle.html:6797 replyToFlovee()
  → stores post payload in localStorage['stuflover_flovee_reply']
  → window.location.href = 'flovee.html'
flovee.html:19-27 meta-refresh + JS redirect
  → /friends.html?flovee=1       ← only "on/off", no peer slug
friends.html:1355-1356
  → openChat(FLOVEE_CONTACT_ID)  ← picks peer from user profile, not URL
```

Nothing on this path carries the `flovee_id` from the post.

## 5. The "Luna" string in the profile panel

`floveeName` at `friends.html:303` resolves `FLOVEE_NAMES[topAe] || 'Flo'`. For
the `kawaii` aesthetic it becomes `"Luna"`. It is rendered as
`${floveeName} suggests` at `friends.html:767` inside the regular-contact
reply-suggestion bubble — i.e. it is the ghostwriter label, not the bestie
name. For a kawaii user chatting with Vesper, the right-hand About panel
header says **"About Vesper"** (good, uses `floveeChar.name` at
`friends.html:736`) but the in-chat suggestion bubble says
**"Luna suggests …"** (bad — unrelated character).

## 6. `flovee.html` is a redirect shim

`public/flovee.html` is 30 lines. Meta-refresh + JS redirect to
`/friends.html?flovee=1`, preserving any existing query params
(`flovee.html:8,19-27`). It is the last remaining place that could carry a
`peer=…` slug through to friends.html without an extra hop.

## 7. Proposed canonical `peers` object (for PR A)

Source of truth should live in one module (e.g. `public/stuflover-peers.js`)
and be imported by `lifestyle.html`, `friends.html`, `activities.html`,
`catalog.html`, `stuflover-tour.js`:

```js
// one record per bestie, keyed by URL slug
export const PEERS = {
  lumi:   { slug:'lumi',   name:'Lumi',   emoji:'✨', vibe:'wellness queen',     aesthetic:'clean girl',    color:'#a8d8ea', darkColor:'#2a4a5a', gradient:'linear-gradient(135deg,#a8d8ea,#dceef5)' },
  delara: { slug:'delara', name:'Delara', emoji:'📖', vibe:'book girly',         aesthetic:'dark academia', color:'#8b7355', darkColor:'#3d2f1e', gradient:'linear-gradient(135deg,#8b7355,#c4a882)' },
  vesper: { slug:'vesper', name:'Vesper', emoji:'🎀', vibe:'coquette princess',  aesthetic:'coquette',      color:'#f4a0b0', darkColor:'#5a2030', gradient:'linear-gradient(135deg,#f4a0b0,#fcd4dc)' },
  zola:   { slug:'zola',   name:'Zola',   emoji:'💀', vibe:'chaos queen',        aesthetic:'y2k',           color:'#ff8a65', darkColor:'#4a2010', gradient:'linear-gradient(135deg,#ff8a65,#ffccbc)' },
  miro:   { slug:'miro',   name:'Miro',   emoji:'🎧', vibe:'indie girly',        aesthetic:'indie',         color:'#a5d6a7', darkColor:'#1b3a1d', gradient:'linear-gradient(135deg,#a5d6a7,#c8e6c9)' },
  seraph: { slug:'seraph', name:'Seraph', emoji:'🌙', vibe:'moon girl',          aesthetic:'spiritual',     color:'#ce93d8', darkColor:'#3a1a42', gradient:'linear-gradient(135deg,#ce93d8,#e1bee7)' },
  remi:   { slug:'remi',   name:'Remi',   emoji:'🌅', vibe:'main character',     aesthetic:'softgirl',      color:'#ffcc80', darkColor:'#4a3010', gradient:'linear-gradient(135deg,#ffcc80,#ffe0b2)' },
  nox:    { slug:'nox',    name:'Nox',    emoji:'🖤', vibe:'deadpan icon',       aesthetic:'goth',          color:'#90a4ae', darkColor:'#263238', gradient:'linear-gradient(135deg,#78909c,#b0bec5)' },
};

// aesthetic → default peer slug (dedupe of FLOVEE_AE_MAP)
export const AESTHETIC_TO_PEER = {
  kawaii:'lumi', softgirl:'vesper', cleangirl:'lumi', coquette:'vesper',
  goth:'nox', darkacad:'delara', grunge:'nox', y2k:'zola',
  street:'miro', cottage:'seraph', hippie:'seraph', oldmoney:'delara',
  preppy:'lumi', tomato:'vesper', indie:'miro', emo:'nox',
};

export function peerFromUrl(search = location.search, fallbackAesthetic){
  const p = new URLSearchParams(search);
  const explicit = p.get('peer') || p.get('flovee');   // flovee=1 stays a noop
  if (explicit && explicit !== '1' && PEERS[explicit]) return PEERS[explicit];
  return PEERS[AESTHETIC_TO_PEER[fallbackAesthetic] || 'remi'];
}
```

## 8. Changes PR A needs to make

1. Extract `PEERS` + `AESTHETIC_TO_PEER` into a shared module; delete the
   duplicates in `friends.html:309-319`, `lifestyle.html:6591-6607`,
   `catalog.html:228`, `activities.html:380`, `stuflover-tour.js:27`.
2. `replyToFlovee()` in `lifestyle.html:6797` must forward the post's
   `flovee_id` as a slug — e.g.
   `window.location.href = 'friends.html?peer=' + encodeURIComponent(wrap._replyData.floveeId)`.
   (Skip the `flovee.html` hop; leave the shim as a legacy redirect.)
3. `friends.html` must read `peer` from the URL (via `peerFromUrl()` above)
   and use it to drive:
   - `FLOVEE_CONTACT_ID` (replace the fixed value at line 332),
   - the contact-list highlight in `renderContacts`,
   - the chat header name + avatar,
   - the About panel (`updateFloveeSidePanel`, line 732).
4. Replace the `${floveeName} suggests` label at `friends.html:767` with the
   canonical bestie name (`PEERS[currentSlug].name`) — kill the separate
   `FLOVEE_NAMES` namespace entirely. Delete Luna/Rosie/Coco/etc.
5. `FLOVEE_DATA` on the post card in `lifestyle.html:6591` is already keyed by
   the same slug — once (1) is done, this file just imports from the module.

## 9. Out of scope for this PR (tracked for later PRs)

- PR B (modal history + close affordances): steps 3 and 4 in the task list.
  Today `modal-overlay.open` in `index.html:121-122` uses pure CSS class
  toggling; there is no `history.pushState`, no `popstate` listener, and no
  Escape handling on the DTI modal. `startViewTransition` is not used, so
  step 7's try/catch is defensive-only.
- PR C (mobile + CTA contrast): boredom/feature cards in
  `index.html:70` use `--terracotta` with white text; the faded
  `opacity:0.3-0.5` CTAs at `index.html:397-401` fail contrast.
- PR D (games stats placeholders): em-dashes at
  `games.html:128-131`; values are set synchronously at lines 365-368 via
  `| 0`, so a missing key already coerces to `0` — the placeholder only
  shows during the fetch window.
