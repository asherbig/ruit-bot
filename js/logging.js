const fs = require('fs');

module.exports = {
    
    logScore: function (game, newGame) {

        function updatePlayers (players) {

            const w1 = players.w1;
            const w2 = players.w2;
            const l1 = players.l1;
            const l2 = players.l2;
    
            let notifications = [];
            let playersFile = JSON.parse(fs.readFileSync('json/players.json'));
    
            //deal with the edge case that it's a new player
            //winner 1
            if (playersFile[w1]) {
                playersFile[w1].played++;
                playersFile[w1].won++;
                if (playersFile[w1].streak === 'losing') {
                    //they broke a losing streak
                    notifications.push({
                        type: 'streak break',
                        subtype: 'losing',
                        user: w1,
                        teammate: w2,
                        opponents: [l1,l2],
                        slength: playersFile[w1].streak_length
                    });
                    playersFile[w1].streak = 'winning';
                    playersFile[w1].streak_length = 1;
                } else {
                    //they were already on a winning streak
                    playersFile[w1].streak_length++;
                    notifications.push({
                        type: 'streak continue',
                        subtype: 'winning',
                        user: w1,
                        teammate: w2,
                        opponents: [l1,l2],
                        slength: playersFile[w1].streak_length
                    });
                }
            } else {
                playersFile[w1] = {
                    'played': 1,
                    'won': 1,
                    'lost': 0,
                    'streak': 'winning',
                    'streak_length': 1
                };
            }
            //winner 2
            if (playersFile[w2]) {
                playersFile[w2].played++;
                playersFile[w2].won++;
                if (playersFile[w2].streak === 'losing') {
                    //they broke a losing streak
                    notifications.push({
                        type: 'streak break',
                        subtype: 'losing',
                        user: w2,
                        teammate: w1,
                        opponents: [l1,l2],
                        slength: playersFile[w2].streak_length
                    });
                    playersFile[w2].streak = 'winning';
                    playersFile[w2].streak_length = 1;
                } else {
                    //they were already on a winning streak
                    playersFile[w2].streak_length++;
                    notifications.push({
                        type: 'streak continue',
                        subtype: 'winning',
                        user: w2,
                        teammate: w1,
                        opponents: [l1,l2],
                        slength: playersFile[w2].streak_length
                    });
                }
            } else {
                playersFile[w2] = {
                    'played': 1,
                    'won': 1,
                    'lost': 0,
                    'streak': 'winning',
                    'streak_length': 1
                };
            }
            //loser 1
            if (playersFile[l1]) {
                playersFile[l1].played++;
                playersFile[l1].lost++;
                if (playersFile[l1].streak === 'winning') {
                    //they lost a winning streak
                    notifications.push({
                        type: 'streak break',
                        subtype: 'winning',
                        user: l1,
                        teammate: l2,
                        opponents: [w1,w2],
                        slength: playersFile[l1].streak_length
                    });
                    playersFile[l1].streak = 'losing';
                    playersFile[l1].streak_length = 1;
                } else {
                    //they were already on a losing streak
                    playersFile[l1].streak_length++;
                    notifications.push({
                        type: 'streak continue',
                        subtype: 'losing',
                        user: l1,
                        teammate: l2,
                        opponents: [w1,w2],
                        slength: playersFile[l1].streak_length
                    });
                }
            } else {
                playersFile[l1] = {
                    'played': 1,
                    'won': 0,
                    'lost': 1,
                    'streak': 'losing',
                    'streak_length': 1
                };
            }
            //loser 2
            if (playersFile[l2]) {
                playersFile[l2].played++;
                playersFile[l2].lost++;
                if (playersFile[l2].streak === 'winning') {
                    //they lost a winning streak
                    notifications.push({
                        type: 'streak break',
                        subtype: 'winning',
                        user: l2,
                        teammate: l1,
                        opponents: [w1,w2],
                        slength: playersFile[l2].streak_length
                    });
                    playersFile[l2].streak = 'losing';
                    playersFile[l2].streak_length = 1;
                } else {
                    //they were already on a losing streak
                    playersFile[l2].streak_length++;
                    notifications.push({
                        type: 'streak continue',
                        subtype: 'losing',
                        user: l2,
                        teammate: l1,
                        opponents: [w1,w2],
                        slength: playersFile[l2].streak_length
                    });
                }
            } else {
                playersFile[l2] = {
                    'played': 1,
                    'won': 0,
                    'lost': 1,
                    'streak': 'losing',
                    'streak_length': 1
                };
            }
    
            fs.writeFileSync('json/players.json', JSON.stringify(playersFile));
            return notifications;

        }

        // Read, push, write
        if (newGame === true) {
            let records = JSON.parse(fs.readFileSync('json/records.json'));
            records.push(game);
            fs.writeFileSync('json/records.json', JSON.stringify(records));
        }

        let players = {
            'w1': game.winners[0],
            'w2': game.winners[1],
            'l1': game.losers[0],
            'l2': game.losers[1]
        };

        //updatePlayers returns a list of potential notifications
        return updatePlayers(players);

    },

    deny: function (denyObj) {

        // Read, iterate, delete, write
        let records = JSON.parse(fs.readFileSync('json/records.json'));
        let result = 'error';
        let timestamp = denyObj.timestamp;
        let denier = denyObj.denier;
        console.log('TIMESTAMP IN DENY FUNCTION', timestamp);
        for (index in records) {
            if (timestamp === records[index].timestamp) {
                let game = records[index];
                //update the stats in the players.json file too

                //if the game hasn't been denied by anyone else yet
                if (game.denies === 0) {
                    records[index].denies++;
                    result = 'denied';
                    records[index].deniers.push(denier);
                    fs.writeFileSync('json/records.json', JSON.stringify(records));
                //the game has been denied by 1 other person, 'delete' the game
                } else if (game.denies === 1) {
                    if (game.deniers[0] === denier) {
                        result = 'duplicate';
                        return result;
                    }

                    records[index].deniers.push(denier);
                    records[index].denies++;
                    result = 'deleted';
                    let w1 = game.winners[0];
                    let w2 = game.winners[1];
                    let l1 = game.losers[0];
                    let l2 = game.losers[1];

                    //actually deletes the game
                    records.splice(index, 1);

                    fs.writeFileSync('json/records.json', JSON.stringify(records));

                    let playersFile = JSON.parse(fs.readFileSync('json/players.json'));

                    playersFile[w1].played--;
                    playersFile[w1].won--;
                    playersFile[w2].played--;
                    playersFile[w2].won--;
                    playersFile[l1].played--;
                    playersFile[l1].lost--;
                    playersFile[l2].played--;
                    playersFile[l2].lost--;

                    fs.writeFileSync('json/players.json', JSON.stringify(playersFile));
                //game is denied by a third person (max # of people who can deny)
                } else if (game.denies === 2) {
                    result = 'error'
                }
            }
        }
        return result;

    }
};