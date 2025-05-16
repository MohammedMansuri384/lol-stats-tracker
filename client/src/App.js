import React, { useState } from "react";
import axios from "axios";
import './App.css';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

function App() {
    const [gameName, setGameName] = useState("");
    const [tagLine, setTagLine] = useState("");
    const [region, setRegion] = useState("na1"); // Default region
    const [playerStats, setPlayerStats] = useState(null); // Initial state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const regions = [
        { value: "na1", label: "North America" },
        { value: "euw1", label: "Europe West" },
        { value: "eun1", label: "Europe Nordic & East" },
        { value: "kr", label: "Korea" },
        { value: "jp1", label: "Japan" },
        { value: "br1", label: "Brazil" },
        { value: "la1", label: "Latin America North" },
        { value: "la2", label: "Latin America South" },
        { value: "oc1", label: "Oceania" },
        { value: "tr1", label: "Turkey" },
        { value: "ru", label: "Russia" },
        { value: "ph2", label: "Philippines" },
        { value: "sg2", label: "Singapore" },
        { value: "th2", label: "Thailand" },
        { value: "tw2", label: "Taiwan" },
        { value: "vn2", label: "Vietnam" },
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!gameName.trim() || !tagLine.trim()) {
            setError("Please enter both Game Name and Tag Line");
            return;
        }
        setLoading(true);
        setError(null);
        setPlayerStats(null);

        try {
            const response = await axios.get(`http://localhost:3001/api/player/${gameName.trim()}/${tagLine.trim()}/${region}/stats`);
            setPlayerStats(response.data);
        } catch (err) {
            console.error('Error fetching player stats:', err);
            if (err.response && err.response.data && err.response.data.error) {
                setError(err.response.data.error);
            } else if (err.message) {
                setError(err.message);
            } else {
                setError("An error occurred while fetching player stats.");
            }
        } finally {
            setLoading(false);
        }
    };

    const getPieChartData = (wins, losses) => {
        const data = [];
        if (wins > 0) data.push({ name: 'Wins', value: wins });
        if (losses > 0) data.push({ name: 'Losses', value: losses });
        if (wins === 0 && losses === 0 && data.length === 0) {
            data.push({ name: 'N/A', value: 1 });
        }
        return data;
    };

    return (
        <div className="App">
            {/* Header will be part of the search form when stats are shown */}
            <header className={`App-header ${playerStats ? 'hide-initial-header' : ''}`}>
                <h1>LoL Stat Tracker</h1>
            </header>

            <div className={`search-section ${playerStats ? 'search-section-active' : ''}`}>
                <form onSubmit={handleSubmit} className="search-form">
                    <div className="input-group">
                        <input
                            type="text"
                            value={gameName}
                            onChange={(e) => setGameName(e.target.value)}
                            placeholder="Game Name"
                            required
                        />
                        <span className="tagline-separator">#</span>
                        <input
                            type="text"
                            value={tagLine}
                            onChange={(e) => setTagLine(e.target.value)}
                            placeholder="TAG"
                            required
                            className="tagline-input"
                        />
                    </div>
                    <select value={region} onChange={(e) => setRegion(e.target.value)} className="region-select">
                        {regions.map((r) => (
                            <option key={r.value} value={r.value}>
                                {r.label}
                            </option>
                        ))}
                    </select>
                    <button type="submit" disabled={loading} className="search-button">
                        {loading ? <div className="loader"></div> : 'Search'}
                    </button>
                </form>
            </div>

            <main className="content-area">
                {error && <p className="error-message">{error}</p>}

                {playerStats && (
                    <div className="player-stats-dashboard">
                        <div className="player-summary">
                            <h2>{gameName}#{tagLine} <span className="region-display">({region.toUpperCase()})</span></h2>
                            {playerStats.message && !playerStats.matches?.length && <p className="info-message">{playerStats.message}</p>}
                        </div>

                        {(typeof playerStats.overallWins === 'number' && typeof playerStats.overallLosses === 'number' && (playerStats.overallWins > 0 || playerStats.overallLosses > 0)) && (
                            <div className="stats-cards-container">
                                <div className="stat-card overall-winrate-card">
                                    <h3>Overall (Last {playerStats.overallWins + playerStats.overallLosses} Games)</h3>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <PieChart>
                                            <Pie
                                                dataKey="value"
                                                data={getPieChartData(playerStats.overallWins, playerStats.overallLosses)}
                                                innerRadius={50}
                                                outerRadius={70}
                                                paddingAngle={2}
                                                labelLine={false}
                                                label={({ name, percent, value }) => (value && name !== 'N/A') ? `${name}: ${(percent * 100).toFixed(0)}%` : (name === 'N/A' ? '' : '')}
                                            >
                                                {getPieChartData(playerStats.overallWins, playerStats.overallLosses).map((entry, index) => (
                                                    <Cell key={`cell-overall-${index}`} fill={entry.name === 'Wins' ? '#5383e8' : entry.name === 'Losses' ? '#e84057' : '#7b858e'} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                            {/* <Legend /> */}
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <p className="win-loss-text">W: {playerStats.overallWins} - L: {playerStats.overallLosses}</p>
                                </div>

                                {playerStats.championWinRates && playerStats.championWinRates.length > 0 && (
                                    playerStats.championWinRates.map((champ, index) => {
                                        const wins = champ.wins;
                                        const losses = champ.gamesPlayed - champ.wins;
                                        return (
                                            <div key={index} className="stat-card champion-winrate-card">
                                                <h4>{champ.championName} ({champ.gamesPlayed}G)</h4>
                                                <ResponsiveContainer width="100%" height={180}>
                                                    <PieChart>
                                                        <Pie
                                                            dataKey="value"
                                                            data={getPieChartData(wins, losses)}
                                                            innerRadius={40}
                                                            outerRadius={60}
                                                            paddingAngle={2}
                                                            labelLine={false}
                                                            label={({ name, percent, value }) => (value && name !== 'N/A') ? `${(percent * 100).toFixed(0)}%` : (name === 'N/A' ? 'N/A' : '')}
                                                        >
                                                            {getPieChartData(wins, losses).map((entry, i) => (
                                                                <Cell key={`cell-champ-${index}-${i}`} fill={entry.name === 'Wins' ? '#5383e8' : entry.name === 'Losses' ? '#e84057' : '#7b858e'} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip formatter={(value, name) => [`${value} ${name.toLowerCase()}`]}/>
                                                    </PieChart>
                                                </ResponsiveContainer>
                                                 <p className="win-loss-text">W: {wins} - L: {losses}</p>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {playerStats.matches && playerStats.matches.length > 0 && (
                            <div className="match-history-section">
                                <h3>Recent Matches</h3>
                                <ul className="match-list">
                                    {playerStats.matches.map((match) => (
                                        <li key={match.match_id} className={`match-item ${match.win ? 'match-win' : 'match-loss'}`}>
                                            <div className="match-overview">
                                                <div className="game-type">{match.gameMode ? match.gameMode.replace(/_/g, ' ') : 'N/A'}</div>
                                                <div className={`game-result ${match.win ? 'victory-text' : 'defeat-text'}`}>
                                                    {match.win ? 'Victory' : 'Defeat'}
                                                </div>
                                                <div className="game-time">{new Date(match.gameCreation).toLocaleDateString()}</div>
                                            </div>
                                            <div className="match-player-details">
                                                {/* Placeholder for champ icon */}
                                                <div className="champion-icon-placeholder">{match.championName ? match.championName.substring(0,2).toUpperCase() : 'N/A'}</div>
                                                <div className="champion-name-display">{match.championName || 'N/A'}</div>
                                                {/* Add Summoner Spells and Runes placeholders if you plan to fetch them */}
                                            </div>
                                            <div className="match-kda">
                                                <span className="kda-ratio">{match.deaths === 0 ? 'Perfect' : ((match.kills + match.assists) / match.deaths).toFixed(2)} KDA</span>
                                                <span className="kda-actual">{match.kills} / {match.deaths} / {match.assists}</span>
                                            </div>
                                            {/* Add other stats like CS, vision, items as placeholders or actual data */}
                                            <div className="match-actions">
                                                {/* Placeholder for view details button or similar */}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                         <button className="search-another-btn" onClick={() => {
                            setPlayerStats(null);
                            setGameName("");
                            setTagLine("");
                            setError(null);
                        }}>
                            Search Another Player
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
export default App;