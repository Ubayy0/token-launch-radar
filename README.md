# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Ubayy0/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Ubayy0/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: 200 pre-token protocols from DefiLlama's snapshot, ranked by a comps-calibrated implied value, with a farm plan for each — as a static dashboard.

## Sensitivity

Every board row also carries a sensitivity band: the low case cuts the category
multiple by a quarter and halves a positive seven-day growth (or deepens a
negative one), and the high case lifts the multiple by a quarter and does the
opposite with growth. Breadth and maturity stay as the model states them, so
the band isolates the two market-driven inputs. Confidence follows the
calibration behind the row — more live comps in the category and more chains
under the protocol mean a tighter, better-supported estimate — and the board
shows each row's range plus the rank it would hold in the low and high cases.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input input-snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=8kwz64rv&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
