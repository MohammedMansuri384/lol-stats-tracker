require('dotenv').config();
console.log("RIOT API KEY:", process.env.RIOT_API_KEY);
const express = require('express');
const cors = require('cors');
const db = require('./db');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const RIOT_BASE_API_URL_ACCOUNT = (region) => `https://${getRegionApiHost(region)}.api.riotgames.com/riot/account/v1/accounts/by-riot-id`;
const RIOT_BASE_API_URL_MATCHES = (region) => `https://${getRegionApiHost(region)}.api.riotgames.com/lol/match/v5/matches/by-puuid`;
const RIOT_BASE_API_URL_MATCH = (region) => `https://${getRegionApiHost(region)}.api.riotgames.com/lol/match/v5/matches`;

function getRegionApiHost(region) {
    const americas = ['na1', 'br1', 'lan1', 'las1', 'oc1'];
    const europe = ['euw1', 'eun1', 'tr1', 'ru'];
    const asia = ['jp1', 'kr1', 'ph2', 'sg2', 'th2', 'tw2', 'vn2'];
    if (americas.includes(region)) return 'americas';
    if (europe.includes(region)) return 'europe';
    if (asia.includes(region)) return 'asia';
    return 'americas';
}

app.get('/api/player/:gameName/:tagLine/:region/stats', async (req, res) => {
    const { gameName, tagLine, region } = req.params;

    if (!RIOT_API_KEY) {
        return res.status(500).json({ error: 'Riot API key is not set' });
    }

    try {
        console.log(`Fetching player stats for ${gameName}#${tagLine} in ${region}`);
        const accountApiUrl = `${RIOT_BASE_API_URL_ACCOUNT(region)}/${gameName}/${tagLine}?api_key=${RIOT_API_KEY}`;
        let puuid;

        try {
            const accountResponse = await axios.get(accountApiUrl);
            puuid = accountResponse.data.puuid;
        } catch (error) {
            console.error('Error fetching puuid', error.response?.data || error.message);
            if (error.response && error.response.status === 404) {
                return res.status(404).json({ error: 'Player not found. Check username, tagline, and region' });
            }
            return res.status(500).json({ error: 'Failed to fetch player puuid from Riot API' });
        }

        if (!puuid) {
            return res.status(404).json({ error: 'Player not found. (No puuid could be retrieved)' });
        }

        db.get('SELECT last_update FROM players WHERE puuid = ?', [puuid], async (err, row) => {
            if (err) {
                console.error("DB error checking player:", err);
                return res.status(500).json({ error: 'Database error' });
            }

            const currentTime = Date.now();
            if (row && row.last_update && currentTime - row.last_update < 3600000) {
                console.log("Player data is up to date, fetching from DB");
                 db.all('SELECT * FROM matches WHERE puuid = ? ORDER BY gameCreation DESC LIMIT 20', [puuid], (matchErr, matchesFromDb) => {
                    if (matchErr) {
                        console.error("DB error fetching matches for cached player:", matchErr.message);
                        return res.status(500).json({ error: 'Database error while fetching cached matches.' });
                    }

                    if (!matchesFromDb || matchesFromDb.length === 0) {
                        return res.json({
                            message: 'No matches found in DB for this player (cache).',
                            matches: [],
                            overallWins: 0,
                            overallLosses: 0,
                            championWinRates: []
                        });
                    }

                    const totalMatches = matchesFromDb.length;
                    const overallWins = matchesFromDb.filter(match => match.win).length;
                    const overallLosses = totalMatches - overallWins;

                    const championStats = {};
                    matchesFromDb.forEach(match => {
                        if (!match.championName) return;
                        if (!championStats[match.championName]) {
                            championStats[match.championName] = { games: 0, wins: 0 };
                        }
                        championStats[match.championName].games++;
                        if (match.win) championStats[match.championName].wins++;
                    });

                    const championWinRates = Object.entries(championStats).map(([name, data]) => ({
                        championName: name,
                        gamesPlayed: data.games,
                        wins: data.wins
                    }))
                    .sort((a, b) => {
                        if (b.gamesPlayed !== a.gamesPlayed) {
                            return b.gamesPlayed - a.gamesPlayed;
                        }
                        return b.wins - a.wins;
                    })
                    .slice(0, 2);

                    console.log(`Returning cached stats for ${puuid}`);
                    return res.json({
                        matches: matchesFromDb,
                        overallWins,
                        overallLosses,
                        championWinRates
                    });
                });
                return;
            }

            db.run(
                'INSERT OR REPLACE INTO players (puuid, gameName, tagLine, region, last_update) VALUES (?, ?, ?, ?, ?)',
                [puuid, gameName, tagLine, region, currentTime],
                (err) => {
                    if (err) {
                        console.error("DB error inserting player:", err);
                    }
                }
            );

            console.log("Fetching matches for puuid:", puuid);
            const matchesUrl = `${RIOT_BASE_API_URL_MATCHES(region)}/${puuid}/ids?start=0&count=20&api_key=${RIOT_API_KEY}`;
            let matchesIds;

            try {
                const matchesResponse = await axios.get(matchesUrl);
                matchesIds = matchesResponse.data;
            } catch (error) {
                console.error('Error fetching match IDs', error.response?.data || error.message);
                return res.status(500).json({ error: 'Failed to fetch player matches from Riot API' });
            }

            if (!matchesIds || matchesIds.length === 0) {
                return res.status(200).json({
                    message: 'No matches found for this player',
                    matches: [],
                    overallWinRate: 0,
                    championWinRates: []
                });
            }

            const newMatchDetailsPromises = matchesIds.map(matchId => {
                return new Promise((resolve, reject) => {
                    db.get('SELECT * FROM matches WHERE match_id = ? AND puuid = ?', [matchId, puuid], async (err, matchRow) => {
                        if (err) return reject(new Error('DB error fetching match:' + err.message));
                        if (matchRow) {
                            return resolve(matchRow);
                        } else {
                            const matchDetailsUrl = `${RIOT_BASE_API_URL_MATCH(region)}/${matchId}?api_key=${RIOT_API_KEY}`;
                            try {
                                const detailResponse = await axios.get(matchDetailsUrl);
                                const matchData = detailResponse.data;
                                const participant = matchData.info.participants.find(p => p.puuid === puuid);

                                if (!participant) {
                                    console.warn(`Participant not found in match data for puuid: ${puuid}`);
                                    return resolve(null);
                                }

                                const newMatch = {
                                    match_id: matchId,
                                    puuid: puuid,
                                    gameMode: matchData.info.gameMode,
                                    kills: participant.kills,
                                    deaths: participant.deaths,
                                    assists: participant.assists,
                                    championName: participant.championName,
                                    win: participant.win,
                                    gameCreation: matchData.info.gameCreation
                                };

                                db.run(
                                    'INSERT INTO matches (match_id, puuid, gameMode, kills, deaths, assists, championName, win, gameCreation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                    [
                                        newMatch.match_id,
                                        newMatch.puuid,
                                        newMatch.gameMode,
                                        newMatch.kills,
                                        newMatch.deaths,
                                        newMatch.assists,
                                        newMatch.championName,
                                        newMatch.win,
                                        newMatch.gameCreation
                                    ],
                                    (err) => {
                                        if (err) {
                                            console.error("DB error inserting match:", err);
                                        } else {
                                            console.log("Match inserted into DB:", newMatch);
                                        }
                                    }
                                );
                                resolve(newMatch);
                            } catch (error) {
                                console.error('Error fetching match details', error.response?.data || error.message);
                                resolve(null);
                            }
                        }
                    });
                });
            });

            const allFetchedMatchDetails = (await Promise.all(newMatchDetailsPromises)).filter(m => m !== null);

            db.all('SELECT * FROM matches WHERE puuid = ? ORDER BY gameCreation DESC LIMIT 20', [puuid], (err, matchesFromDb) => {
                if (err) {
                    console.error("DB error fetching matches:", err);
                    return res.status(500).json({ error: 'Database error' });
                }

                const totalMatches = matchesFromDb.length;
                const overallWins = matchesFromDb.filter(match => match.win).length;
                const overallLosses = totalMatches - overallWins;


                const championStats = {};
                matchesFromDb.forEach(match => {
                    if (!championStats[match.championName]) {
                        championStats[match.championName] = { games: 0, wins: 0 };
                    }
                    championStats[match.championName].games++;
                    if (match.win) championStats[match.championName].wins++;
                });

                const championWinRates = Object.entries(championStats).map(([name, data]) => ({
                    championName: name,
                    gamesPlayed: data.games,
                    wins: data.wins
                }))
                .sort((a, b) => {
                    if (b.gamesPlayed !== a.gamesPlayed) {
                        return b.gamesPlayed - a.gamesPlayed;
                    }
                    return b.wins - a.wins;
                })
                .slice(0, 2);
                

                res.json({
                    matches: matchesFromDb,
                    overallWins,
                    overallLosses,
                    championWinRates
                });
            });
        });
    } catch (error) {
        console.error('Overall server error', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'An unexpected error occurred' });
        }
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
