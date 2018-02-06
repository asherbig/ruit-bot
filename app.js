/* Library imports */

const credentials = require('./js/credentials.js');
const botkit = require('botkit');
const fs = require('fs');
const logging = require('./js/logging.js');
const schedule = require('node-schedule');

/* Setup */

//setting daily message properties
var rule = new schedule.RecurrenceRule();
rule.dayOfWeek = 1; //every Monday
rule.hour = 12; //this will do a message every week, Monday at noon
rule.minute = 0;

//TODO change to work with new game format
var j = schedule.scheduleJob(rule, function() {
    let games = getLastWeek(); //TODO edit function
    console.log(games);
    outMsg = '';
    for (let index in games) {
        
        let g = games[index];
        //console.log(g);
        let verb = ' beat ';
        let cups = g.cups;
        //get the verb
        if (cups == 10) { //ls = loseScore
            verb = ' skunked ';
        } else if (cups > 5) {
            verb = ' destroyed ';
        }

        //formatting a single game for the summary message
        if (cups === 1) {
            outMsg = outMsg + '<@'+g.winners[0]+'> and <@'+g.winners[1]+'>' + verb + '<@'
                + g.losers[0] + '> and <@'+ g.losers[1]+'> by' + cups + ' cup\n';
        } else {
            outMsg = outMsg + '<@'+g.winners[0]+'> and <@'+g.winners[1]+'>' + verb + '<@'
                + g.losers[0] + '> and <@'+ g.losers[1]+'> by' + cups + ' cups\n';
        }
    }
    if (games.length === 1) {
        outMsg = '*' + games.length + ' game played in the last week!*\n' + outMsg;
    } else {
        outMsg = '*' + games.length + ' games played in the last week!*\n' + outMsg;
    }
    if (games.length === 0) {
        outMsg = outMsg + 'Play some games this week!'
    }

    //UNCOMMENT THIS BEFORE PUSHING TO PRODUCTION
    bot.say({
            text: outMsg,
            //channel: 'C8UALLR2P' // bros_and_pledges channel
            //NOTE: This channel ID may change every semester.
            //TODO: Set up a check to find the bros_and_pledges channel
            channel: 'G7VC8LPP1' // bot testing channel
        });

});

const controller = botkit.slackbot({
    debug: false,
});

var apiFunctions;
var bot = controller.spawn({
    retry: true,
    token: credentials.bot_oauth_token
});
var bot2 = bot;

bot.startRTM(function (err, bot, payload) {
    if (err) console.log('RTM START ERROR', err);
    apiFunctions = bot.api;

    //get all the users in the slack channel
    bot.api.users.list({}, function(err,resp) {
        if (!err) {
            //console.log(resp);
            json = JSON.stringify(resp);
            let members_resp = resp.members;
            let members = [];
            for (let i in members_resp) {
                members.push(members_resp[i].id);
            }
            let users = JSON.parse(fs.readFileSync('json/users_config.json'));
            let difference = members.filter(x => users.messaged.indexOf(x) == -1);
            
            if (difference.length > 0) {
                console.log('Messaging new users!');
            }
            //UNCOMMENT THIS BEFORE IT GOES TO GITHUB
            //pollUsers(difference);
            //pollUsers(["U54GUSFGE"]);
            fs.writeFileSync('json/users_config.json', JSON.stringify({ 'messaged': members }));
  
        } else {
            console.log('Error receiving user list from API');
            throw err;
        }
    });
});

/* Action starts here */

const { hears } = controller;

/* ---- MAIN FUNCTIONALITY ---- */

//command format
//@Winner1 @Winner2 beat @Loser1 @Loser2 [cups won by]

