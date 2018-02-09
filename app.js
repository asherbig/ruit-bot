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

var j = schedule.scheduleJob(rule, function() {
    let games = getLastWeek();
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
        let w1Name = formatUserForMessage(g.winners[0]);
        let w2Name = formatUserForMessage(g.winners[1]);
        let l1Name = formatUserForMessage(g.losers[0]);
        let l2Name = formatUserForMessage(g.losers[0]);

        //formatting a single game for the summary message
        if (cups === 1) {
            outMsg = outMsg + '*'+w1Name+' and '+w2Name+'*' + verb + l1Name
                + ' and '+l2Name+' by ' + cups + ' cup\n';
        } else {
            outMsg = outMsg + '*'+w1Name+' and '+w2Name+'*' + verb + l1Name
                + ' and '+l2Name+' by ' + cups + ' cups\n';
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
            channel: 'C8UALLR2P' // bros_and_pledges channel
            //NOTE: This channel ID may change every semester.
            //TODO: Set up a check to find the bros_and_pledges channel
            //channel: 'G7VC8LPP1' // bot testing channel
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
let guest_users = JSON.parse(fs.readFileSync('json/guest_users.json'));

bot.startRTM(function (err, bot, payload) {
    if (err) console.log('RTM START ERROR', err);
    apiFunctions = bot.api;

    reCalculatePlayers();

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

const { hears } = controller;

/* Action starts here */
//This needs to be first to make sure broadcast is the
// favored keyword. Could also solve this issue
// by having a function for broadcasting messages
hears(['broadcast'], 'direct_message', (bot, message) => {
    //broadcast a message if a password is accepted
    const { user, text } = message;

    let words = text.split(' ');
    let helpMsg = 'Command format:\n'
        + 'Broadcast [password] [message]'; 

    if (words[0].toUpperCase() !== 'BROADCAST') {
        return;
    }

    //TODO
    //dummy password. Change this to an untracked config file in github
    if (words.length >= 2 && words[1] === 'lodgePass') {
        words.splice(0,2);
        let msg = words.join(' ');
        //console.log('Sending message:', msg);
        //TODO change this to be a direct message to everyone
        bot.say({
            text: msg,
            channel: 'C8UALLR2P' // bros_and_pledges channel
            //NOTE: This channel ID may change every semester.
            //TODO: Set up a check to find the bros_and_pledges channel
            //channel: 'G7VC8LPP1' // bot testing channel
        });
    }

});

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

        let w1 = formatUserForLogging(words[0]); // winner 1
        let w2 = formatUserForLogging(words[1]); // winner 2
        let l1 = formatUserForLogging(words[3]); // loser 1
        let l2 = formatUserForLogging(words[4]); // loser 2

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
        let msgs = logging.logScore(game, true);

        //Commented out ELO related calculations. No current plans to implement
        // let newElos = logging.calcEloDelta(scoreObj['winner'], scoreObj['loser'], scoreObj['win-score'], scoreObj['lose-score']);
        // let winPretty = Math.round(newElos.winner.elo);
        // let losePretty = Math.round(newElos.loser.elo);

        let cupWord = 'cups'
        if (cups === 1) {
            cupWord = 'cup';
        }

        let w1Name = formatUserForMessage(w1);
        let w2Name = formatUserForMessage(w2);
        let l1Name = formatUserForMessage(l1);
        let l2Name = formatUserForMessage(l2);

        let outMsgLoser1 = ''+w1Name+' and '+w2Name+verb+'you and '+l2Name+' by '+cups+' '+cupWord;
        let outMsgLoser2 = ''+w1Name+' and '+w2Name+verb+'you and '+l1Name+' by '+cups+' '+cupWord;
        let outMsgWinner1 = 'You and '+w2Name+verb+l1Name+' and '+l2Name+' by '+cups+' '+cupWord;
        let outMsgWinner2 = 'You and '+w1Name+verb+l1Name+' and '+l2Name+' by '+cups+' '+cupWord;

        //possibly message the bros_and_pledges group about a skunk?
        if (cups === 10) {
            let outMsg = ''+w1Name+' and '+w2Name+' just skunked '+l1Name+' and '+l2Name+'!!!';
            bot.say({
                text: outMsg,
                channel: 'C8UALLR2P' // bros_and_pledges channel
                //NOTE: This channel ID may change every semester.
                //TODO: Set up a check to find the bros_and_pledges channel
                //channel: 'G7VC8LPP1' // bot testing channel
            });
        }

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
            let msg = '';
            if (msgs[i].type === 'streak break') {
                if (msgs[i].slength >= 5) {
                    if (msgs[i].subtype === 'losing') {
                        let l1Name = formatUserForMessage(msgs[i].opponents[0]);
                        let l2Name = formatUserForMessage(msgs[i].opponents[1]);
                        let w1Name = formatUserForMessage(msgs[i].user);
                        let w2Name = formatUserForMessage(msgs[i].teammate);
                        msg = w2Name+' just helped break '+w1Name+'\'s '+msgs[i].slength+' game losing streak!';
                    } else if (msgs[i].subtype === 'winning') {
                        let w1Name = formatUserForMessage(msgs[i].opponents[0]);
                        let w2Name = formatUserForMessage(msgs[i].opponents[1]);
                        let l1Name = formatUserForMessage(msgs[i].user);
                        let l2Name = formatUserForMessage(msgs[i].teammate);
                        msg = w1Name+' and '+w2Name+' ended '+l1Name+'\'s '+msgs[i].slength+' game winning streak!';
                    }
                    bot2.say({
                        text: msg,
                        //channel: 'C8UALLR2P' // bros_and_pledges channel
                        channel: 'G7VC8LPP1' //UNCOMMENT THE ABOVE LINE
                    });
                }
            } else if (msgs[i].type === 'streak continue') {
                if (msgs[i].slength % 5 === 0) {
                    if (msgs[i].subtype === 'losing') {
                        let w1Name = formatUserForMessage(msgs[i].opponents[0]);
                        let w2Name = formatUserForMessage(msgs[i].opponents[1]);
                        let l1Name = formatUserForMessage(msgs[i].user);
                        let l2Name = formatUserForMessage(msgs[i].teammate);
                        msg = l1Name+' is on a '+msgs[i].slength+' game losing streak!';
                    } else if (msgs[i].subtype === 'winning') {
                        let l1Name = formatUserForMessage(msgs[i].opponents[0]);
                        let l2Name = formatUserForMessage(msgs[i].opponents[1]);
                        let w1Name = formatUserForMessage(msgs[i].user);
                        let w2Name = formatUserForMessage(msgs[i].teammate);
                        msg = w1Name+' is on a '+msgs[i].slength+' game winning streak!';
                    }
                    bot2.say({
                        text: msg,
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

        // Create an array of names sorted by win-loss ratio
        return Object.keys(playersObject).sort(function (a, b) { 
            return playersObject[b].won/playersObject[b].lost 
                - playersObject[a].won/playersObject[a].lost; });

    }

    // Returns a message for pongbot to send in chat
    function genLeaderboardMessage() {

        // Read in players
        const playersObj = JSON.parse(fs.readFileSync('json/players.json'));
        const sortedPlayersList = sortPlayers(playersObj);

        // Construct the message
        let msg = '*Leaderboards:*\n'
            + '@User: *W-L* (W/L Ratio)\n';
        for (var i = 0; i < sortedPlayersList.length; i++) {
            let currentPlayer = sortedPlayersList[i];
            let wins = playersObj[currentPlayer].won;
            let losses = playersObj[currentPlayer].lost;
            let ratio = getRatio(wins, losses);
            let name = formatUserForMessage(currentPlayer);

            msg += ''+name+': *'+wins + '-' + losses + '* ('+ratio+')\n';

        }

        return msg;

    }

    return;

});

function getConfirmMsg(message, userFrom, timestamp) {
    let reply = {
        attachments: []
    };
    let name = formatUserForMessage(userFrom)
    reply.attachments.push({
        "fallback": ''+name+' recorded a beirut game with you!',
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
    let w1Name = formatUserForMessage(w1);
    let w2Name = formatUserForMessage(w2);
    let l1Name = formatUserForMessage(l1);
    let l2Name = formatUserForMessage(l2);

    let result = logging.deny({'timestamp': timestamp, 'denier': denier});

    //game was deleted as a result of the deny
    if (result === 'deleted') {
        let msg = '';
        let liarMsg = '';
        if (denier === l1 || denier === l2) {
            msg = 'You successfully deleted the game against '+w1Name+' and '+ w2Name
                + ' on <!date^' + timestamp + '^{date_short} at {time}| '
                + 'February 18th, 2014 at 6:39 AM PST>';
        } else if (denier === w1 || denier === w2) {
            msg = 'You successfully deleted the game against '+l1Name+' and '+ l2Name
                + ' on <!date^' + timestamp + '^{date_short} at {time}| '
                + 'February 18th, 2014 at 6:39 AM PST>';
        }
        messageUser(denier, msg, bot);
        if (liar === l1 || liar === l2) {
            liarMsg = 'The game you played against '+w1Name+' and '+w2Name
                + ' on <!date^' + timestamp + '^{date_short} at {time}| '
                + 'February 18th, 2014 at 6:39 AM PST>'
                + ' was deleted by <@'+denier+'>.';
        } else if (liar === w1 || liar === w2) {
            liarMsg = 'The game you played against '+l1Name+' and '+l2Name
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
            liarMsg = 'The game you played against '+w1Name+' and '+w2Name
                + ' on <!date^' + timestamp + '^{date_short} at {time}| '
                + 'February 18th, 2014 at 6:39 AM PST>'
                + ' was denied by <@'+denier+'>. If one more person denies this game, it will be deleted.';
        } else if (liar === w1 || liar === w2) {
            liarMsg = 'The game you played against '+l1Name+' and '+l2Name
                + ' on <!date^' + timestamp + '^{date_short} at {time}| '
                + 'February 18th, 2014 at 6:39 AM PST>'
                + ' was denied by <@'+denier+'> If one more person denies this game, it will be deleted.';
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
    if (!isGuestUser(user)) {
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
}

// //only run this function if you want to recalculate the players file stats
function reCalculatePlayers() {
    
    let records = JSON.parse(fs.readFileSync('json/records.json'));
    fs.writeFileSync('json/players.json', '{}');
    let numRecords = records.length;
    
    for (index in records) {
        let gameObj = records[index];
        logging.logScore(gameObj, false);
    }
    console.log('Player re-calculations complete.');

}

hears(['help'], 'direct_message,direct_mention,mention', (bot, message) => {

    const helpMsg = 'All commands are done through the ruitbot *direct messages*.\nTo record a game:\n'
        + '*@Winner1 @Winner2 beat @Loser1 @Loser2 [cups won by]*\n'
        + 'To record a game with someone _not_ in the slack:\n'
        + '*@SlackUser Guest beat Guest Guest [cups won by]*\n'
        + 'To see all the added guests:\n'
        + '*Guests* or *Guest*\n'
        + 'To register a person who isn\'t in the slack or the current guest list:\n'
        + '*Add [Name]*\n'
        + '(For any command with a guest instead of a slack user, just type their name without the "@")\n'
        + 'To check leaderboards:\n'
        + 'Type some variant of *scores* or *leaderboards*\n'
        + 'List all games played by everyone:\n*List all*\n'
        + 'List all games played by a user:\n*List @User*\n'
        + 'List all games played by a certain team:\n*List @User1 @User2*\n'
        + 'List all games where two specific people play against each other:\n*List @User1 vs @User2*';
    bot.reply(message, helpMsg);
    return;

});

function pollUsers(members) {
    const helpMsg = 'All commands are done through the ruitbot *direct messages*.\nTo record a game:\n'
        + '*@Winner1 @Winner2 beat @Loser1 @Loser2 [cups won by]*\n'
        + 'To record a game with someone _not_ in the slack:\n'
        + '*@SlackUser Guest beat Guest Guest [cups won by]*\n'
        + 'To see all the added guests:\n'
        + '*Guests* or *Guest*\n'
        + 'To register a person who isn\'t in the slack or the current guest list:\n'
        + '*Add [Name]*\n'
        + '(For any command with a guest instead of a slack user, just type their name without the "@")\n'
        + 'To check leaderboards:\n'
        + 'Type some variant of *scores* or *leaderboards*\n'
        + 'List all games played by everyone:\n*List all*\n'
        + 'List all games played by a user:\n*List @User*\n'
        + 'List all games played by a certain team:\n*List @User1 @User2*\n'
        + 'List all games where two specific people play against each other:\n*List @User1 vs @User2*';
    for (let i = 0; i < members.length; i++) {
        bot.startPrivateConversation(
            { 'user': members[i] }, function (err, convo) {
                if (!err && convo) {
                    convo.say({
                        text: '*This is the DM to log beiruit games!*\n\n'
                            + helpMsg, mrkdown: true
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
        + 'List all games played by everyone:\n*List all*\n'
        + 'List all games played by a user:\n*List @User*\n'
        + 'List all games played by a certain team:\n*List @TeamMember1 @TeamMember2*\n'
        + 'List all games where two specific people play against each other:\n*List @User1 vs @User2*';

    if (words[0].toUpperCase() !== 'LIST') {
        return;
    }
    if (words.length === 1) {
        messageUser(user, helpMsg, bot);
        return;
    }

    //there are 2 words, and the second one is a user
    //this means they entered List @User
    if (words.length === 2 && isUser(words[1])) {
        //if at least 2 parameters and correct format so far, get user
        user1 = words[1].slice(2, -1);
        let records = JSON.parse(fs.readFileSync('json/records.json'));
        let wins = 0;
        let losses = 0;
        let outMsg = '';

        for (let index in records) {
            let game = records[index];
            let date = new Date(game.timestamp * 1000);
            let w1 = game.winners[0];
            let w2 = game.winners[1];
            let l1 = game.losers[0];
            let l2 = game.losers[1];
            let cups = game.cups;
            if (w1 === user1) { //if the user was a winner
                outMsg += '*(W)* with <@'+w2+'> vs <@'+l1+'> and <@'+l2+'> by *'+cups+' cups* on '+formatDate(date)+'\n';
                wins++;
            } else if (w2 === user1) { //if the user was a winner
                outMsg += '*(W)* with <@'+w1+'> vs <@'+l1+'> and <@'+l2+'> by *'+cups+' cups* on '+formatDate(date)+'\n';
                wins++;
            } else if (l1 === user1) { //if the user was a loser
                outMsg += '*(L)* with <@'+l2+'> vs <@'+w1+'> and <@'+w2+'> by *'+cups+' cups* on '+formatDate(date)+'\n';
                losses++
            } else if (l2 === user1){ //if the user was a loser
                outMsg += '*(L)* with <@'+l1+'> vs <@'+w1+'> and <@'+w2+'> by *'+cups+' cups* on '+formatDate(date)+'\n';
                losses++
            }
        }
        let ratio = getRatio(wins, losses);
        outMsg = '*<@'+user1+'>\'s total record: ('+wins+'-'+losses+')* _('+ratio+')_\n'+ outMsg;
        bot.reply(message, outMsg);
        return;
    }

    //command entered: "List all"
    if (words.length === 2 && words[1].toUpperCase() === 'ALL') {

        outMsg = '';
        let numGames = 0;
        let games = JSON.parse(fs.readFileSync('json/records.json'));

        for (let index in games) {
            
            let game = games[index];
            let cups = game.cups;
            let date = new Date(game.timestamp * 1000);
            let w1 = game.winners[0];
            let w2 = game.winners[1];
            let l1 = game.losers[0];
            let l2 = game.losers[1];

            let verb = ' beat ';
            //get the verb
            if (cups == 10) {
                verb = ' skunked ';
            } else if (cups > 5) {
                verb = ' destroyed ';
            }
    
            //formatting a single game for the summary message
            if (cups === 1) {
                outMsg = outMsg + '*<@'+w1+'> and <@'+w2+'>*' + verb + '<@'
                    + l1 + '> and <@'+ l2+ '> by ' + cups + ' cup on '+formatDate(date)+'\n';
            } else {
                outMsg = outMsg + '*<@'+w1+'> and <@'+w2+'>*' + verb + '<@'
                    + l1 + '> and <@'+ l2 +'> by ' + cups + ' cups on '+formatDate(date)+'\n';
            }
            numGames++;
        }
        outMsg = '*'+numGames+' games logged since last reset:*\n' + outMsg;
        bot.reply(message, outMsg);
        return;
    }

    //they entered the command "List @TeamMember1 @TeamMember2"
    //want to list all the games played by a certain team
    if (words.length === 3 && isUser(words[1]) && isUser(words[2])) {
        user1 = words[1].slice(2, -1);
        user2 = words[2].slice(2, -1);

        let wins = 0;
        let losses = 0;
        let outMsg = '';
        let records = JSON.parse(fs.readFileSync('json/records.json'));
        for (let index in records) {
            let game = records[index];
            let date = new Date(game.timestamp * 1000);
            let w1 = game.winners[0];
            let w2 = game.winners[1];
            let l1 = game.losers[0];
            let l2 = game.losers[1];
            let cups = game.cups;

            if ((w1 === user1 && w2 === user2) || (w1 === user2 && w2 === user1)) { //they won the game as team
                wins++;
                outMsg += '*(W)* vs <@'+l1+'> and <@'+l2+'> by *'+cups+' cups* on '+formatDate(date)+'\n';
            } else if ((l1 === user1 && l2 === user2) || (l1 === user2 && l2 === user1)) { //they lost
                losses++;
                outMsg += '*(L)* vs <@'+w1+'> and <@'+w2+'> by *'+cups+' cups* on '+formatDate(date)+'\n';
            }
        }
        let ratio = getRatio(wins, losses);
        outMsg = '*<@'+user1+'> with <@'+user2+'> ('+wins+'-'+losses+')* _('+ratio+')_\n' + outMsg;
        bot.reply(message, outMsg);
        return;
    }

    //they entered the command "List @User1 vs @User2"
    if (words.length === 4 && isUser(words[1]) && isUser(words[3]) && words[2].toUpperCase() === 'VS') {
        user1 = words[1].slice(2, -1);
        user2 = words[3].slice(2, -1);

        let wins = 0;
        let losses = 0;
        let outMsg = '';
        let records = JSON.parse(fs.readFileSync('json/records.json'));
        for (let index in records) {
            let game = records[index];
            let date = new Date(game.timestamp * 1000);
            let w1 = game.winners[0];
            let w2 = game.winners[1];
            let l1 = game.losers[0];
            let l2 = game.losers[1];
            let cups = game.cups;

            if (w1 === user1 && (l1 === user2 || l2 === user2)) { //if user1 was a winner
                outMsg += '*(W)* with <@'+w2+'> vs <@'+l1+'> and <@'+l2+'> by *'+cups+' cups* on '+formatDate(date)+'\n';
                wins++;
            } else if (w2 === user1 && (l1 === user2 || l2 === user2)) { //if user1 was a winner
                outMsg += '*(W)* with <@'+w1+'> vs <@'+l1+'> and <@'+l2+'> by *'+cups+' cups* on '+formatDate(date)+'\n';
                wins++;
            } else if (l1 === user1 && (w1 === user2 || w2 === user2)) { //if user1 was a loser
                outMsg += '*(L)* with <@'+l2+'> vs <@'+w1+'> and <@'+w2+'> by *'+cups+' cups* on '+formatDate(date)+'\n';
                losses++
            } else if (l2 === user1 && (w1 === user2 || w2 === user2)) { //if user1 was a loser
                outMsg += '*(L)* with <@'+l1+'> vs <@'+w1+'> and <@'+w2+'> by *'+cups+' cups* on '+formatDate(date)+'\n';
                losses++
            }
        }
        let ratio = getRatio(wins, losses);
        outMsg = '*<@'+user1+'> vs <@'+user2+'> ('+wins+'-'+losses+')* _('+ratio+')_\n' + outMsg;
        bot.reply(message, outMsg);
        return;
    }


    //they didn't enter a valid command if the code made it here
    messageUser(user, helpMsg, bot);
    return;

});

//command "add [new guest]"
hears(['add'], 'direct_message', (bot, message) => {
    
    const { user, text } = message;
    let words = text.split(' ');

    if (words[0].toUpperCase() !== 'ADD') {
        return;
    }

    //they entered the right command
    //and the user they want to add isn't in the system yet
    if (words[0].toUpperCase() === 'ADD' && words.length === 2 && !isUser(words[1])) {
        guest_users = JSON.parse(fs.readFileSync('json/guest_users.json'));
        guest_users.push(words[1]);
        fs.writeFileSync('json/guest_users.json', JSON.stringify(guest_users));

        bot.reply(message, 'Successfully added '+words[1]+' as a guest user!');
    } else if (words[0].toUpperCase() === 'ADD' && words.length === 2 && isUser(words[1])) {
        bot.reply(message, words[1] + ' is already a registered guest! Log your game with them!');
    } else {
        bot.reply(message, 'Incorrect format! Add command format:\nAdd [new guest]');
    }

});

hears(['guests', 'guest'], 'direct_message', (bot, message) => {

    const { user, text } = message;
    let words = text.split(' ');

    if (words[0].toUpperCase() !== 'GUESTS' && words[0].toUpperCase() !== 'GUEST') {
        return;
    }

    if (words.length !== 1) {
        return;
    }

    let outMsg = '';
    for (let i in guest_users) {
        outMsg += guest_users[i] + '\n';
    }
    outMsg = '*Registered Guests:*\n' + outMsg;

    bot.reply(message, outMsg);

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
    if (/<@([A-Z0-9]{9})>/.test(word)) {
        return true;
    } else {
        //find out if they are a guest user
        for (let i in guest_users) {
            if (word.toUpperCase() === guest_users[i].toUpperCase()) {
                return true;
            }
        }
    }
    return false;
}

function getRatio(wins, losses) {
    if (losses === 0) {
        return Math.round(wins/1*100)/100;
    } else {
        return Math.round(wins/losses*100)/100;
    }
}

//users can also be from the guest list.
function formatUserForMessage(user) {
    if (/([A-Z0-9]{9})/.test(user)) {
        //user is a slack user
        return '<@'+user+'>';
    } else {
        //capitalizes name
        for (let i in guest_users) {
            if (user.toUpperCase() === guest_users[i].toUpperCase()) {
                return guest_users[i];
            }
        }
    }
}

function formatUserForLogging(word) {
    if (!isUser(word)) {
        console.log('User is not valid, will not format name for logging');
        return 'invalid user';
    } else if (/<@([A-Z0-9]{9})>/.test(word)) {
        //user is in the form <@ABCDEFGH>
        return word.slice(2, -1);
    } else {
        //user is a guest user
        //use the format stored in the guest_users file
        for (let i in guest_users) {
            if (word.toUpperCase() === guest_users[i].toUpperCase()) {
                return guest_users[i];
            }
        }
    }
}

function isGuestUser(name) {
    return isUser(name) && !(/<@([A-Z0-9]{9})>/.test(name));
}
