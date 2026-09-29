#!/usr/bin/env python3
"""Build data/drafts.json from the public Basketball-Reference datasets.

Source: https://github.com/sumitrodatta/bball-reference-datasets
Run:  python3 tools/build_drafts.py            (downloads the CSVs)
      python3 tools/build_drafts.py DIR        (uses CSVs already in DIR)
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request
from datetime import date

BASE = "https://raw.githubusercontent.com/sumitrodatta/bball-reference-datasets/master/Data/"
FILES = {
    "draft": "Draft Pick History.csv",
    "totals": "Player Totals.csv",
    "career": "Player Career Info.csv",
}
FIRST_YEAR = 1980
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "drafts.json")


def load(name, local_dir):
    if local_dir:
        path = os.path.join(local_dir, FILES[name])
        with open(path, encoding="utf-8") as f:
            return list(csv.DictReader(f))
    url = BASE + urllib.request.quote(FILES[name])
    with urllib.request.urlopen(url) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))


def na(v):
    return None if v in (None, "", "NA") else v


def main():
    local_dir = sys.argv[1] if len(sys.argv) > 1 else None
    draft = load("draft", local_dir)
    totals = load("totals", local_dir)
    career = {r["player_id"]: r for r in load("career", local_dir)}

    # NBA games / seasons per player (skip the multi-team summary rows).
    games, first, last = {}, {}, {}
    for r in totals:
        if r["lg"] != "NBA" or r["team"] == "TOT" or re.fullmatch(r"\dTM", r["team"] or ""):
            continue
        pid, season = r["player_id"], int(r["season"])
        games[pid] = games.get(pid, 0) + int(float(r["g"] or 0))
        first[pid] = min(first.get(pid, season), season)
        last[pid] = max(last.get(pid, season), season)

    drafts = {}
    for r in draft:
        if r["lg"] != "NBA" or int(r["season"]) < FIRST_YEAR:
            continue
        year = int(r["season"])
        pid = na(r["player_id"])
        info = career.get(pid, {}) if pid else {}
        drafts.setdefault(year, []).append([
            int(r["overall_pick"]) if na(r["overall_pick"]) else None,
            int(r["round"]) if na(r["round"]) else None,
            na(r["tm"]),
            r["player"],
            pid,
            na(r["college"]),
            games.get(pid, 0),
            first.get(pid),   # first NBA season (end year, e.g. 1999 = 1998/99)
            last.get(pid),
            na(info.get("pos")),
            na(info.get("birth_date")),
        ])

    for year in drafts:
        drafts[year].sort(key=lambda p: (p[0] is None, p[0] or 0))

    out = {
        "generated": date.today().isoformat(),
        "source": "Basketball-Reference via github.com/sumitrodatta/bball-reference-datasets",
        "fields": ["pick", "round", "team", "name", "bbrefId", "college",
                   "nbaGames", "nbaFrom", "nbaTo", "pos", "born"],
        "drafts": {str(y): drafts[y] for y in sorted(drafts)},
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    total = sum(len(v) for v in drafts.values())
    print(f"wrote {OUT}: {len(drafts)} drafts, {total} picks")


if __name__ == "__main__":
    main()