// Game logging, ELO adjustment
hears('beat', 'direct_message', (bot, message) => {

    const { user, text } = message;
    //console.log("text:",text);
    let words = text.split(' ');

    // Logic to check formatting
    if (words[2].toUpperCase() === 'beat'.toUpperCase()) {
        if (words.length != 6) {
            bot.reply(message, 'Invalid command format!\nFormat: \n'
                + '@Winner1 @Winner2 beat @Loser1 @Loser2 [cups won by]');
            return;
        }

        //test to see if there are 4 users in the right spots
        if (!isUser(words[0]) || !isUser(words[1]) || !isUser(words[3]) || !isUser(words[4])) {
            bot.reply(message, 'Invalid command format!\nFormat: \n'
                + '@Winner1 @Winner2 beat @Loser1 @Loser2 [cups won by]');
            return;
        }

        //test to see if the last argument is a number
        if (!(/^\d+$/.test(words[5]))) {
            bot.reply(message, 'Invalid command format!\nFormat: \n'
                + '@Winner1 @Winner2 beat @Loser1 @Loser2 [cups won by]');
            return;
        }

        let w1 = words[0].slice(2, -1); // winner 1
        let w2 = words[1].slice(2, -1); // winner 2
        let l1 = words[3].slice(2, -1); // loser 1
        let l2 = words[4].slice(2, -1); // loser 2

        //person logging the game must be one of the 4 players
        if (!(w1 === user) && !(w2 === user) && !(l1 === user) && !(l2 === user)) {
            bot.reply(message, 'You can only log your own games!');
            return;
        }

        //a person cannot play themselves
        if (w1 === l1 || w1 === l2 || w2 === l1 || w2 === l2) {
            bot.reply(message, 'You can\'t play yourself!');
            return;
        }

        //there must be 4 unique players in the game
        if (w1 === w2 || l1 === l2) {
            bot.reply(message, 'Invalid players! There was a duplicate person on one of the teams!');
            return;
        }

        // Once the formatting is correct, pull information
        let verb = ' beat ';
        let cups = parseInt(words[5]);

        if (cups <= 0 || cups > 10) {
            bot.reply(message, 'Invalid number of cups left!\n'
                + 'The other team had to have between 1 and 10 cups left!');
            return;
        } else if (cups === 10) {
            verb = ' skunked ';
        } else if (cups > 5) {
            verb = ' destroyed ';
        }

        let ts = Math.floor(new Date().getTime() / 1000); //match slack ts
        //console.log(ts);

        /* ---- Give Feedback to Users and Log Game ---- */

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

        // Log scores and new ELOs
        let msgs = logging.logScore(game);

        //Commented out ELO related calculations. No current plans to implement
        // let newElos = logging.calcEloDelta(scoreObj['winner'], scoreObj['loser'], scoreObj['win-score'], scoreObj['lose-score']);
        // let winPretty = Math.round(newElos.winner.elo);
        // let losePretty = Math.round(newElos.loser.elo);

        let cupWord = 'cups'
        if (cups === 1) {
            cupWord = 'cup';
        }

        let outMsgLoser1 = '<@'+w1+'> and <@'+w2+'>'+verb+'you and <@'+l2+'> by '+cups+' '+cupWord;
        let outMsgLoser2 = '<@'+w1+'> and <@'+w2+'>'+verb+'you and <@'+l1+'> by '+cups+' '+cupWord;
        let outMsgWinner1 = 'You and <@'+w2+'>'+verb+'<@'+l1+'> and <@'+l2+'> by '+cups+' '+cupWord;
        let outMsgWinner2 = 'You and <@'+w1+'>'+verb+'<@'+l1+'> and <@'+l2+'> by '+cups+' '+cupWord;

        // Send the base message to the logger of the game
        //all other messages must have the option to deny the game
        if (w1 === user) {
            bot.reply(message, outMsgWinner1);
            messageUser(w2, getConfirmMsg(outMsgWinner2, user, ts), bot);
            messageUser(l1, getConfirmMsg(outMsgLoser1, user, ts), bot);
            messageUser(l2, getConfirmMsg(outMsgLoser2, user, ts), bot);
        } else if (w2 === user) {
            messageUser(w1, getConfirmMsg(outMsgWinner1, user, ts), bot);
            bot.reply(message, outMsgWinner2);
            messageUser(l1, getConfirmMsg(outMsgLoser1, user, ts), bot);
            messageUser(l2, getConfirmMsg(outMsgLoser2, user, ts), bot);
        } else if (l1 === user) {
            messageUser(w1, getConfirmMsg(outMsgWinner1, user, ts), bot);
            messageUser(w2, getConfirmMsg(outMsgWinner2, user, ts), bot);
            bot.reply(message, outMsgLoser1);
            messageUser(l2, getConfirmMsg(outMsgLoser2, user, ts), bot);
        } else if (l2 === user) {
            messageUser(w1, getConfirmMsg(outMsgWinner1, user, ts), bot);
            messageUser(w2, getConfirmMsg(outMsgWinner2, user, ts), bot);
            messageUser(l1, getConfirmMsg(outMsgLoser1, user, ts), bot);
            bot.reply(message, outMsgLoser2);
        }
        
        //decide which notifications to print
        for (let i in msgs) {
            console.log('message',i,':', msgs[i]);
            if (msgs[i].type === 'streak continue') {
                if (msgs[i].length % 5 === 0) {
                    console.log('printing streak continue messages');
                    bot2.say({
                        text: msgs[i].message,
                        //channel: 'C8UALLR2P' // bros_and_pledges channel
                        channel: 'G7VC8LPP1' //UNCOMMENT THE ABOVE LINE
                    });
                }
            } else if (msgs[i].type === 'streak break') {
                if (msgs[i].length >= 5) {
                    console.log('printing streak break messages');
                    bot2.say({
                        text: msgs[i].message,
                        //channel: 'C8UALLR2P' // bros_and_pledges channel
                        channel: 'G7VC8LPP1' //UNCOMMENT THE ABOVE LINE
                    });
                }
            }
        }   

        return;
    }
});

