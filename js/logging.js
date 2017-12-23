const fs = require('fs');

module.exports = {
    calcEloDelta: function (winner, loser, winnerScore, loserScore) {

        // Function definition to fetch ELOs from database
        function fetchElo(userId){

            // Read the data and pull their ELO
            let playersObj = JSON.parse(fs.readFileSync('json/players.json'));
            if (playersObj[userId]) {
                return playersObj[userId].elo;
            } else {
                // If the user has no ELO, give them 50 as a baseline
                return 750;
            }
        }

        // Return k for each player
        function fetchK(userId){

            let playersObj = JSON.parse(fs.readFileSync('json/players.json'));
            if (!(playersObj[userId])){
                return 250;
            } else {
                let played = playersObj[userId].played;
                if(played < 10){
                    return 250;
                } else if(played < 20){
                    return 150;
                } else {
                    return 50;
                }
            }
        }

        let wElo = fetchElo(winner);
        let lElo = fetchElo(loser);

        // NEW ELO FORMULA HERE
        const qConstant = 1000;  // The magnitude of this number is proportional to magnitude of ELO.
        let qWinner = Math.pow(10, wElo / qConstant);
        let qLoser = Math.pow(10, lElo / qConstant);

        let winnerExpected = qWinner / (qWinner + qLoser);
        let loserExpected = qLoser / (qWinner + qLoser);

        let winnerActual = winnerScore / (winnerScore + loserScore);
        let loserActual = loserScore / (winnerScore + loserScore);

        let kWinner = fetchK(winner);
        let kLoser = fetchK(loser);

        let wEloDelta = kWinner * (winnerActual - winnerExpected);
        let lEloDelta = kLoser * (loserActual - loserExpected);

        // You should never lose ELO on a win
        wElo += (wEloDelta < 0) ? 0 : wEloDelta;
        lElo += lEloDelta;

        // Create an object to return to updateElos
        let playersObj = {};
        playersObj.winner = { 'id': winner, 'elo': wElo };
        playersObj.loser = { 'id': loser, 'elo': lElo };

        return playersObj;

    },

    logScore: function (scoreObj) {

        // Read, push, write
        let records = JSON.parse(fs.readFileSync('json/records.json'));
        records.push(scoreObj);
        fs.writeFileSync('json/records.json', JSON.stringify(records));
        return;

    },

    //returns notable notifications
    updateElos: function (playersObj) {

        const winner = playersObj.winner.id;
        const loser = playersObj.loser.id;
        let notifications = [];

        let playersFile = JSON.parse(fs.readFileSync('json/players.json'));

        //console.log('playersFile at winner before', playersFile[winner]);
        //console.log('playersFile at loser before', playersFile[loser]);
        //deal with the edge case that it's a new player
        if (playersFile[winner]) {
            playersFile[winner].elo = playersObj.winner.elo;
            playersFile[winner].played++;
            playersFile[winner].won++;
            if (playersFile[winner].streak === 'losing') {
                console.log('winner was on a losing streak');
                //they broke a losing streak
                notifications.push({
                    type: 'streak break',
                    user: winner,
                    length: playersFile[winner].streak_length,
                    message: '<@'+winner+'> just broke a '+playersFile[winner].streak_length+' game long losing streak!'
                });
                playersFile[winner].streak = 'winning';
                playersFile[winner].streak_length = 1;
            } else {
                console.log('winner extended win streak');
                //they were already on a winning streak
                playersFile[winner].streak_length++;
                notifications.push({
                    type: 'streak continue',
                    user: winner,
                    length: playersFile[winner].streak_length,
                    message: '<@'+winner+'> is on a '+playersFile[winner].streak_length+' game winning streak!'
                });
            }
        } else {
            console.log('creating new player with win streak');
            playersFile[winner] = {
                'elo': playersObj.winner.elo,
                'played': 1,
                'won': 1,
                'lost': 0,
                'streak': 'winning',
                'streak_length': 1
            };
        }
        if (playersFile[loser]) {
            playersFile[loser].elo = playersObj.loser.elo;
            playersFile[loser].played++;
            playersFile[loser].lost++;
            if (playersFile[loser].streak === 'winning') {
                console.log('loser lost a win streak');
                //they broke a winning streak
                notifications.push({
                    type: 'streak break',
                    user: loser,
                    length: playersFile[loser].streak_length,
                    message: '<@'+loser+'> just lost a '+playersFile[loser].streak_length+' game long winning streak!'
                });
                playersFile[loser].streak = 'losing';
                playersFile[loser].streak_length = 1;
            } else {
                console.log('loser extended a losing streak');
                //they were already on a losing streak
                playersFile[loser].streak_length++;
                notifications.push({
                    type: 'streak continue',
                    user: loser,
                    length: playersFile[loser].streak_length,
                    message: '<@'+loser+'> is on a '+playersFile[loser].streak_length+' game losing streak!'
                });
            }
        } else {
            console.log('creating new player with losing streak');
            playersFile[loser] = {
                'elo': playersObj.loser.elo,
                'played': 1,
                'won': 0,
                'lost': 1,
                'streak': 'losing',
                'streak_length': 1
            };
        }
        //console.log('playersFile at winner after', playersFile[winner]);
        //console.log('playersFile at loser after', playersFile[loser]);
        fs.writeFileSync('json/players.json', JSON.stringify(playersFile));
        return notifications;
    },

    deleteGame: function (timestamp) {

        // Read, iterate, delete, write
        let records = JSON.parse(fs.readFileSync('json/records.json'));
        for (index in records) {
            if (timestamp === records[index].timestamp) {
                let game = records[index];
                //update the stats in the players.json file too
                let winner = game.winner;
                let loser = game.loser;
                let playersFile = JSON.parse(fs.readFileSync('json/players.json'));

                playersFile[winner].played--;
                playersFile[winner].won--;
                playersFile[loser].played--;
                playersFile[loser].lost--;

                //TODO: update elo when game is deleted

                fs.writeFileSync('json/players.json', JSON.stringify(playersFile));

                records.splice(index, 1);
                fs.writeFileSync('json/records.json', JSON.stringify(records));
                return true;
            }
        }
        return false;

    }
};