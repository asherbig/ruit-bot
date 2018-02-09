# Ruit-Bot

### A slack bot written using [Botkit](https://www.botkit.ai/) in Node.js to track beirut wins and losses and analyze the data to come up with various stat lists.

Beirut is a game played between two teams of two. The idea of ruit-bot is to stop relying on rumor and eye-witness accounts to know how good everyone is at this game, so I created Ruit-Bot. Ruit-Bot is based on another slack bot project meant to track ping pong games and calculate ELO based on the matches that had been recorded (Pong-Bot).

##### Table of Contents

* [Interacting with Pongbot](#interacting-with-pongbot)
* [Player and Game Tracking](#player-and-game-tracking)
* [Command Syntaxes](#command-syntax)

### Interacting with Ruit-Bot

Commands: `beat`, `guests`, `add`, `list`, `scores`, and `help`. The most important command is `beat`; that's how games are logged. We take into account our set of house rules in score calculation:

1. Games end when one team makes all their cups (so you log the number of cups left to make by the losing team)
2. If a team loses with 10 cups left then that's a skunk

So, games are logged with the command `beat` with the correct syntax, and then the bot logs the game and updates various stats, keeping track of total games played, current streaks, and wins and losses for each player.

### Player and Game Tracking

Since our principal use for Pongbot is within Alpha Iota Delta of Chi Psi, we don't need a very advanced storage solution, so we just write our data to a couple JSON files.

`records.json` is a simple logbook of every game tracked by Ruit-Bot. After every game, a game object is created and added to `records.json`, which is really just a glorified array:

```node
// Create game object to log
let game = {
            'winners': [w1, w2],
            'losers': [l1, l2],
            'cups': cups,
            'logger': user,
            'denies': 0,
            'deniers': [],
            'timestamp': ts
};
```

`players.json` is also a very simple JSON file, it tracks players by their slack user ID (or unique text identifier) and keeps an up-to-date stat line for each player.

### Command Syntaxes

All commands are done through direct messages with Ruit-Bot in order to reduce spam in our public channels
For any command with a guest instead of a slack user, just type their name without the "@"

To record a game:
`@Winner1 @Winner2 beat @Loser1 @Loser2 [cups won by]`

To record a game with someone not in the slack:
`@SlackUser Guest beat Guest Guest [cups won by]`

To see all the added guests:
`Guests` or `Guest`

To register a person who isn't in the slack or the current guest list:
`Add [Name]`

To check leaderboards:
Type some variant of `scores` or `leaderboards`

List all games played by everyone:
`List all`

List all games played by a user:
`List @User`

List all games played by a certain team:
`List @User1 @User2`

List all games where two specific people play against each other:
`List @User1 vs @User2`
   