// Display the leaderboards
hears(['leaderboards', 'leaderboard', 'leaders', 'scores', 'score'], 'direct_message', (bot, message) => {

    bot.reply(message, genLeaderboardMessage());

    // Returns a sorted array of players, from highest elo to lowest
    function sortPlayers(playersObject) {

        // Create an array of names sorted by ELO
        return Object.keys(playersObject).sort(function (a, b) { return playersObject[b].elo - playersObject[a].elo; });

    }

    // Returns a message for pongbot to send in chat
    function genLeaderboardMessage() {

        // Read in players
        const playersObj = JSON.parse(fs.readFileSync('json/players.json'));
        const sortedPlayersList = sortPlayers(playersObj);

        // Tierify them
        const tierNames = ['God-Tier', 'A-Tier', 'Good', 'Silver', 'Bad', 'Trash'];
        const tierNums = [950, 850, 750, 650, 550];

        function getTier(playerName) {

            const e = playersObj[playerName]['elo'];
            let tier;

            if (e > tierNums[0]) {
                tier = tierNames[0];
            } else if (e > tierNums[1]) {
                tier = tierNames[1];
            } else if (e > tierNums[2]) {
                tier = tierNames[2];
            } else if (e > tierNums[3]) {
                tier = tierNames[3];
            } else if (e > tierNums[4]) {
                tier = tierNames[4];
            } else {
                tier = tierNames[5];
            }

            return tier;

        }

        // Construct the message
        let msg = '*Leaderboards:*\n';
        let currentTier;
        for (var i = 0; i < sortedPlayersList.length; i++) {

            let currentPlayer = sortedPlayersList[i];
            let currentElo = Math.round(playersObj[currentPlayer]['elo']);
            let wins = playersObj[currentPlayer].won;
            let losses = playersObj[currentPlayer].lost;

            if (getTier(sortedPlayersList[i]) !== currentTier) {
                currentTier = getTier(sortedPlayersList[i]);
                msg += '\n_' + currentTier + '_\n';
            }

            msg += '<@' + currentPlayer + '>:  *' + currentElo + '*  (' 
                + wins + '-' + losses + ')\n';

        }

        return msg;

    }

    return;

});

function getConfirmMsg(message, userFrom, timestamp) {
    let reply = {
        attachments: []
    };
    reply.attachments.push({
        "fallback": '<@' + userFrom + '> recorded a beirut game including you!',
        "pretext": message,
        "footer": "To deny game, react on this message",
        "mrkdwn_in": ["pretext"],
        "ts": timestamp
    });
    return reply;
}

controller.on('reaction_added', function (bot, message) {
    // https://api.slack.com/events/reaction_added
    const { item, user, reaction, item_user } = message;

    let ts = item.ts;
    let channelID = item.channel;

    // if (reaction !== 'x') {
    //     return;
    // }

    //get more info about what was reacted on
    apiFunctions.conversations.history({
        'token': credentials.bot_oauth_token,
        'channel': channelID,
        'latest': ts, 'inclusive': true, 'count': 1
    }, function (err, resp) {
        if (err) {
            console.log("MESSAGE HISTORY ERROR", err);
            if (err !== 'missing_scope') {
                messageUser(user, 'Unable to delete game. Try again Later (Msg 1)', bot);
            }
        } else {
            denyGame(user, resp, bot);
        }
    });

});

