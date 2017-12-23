# pingpong-bot

### A slack bot written using [Botkit](https://www.botkit.ai/) in Node.js to track ping-pong wins and losses and generate rankings. Now we'll know *objectively* that I'm the best.

I'm decent at ping-pong, but I'm not the best. But exactly *how* decent am I? After checking out other prebuilt bots for slack, [@asherbig](https://github.com/asherbig) and I decided that we could build a better (read: free-er) one to track stats and generate rankings. Pongbot, as affectionately refer to it, tracks every match in a JSON file and maintains a list of active players and their ELO.

##### Table of Contents

* [Interacting with Pongbot](#interacting-with-pongbot)
* [Player and Game Tracking](#player-and-game-tracking)
* [ELO Calculation](#elo-calculation)

### Interacting with Pongbot

Currently, Pongbot has three commands: `beat`, `scores`, and `help`. The main functionality of the bot is in `beat`; that's how we track games. We take into account our set of house rules in score calculation:

1. Games are to 21
2. 7-0 and 11-1 are skunks, meaning the game is over and the loser is humiliated
3. You have to win by two points, so 21-20 isn't a win but 22-20 is.

This translates to a very straightforward `if/else` block:

```node
// Determine the winning score
function getWinningScore(score) {

    let ret = 21;
    if (score == 0) {
        ret = 7;
    } else if (score == 1) {
        ret = 11;
    } else if (score > 19) {
        ret = score + 2;
    }

    return ret;

}
```

Because we have set logic about victory scores, you only have to tell pongbot the loser's score -- in fact, it'll only accept messages formatted as `beat @loser \[loser's score\]`. Once Pongbot records a game, it records the game and important information and adds it to our records.

### Player and Game Tracking

Since our principal use for Pongbot is within Alpha Iota Delta of Chi Psi, we don't need a very advanced storage solution, so we just write our data to a couple JSON files.

`records.json` is a simple logbook of every game tracked by Pongbot. After every game, a `scoreObj` object is created and added to `records.json`, which is really just a glorified array:

```node
// Create score object to log
let scoreObj = {
    'winner': user,
    'loser': loser.slice(2,loser.length - 1),  // Formatting
    'win-score': winScore,
    'lose-score': loseScore,
    'timestamp': new Date().getTime()
};

// Log scores
logging.logScore(scoreObj);
```

`players.json` is also a very simple JSON file, it tracks players by their slack user ID and assigns them each an ELO by a similar process.

### ELO Calculation

ELO calculation is the most finicky part of this whole project, and will be tuned and refined as people continue to whine that they're losing too many points on a loss or their opponent won too many.

At the moment, our ELO calculations boil down to a linear equation taking into account the ELO of the victor, the ELO of the loser, and their point differential. Those factors are all read in, normalized, and weighted, and then we do our math.

Normalizing the difference in ELO between players is easy; ELO is designed to be on a roughly 0-100 scale (but there's no reason a player's ELO couldn't go above 100 if they were really good or below 0 if they were really bad), so the calculation is `(Winner's ELO - Loser's ELO) / 10`. This results in a value between 0 and 10, which will be negative if there was an upset (the winner had lower ELO).

Normalizing the difference in score is a little more complicated. First, we check to see if the loser got skunked, in which case we assign a Score Difference Factor of 10, the highest it can go. If the loser scored more than 1 point, the score difference factor is `10 * (1 - (Loser's Score / Winner's Score))`. This results in a value that approaches 10 as the winner's score gets much higher than the loser's score, and approaches 0 as the loser's score approaches the winner's score.

Once we have our ELO and Score Difference Factors calculated, we can plug them into our equation. Here's a truncated preview of the full function:

```node
// Get current ELOs for winner and loser
let wElo = fetchElo(winner);
let lElo = fetchElo(loser);

// Adding negative eloDiffFactor means that for upsets, it's a positive value
const wEloDelta = scoreDiffFactor * scoreConst - eloDiffFactor * eloConst; 
const lEloDelta = eloDiffFactor * eloConst - scoreDiffFactor * scoreConst;

// You should never lose ELO on a win
wElo += (wEloDelta < 0) ? 0 : wEloDelta;
lElo += lEloDelta;
```
