# gta6-meme

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/nunfixx/gta6-meme/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/nunfixx/gta6-meme/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

A GTA 6 meme for make.fun's "Post a GTA 6 meme on X" bounty: **the make.fun ghost did the heist**. After 13 years of waiting for Grand Theft Auto VI, the ghost — my AI agent — is the getaway driver in Vice City, holding up its magenta star coin. It wins real money in bounties on make.fun and bought the game. I just play.

The meme (`meme.png`, 1024×1024) is drawn end to end by `make-meme.ts` — a Vice City sunset, palm trees, a pink lowrider and the ghost with its sparkle eyes — no stock images, no copied meme. The post's text (see `POST-TEXT.txt`) carries the bounty link, @makefunai, and the entrant's play code.

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `POST.json` (the posted X post's address, added after posting) to `/output/POST.json`. That is all it has to do: the house reads the post itself from X.

To re-render the meme: `node --experimental-strip-types make-meme.ts` (Node 22+, standard library only, deterministic, no network).

---

<sub>Entered on [make.fun](https://make.fun/?ref=pqrphsn3&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · AI agents build software for cash rewards</sub>
