Current Handicaps & Tags PB logic:
- The PB value shown in the table comes directly from `hcp.csv` column E (`row[4]`) inside `getHandicaps()`.
- That means the table can know about older rounds that do not exist on the weekly-results page or on-site course-record pages.
- The modal PB logic should therefore use that table/hcp source first, then let Singles Course Records override it only when the course-record source has a lower score.

Apply the patch below to `src/lib/data.ts`.

--- PATCH START ---

1) In `type PlayerProfile`, add `personalBests`:

```ts
type PlayerProfile = {
  name: string;
  key: string;
  handicap: string;
  handicapEstablished: boolean;
  average: string;
  allRounds: { date: string; score: number }[];
  recentRounds: ({ date: string; score: number } & { dropped?: boolean })[];
  personalBest: PersonalBestRow | null;
  personalBests: PersonalBestRow[];
  weeklyWins: PlayerWinRow[];
  aces: PlayerAceRow[];
};
```

2) In `getHandicaps()`, add `bestRawScore` to the returned row object:

Find:

```ts
      return {
        name: row[0] || "",
        hcp: handicapValue,
        tag: row[2] || "",
        rounds: row[3] || "",
        best: row[4] || "",
        allRounds: roundHistory,
```

Replace with:

```ts
      return {
        name: row[0] || "",
        hcp: handicapValue,
        tag: row[2] || "",
        rounds: row[3] || "",
        best: row[4] || "",
        bestRawScore: extractFirstNumber(row[4] || ""),
        allRounds: roundHistory,
```

3) In `ensurePlayerProfile()`, add `personalBests: []`:

Find:

```ts
    map.set(key, {
      name: displayName,
      key,
      handicap: "",
      handicapEstablished: false,
      average: "",
      allRounds: [],
      recentRounds: [],
      personalBest: null,
      weeklyWins: [],
      aces: [],
    });
```

Replace with:

```ts
    map.set(key, {
      name: displayName,
      key,
      handicap: "",
      handicapEstablished: false,
      average: "",
      allRounds: [],
      recentRounds: [],
      personalBest: null,
      personalBests: [],
      weeklyWins: [],
      aces: [],
    });
```

4) Replace `setPersonalBest()` with this `addPersonalBest()` function:

```ts
function addPersonalBest(
  profile: PlayerProfile,
  candidate: PersonalBestRow
) {
  const currentBestScore =
    profile.personalBests.length > 0 ? profile.personalBests[0].rawScore : Infinity;

  if (candidate.rawScore < currentBestScore) {
    profile.personalBests = [candidate];
  } else if (candidate.rawScore > currentBestScore) {
    return;
  } else {
    const existingIndex = profile.personalBests.findIndex(
      (row) =>
        row.rawScore === candidate.rawScore &&
        normalizeDateKey(row.date) === normalizeDateKey(candidate.date)
    );

    if (existingIndex === -1) {
      profile.personalBests.push(candidate);
    } else if (!profile.personalBests[existingIndex].href && candidate.href) {
      profile.personalBests[existingIndex] = candidate;
    }
  }

  sortByDateDesc(profile.personalBests);
  profile.personalBest = profile.personalBests[0] || null;
}
```

5) In the first `for (const row of getHandicaps())` loop inside `getPlayerProfiles()`, add PB dates from `hcp.csv`:

Find this block:

```ts
  for (const row of getHandicaps()) {
    const profile = ensurePlayerProfile(profiles, row.name);
    if (!profile) continue;

    profile.handicap = String(row.hcp || "");
    profile.handicapEstablished = Boolean(row.handicapEstablished);
    profile.average = String(row.recentRoundsAverage || "");
    profile.allRounds = Array.isArray(row.allRounds) ? row.allRounds : [];
    profile.recentRounds = Array.isArray(row.recentRounds) ? row.recentRounds : [];
  }
```

Replace with:

```ts
  for (const row of getHandicaps()) {
    const profile = ensurePlayerProfile(profiles, row.name);
    if (!profile) continue;

    profile.handicap = String(row.hcp || "");
    profile.handicapEstablished = Boolean(row.handicapEstablished);
    profile.average = String(row.recentRoundsAverage || "");
    profile.allRounds = Array.isArray(row.allRounds) ? row.allRounds : [];
    profile.recentRounds = Array.isArray(row.recentRounds) ? row.recentRounds : [];

    if (row.bestRawScore != null) {
      const matchingDates = profile.allRounds
        .filter((round) => Number(round.score) === row.bestRawScore)
        .map((round) => toFullYearUsDate(round.date));

      matchingDates.forEach((date) => {
        addPersonalBest(profile, {
          score: formatCourseRecordScore(row.bestRawScore, SINGLES_PAR),
          rawScore: row.bestRawScore,
          date,
          href: getWeeklyResultsHrefForDate(date) || "",
          roundType: "handicap",
        });
      });
    }
  }
```

6) Replace both calls to `setPersonalBest(...)` in `getPlayerProfiles()` with `addPersonalBest(...)`.

7) Still inside `getPlayerProfiles()`, after the weekly-results loop, add Singles Course Records as the authoritative override/fill source:

```ts
  for (const row of getSinglesRecords()) {
    const profile = ensurePlayerProfile(profiles, row.name);
    const rawScore = parseCourseRecordRawScore(row.score, SINGLES_PAR);

    if (!profile || rawScore == null) continue;

    addPersonalBest(profile, {
      score: row.score,
      rawScore,
      date: row.date,
      href: row.resultsHref || row.url || "",
      roundType: "handicap",
    });
  }
```

8) In the final profile cleanup loop, add sorting for `personalBests` and keep `personalBest` synced:

Find:

```ts
  for (const profile of profiles.values()) {
    sortByDateDesc(profile.weeklyWins);
    sortByDateDesc(profile.aces);
  }
```

Replace with:

```ts
  for (const profile of profiles.values()) {
    sortByDateDesc(profile.personalBests);
    profile.personalBest = profile.personalBests[0] || null;
    sortByDateDesc(profile.weeklyWins);
    sortByDateDesc(profile.aces);
  }
```

--- PATCH END ---
