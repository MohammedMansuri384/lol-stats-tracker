const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./lol_stats.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Error opening database ' + err.message);
    } else {
        console.log('Connected to the SQLite database.');
        createTables();
    }
}
);

function createTables() {
    const createPlayersTable = `
        CREATE TABLE IF NOT EXISTS players (
        puuid TEXT PRIMARY KEY,
        gameName TEXT,
        tagLine TEXT,
        region TEXT,
        last_update INTEGER
    )`;
    const createMatchesTable = `
        CREATE TABLE IF NOT EXISTS matches (
        match_id TEXT PRIMARY KEY,
        puuid TEXT,
        gameMode TEXT,
        kills INTEGER,
        deaths INTEGER,
        assists INTEGER,
        championName TEXT,
        win BOOLEAN,
        gameCreation INTEGER,
        FOREIGN KEY (puuid) REFERENCES players(puuid)
    )`;

    db.serialize(() => {
        db.run(createPlayersTable, (err) => {
            if (err) {
                console.error('Error creating players table: ' + err.message);
            } else {
                console.log('Players table created or already exists.');
            }
        });

        db.run(createMatchesTable, (err) => {
            if (err) {
                console.error('Error creating matches table: ' + err.message);
            } else {
                console.log('Matches table created or already exists.');
            }
        });
    }
    );
}

module.exports = db;