function denyGame(denier, resp, bot) {
    //console.log('message ts', resp.messages[0].attachments[0].ts);
    // console.log('MESSAGE THAT WAS REACTED ON', resp);
    if (!resp.messages[0].attachments ||
        resp.messages[0].attachments[0].fallback.slice(13)
        !== 'recorded a beirut game including you!') {
        messageUser(denier, 'Reaction added to an invalid message!', bot);
        return;
    }
    let records = JSON.parse(fs.readFileSync('json/records.json'));
    let game = null;
    let timestamp = resp.messages[0].attachments[0].ts
    for (let index in records) {
        if (timestamp === records[index].timestamp) {
            game = records[index];
        }
    }
    if (!game) {
        //unable to find a game with the timestamp
        messageUser(denier, 'Unable to find the game to be deleted. Has it already been deleted?', bot);
    }

    let cups = game.cups;
    let w1 = game.winners[0];
    let w2 = game.winners[1];
    let l1 = game.losers[0];
    let l2 = game.losers[1];
    let liar = game.logger;

    let result = logging.deny({'timestamp': timestamp, 'denier': denier});

    //game was deleted as a result of the deny
    if (result === 'deleted') {
        let msg = '';
        let liarMsg = '';
        if (denier === l1 || denier === l2) {
            msg = 'You successfully deleted the game against <@'+w1+'> and <@'+w2+'>'
                + ' on <!date^' + timestamp + '^{date_short} at {time}| '
                + 'February 18th, 2014 at 6:39 AM PST>';
        } else if (denier === w1 || denier === w2) {
            msg = 'You successfully deleted the game against <@'+l1+'> and <@'+l2+'>'
                + ' on <!date^' + timestamp + '^{date_short} at {time}| '
                + 'February 18th, 2014 at 6:39 AM PST>';
        }
        messageUser(denier, msg, bot);
        if (liar === l1 || liar === l2) {
            liarMsg = 'The game you played against <@'+w1+'> and <@'+w2+'>'
                + ' on <!date^' + timestamp + '^{date_short} at {time}| '
                + 'February 18th, 2014 at 6:39 AM PST>'
                + ' was deleted by <@'+denier+'>.';
        } else if (liar === w1 || liar === w2) {
            liarMsg = 'The game you played against <@'+l1+'> and <@'+l2+'>'
                + ' on <!date^' + timestamp + '^{date_short} at {time}| '
                + 'February 18th, 2014 at 6:39 AM PST>'
                + ' was deleted by <@'+denier+'>';
        }
        messageUser(liar, liarMsg, bot);

    //the game was not deleted, but the deny request was logged
    } else if (result === 'denied') {
        let msg = 'Your deny request was logged. If one more person denies this game, it will be deleted.'
        messageUser(denier, msg, bot);
        let liarMsg = '';
        if (liar === l1 || liar === l2) {
            liarMsg = 'The game you played against <@'+w1+'> and <@'+w2+'>'
                + ' on <!date^' + timestamp + '^{date_short} at {time}| '
                + 'February 18th, 2014 at 6:39 AM PST>'
                + ' was denied by <@'+denier+'>. If one more person denies this game, it will be deleted.';
        } else if (liar === w1 || liar === w2) {
            liarMsg = 'The game you played against <@'+l1+'> and <@'+l2+'>'
                + ' on <!date^' + timestamp + '^{date_short} at {time}| '
                + 'February 18th, 2014 at 6:39 AM PST>'
                + ' was deleted by <@'+denier+'> If one more person denies this game, it will be deleted.';
        }
        messageUser(liar, liarMsg, bot);

    //The game was not deleted and the deny request was not logged
    } else if (result === 'duplicate') {
        messageUser(denier, 'You\'ve already denied this game! You can\'t deny it again', bot);
    } else if (result === 'error') {
        messageUser(denier, 'Unable to delete game. Try again Later (Msg 2)', bot);
    }
}

function messageUser(user, message, bot = null) {
    if (!bot) {
        console.log('SUCKS, BUT BOT ISN\'T DEFINED, GOOD LUCK');
        return;
    }
    bot.startPrivateConversation(
        { 'user': user }, function (err, convo) {
            if (err) {
                console.log('ERROR DM-ING LOSER', user);
            } else {
                if (!err && convo) {
                    convo.say(message);
                }
            }
        });
}

// //only run this function if you want to recalculate everyone's elo
// function reCalculateElos() {
    
//     let records = JSON.parse(fs.readFileSync('json/records.json'));
//     fs.writeFileSync('json/players.json', '{}');
//     let numRecords = records.length;
//     console.log('Processing', numRecords, 'games...');
    
//     for (index in records) {
//         let scoreObj = records[index];
//         let newElos = logging.calcEloDelta(scoreObj['winner'], scoreObj['loser'], scoreObj['win-score'], scoreObj['lose-score']);
//         logging.updateElos(newElos);
//         let progNum = Math.round(index / numRecords * 20);
//     }
//     console.log('Elo calculations complete.');

// }

hears(['help'], 'direct_message,direct_mention,mention', (bot, message) => {

    const helpMsg = 'To record a game, whoever wins should type "beat @[loser] [loser\'s score]".\nTo check leaderboards, type some variant of "scores" or "leaderboards" and @pongbot.';
    bot.reply(message, helpMsg);
    return;

});

