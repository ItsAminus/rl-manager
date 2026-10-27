# Personal player-information corrections

Load a Manager Career, open a player's profile, and find **Player information**.

- **Edit player information** changes real name, age and nationality in that career.
- **Import player information from JSON** accepts an edited `data/players.json`,
  a JSON array of corrections, a `{ "players": [...] }` object, or one player object.
- Review the current and imported values, then choose **Apply player updates**.
  Selecting a file does not apply it automatically.

Example:

```json
[
  { "id": "player_1", "realName": "Correct Name", "age": 20, "nationality": "FR" },
  { "gamertag": "AnotherPlayer", "realName": "Another Name" }
]
```

Use the existing player ID when possible. Without an ID, a gamertag must identify
exactly one player. Missing or ambiguous players are skipped and listed. Duplicate
records and invalid field values are rejected before applying anything.

Nationality uses two-letter country codes. Age is a whole number from 1 to 120 at
the current career date. Omitted fields remain unchanged. `null` or an empty field
marks that information unknown. Imported `birthDate` values are not converted to age.

Only real name, age and nationality are changed. Imported ratings, attributes,
team assignments, contracts and other fields are ignored. Other careers, the
starting database and GitHub files are unaffected. No restart is required.

Before each operation that changes data, RLM automatically saves a complete
backup of that career database in
`%APPDATA%\rl-manager\database\careers\identity-backups`.
Editing is unavailable during the tutorial or an active played series. Imports
expire after 15 minutes and cannot be applied in a different career.
