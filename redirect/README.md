# fire.casa redirect page

`index.html` is the page that stays behind at the **old** origin,
`fire.casa/perplexions/`, after the game moves to `perplexions.io`.

What it does, on load:

1. Reads this origin's `localStorage` (all `perplexions-*` keys).
2. Packs it into a `transfer` URL param using an inline copy of
   `encodeTransfer()` from `src/transfer.ts`.
3. Redirects to `https://perplexions.io/`, preserving any existing query params
   (e.g. `?date=…`) and hash. The game is a single page + query params, so it
   always lands on the root. The game on the new origin unpacks and merges the
   `transfer` param into its own `localStorage`.

## Deploying

This file is **not** part of the perplexions.io Vite build — it lives here in the
repo for source control but ships to the *old* host separately. Deploy it so it
answers at `fire.casa/perplexions/` (same origin as the old game, so it can read
the old `localStorage`).

## Keeping in sync

The inline encoder must match `encodeTransfer()` in `src/transfer.ts`. If you
change the transfer format there, mirror it here. `src/transfer.test.ts`
round-trips the canonical encoder/decoder and will catch format regressions on
that side.

## Testing without redirecting

Append `?no-redirect` to the URL to see the target URL (with the packed
`transfer` payload) printed on the page instead of navigating.