function pollUsers(members) {
    for (let i = 0; i < members.length; i++) {
        bot.startPrivateConversation(
            { 'user': members[i] }, function (err, convo) {
                if (!err && convo) {
                    convo.say({
                        text: 'This is the DM to log ping pong games now!\n'
                            + 'To log a game, type *"beat @user [losing score]"*.', mrkdown: true
                    });
                }
            });
    }
}

function formatDate(input) {
    let month = input.getMonth();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[month] + ' ' + input.getDate();
}

//list @User ["time"|"score"] (optional)
//list @User @User ["time"|"score"]
//games can be sorted by time or score
hears(['list'], 'direct_message', (bot, message) => {

    //check to see if the command is in the right format
    const { user, text } = message;
    let words = text.split(' ');
    let sort = 'TIME';
    let users = 0;
    let user1;
    let user2;

    let helpMsg = 'Incorrect command format!\n'
        + 'Format 1: List @Opponent ["time|"score"]\n'
        + 'Format 2: List @User1 @User2 ["time|"score"]\n'
        + '(Default sort is time if no sort type is entered)'
    if (words[0].toUpperCase() !== 'LIST') {
        return;
    }
    if (words.length === 1) {
        messageUser(user, helpMsg, bot);
        return;
    }
    if (words.length >= 2 && /<@([A-Z0-9]{9})>/.test(words[1])) {
        //if at least 2 parameters and correct format so far, get user
        users = 1;
        user1 = words[1].slice(2, -1);
    }
    if (words.length >= 3) {
        if (/<@([A-Z0-9]{9})>/.test(words[2])) { //it's a user
            users = 2;
            user2 = words[2].slice(2, -1);
        } else if (words[2].toUpperCase() === 'TIME' || words[2].toUpperCase() === 'SCORE') {
            sort = words[2].toUpperCase();
        } else { //invalid 3rd parameter
            messageUser(user, helpMsg, bot);
            return;
        }
    }
    if (words.length === 4) {
        if (words[3].toUpperCase() === 'TIME' || words[3].toUpperCase() === 'SCORE' && user2) {
            sort = words[3].toUpperCase();
        } else { //invalid 4th parameter
            messageUser(user, helpMsg, bot);
            return;
        }
    }
    if (words.length > 4) { //too long of a message
        messageUser(user, helpMsg, bot);
        return;
    }

    //logging all of 1 person's games
    if (users === 1) {
        let wins = 0;
        let losses = 0;
        let outMsg = '';
        let records = JSON.parse(fs.readFileSync('json/records.json'));
        for (let index in records) {
            let game = records[index];
            let date = new Date(game.timestamp * 1000);
            if (game.winner === user1) { //user was the winner
                outMsg += '(W) vs <@'+game.loser+'> *' + game['win-score'] 
                + '-' + game['lose-score'] + '* on '+formatDate(date)+'\n';
                wins++;
            } else if (game.loser === user1){ //user was the loser
                outMsg += '(L) vs <@'+game.winner+'> *' + game['lose-score'] 
                + '-' + game['win-score'] + '* on '+formatDate(date)+'\n';
                losses++
            }
        }
        outMsg = '*<@'+user1+'>\' total record: ('+wins+'-'+losses+')*\n'+ outMsg;
        bot.reply(message, outMsg);
        return;
    }

    if (users === 2) {
        let wins = 0;
        let losses = 0;
        let outMsg = '';
        let records = JSON.parse(fs.readFileSync('json/records.json'));
        for (let index in records) {
            let game = records[index];
            let date = new Date(game.timestamp * 1000);
            if (game.winner === user1 && game.loser === user2) {
                wins++;
                outMsg += '<@'+user1+'> won *'+game['win-score']+'-'
                    +game['lose-score'] + '* on '+formatDate(date)+'\n';
            } else if (game.winner === user2 && game.loser === user1) {
                losses++;
                outMsg += '<@'+user2+'> won *'+game['win-score']+'-'
                    +game['lose-score'] + '* on '+formatDate(date)+'\n';;
            }
        }
        outMsg = '*<@'+user1+'> vs <@'+user2+'> ('+wins+'-'+losses+')*\n' + outMsg;
        bot.reply(message, outMsg);
        return;
    }

});

//returns all the game objects for the last week
function getLastWeek() {
    let records = JSON.parse(fs.readFileSync('json/records.json'));
    let out = [];
    for (let index in records) {
        let game = records[index];
        let lastWeekTs = Math.round(new Date().getTime() / 1000) - 24 * 3600 * 7;
        if (game.timestamp > lastWeekTs) {
            out.push(game);
        }
    }
    return out;
}

function isUser(word) {
    return (/<@([A-Z0-9]{9})>/.test(word));
}