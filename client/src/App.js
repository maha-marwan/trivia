import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

// Connect to the server
const socket = io('http://localhost:3000');

function App() {
  const [view, setView] = useState('dashboard'); // Options: 'dashboard', 'login', 'host_dashboard', 'join', 'lobby', 'player', 'host_game'
  const [currentUserId, setCurrentUserId] = useState('');
  const [gameId, setGameId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState({});
  const [hostId, setHostId] = useState('');
  const [hostUsername, setHostUsername] = useState('');
  const [hostPassword, setHostPassword] = useState('');
  const [questionsFile, setQuestionsFile] = useState(null);
  const [answersFile, setAnswersFile] = useState(null);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState([]);
  const [playerAnswer, setPlayerAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState('');

  // Join a game as a player
  const joinGame = () => {
    socket.emit('join_game', { gameId, playerName });
    setView('lobby');
    setCurrentUserId(socket.id);
  };

  const submitAnswer = () => {
    socket.emit('submit_answer', { gameId, playerAnswer });
  }

  // host functionality
  const loginAsHost = () => {
    if (hostUsername === 's_admin' && hostPassword === 'mkWedding24') {
      setView('host_dashboard');
    } else {
      alert('Invalid username or password.');
    }
  };

  const handleFileUpload = (event, type) => {
    if (type === 'questions') setQuestionsFile(event.target.files[0]);
    if (type === 'answers') setAnswersFile(event.target.files[0]);
  };

  // Upload files to the server
  const uploadFiles = () => {
    const formData = new FormData();
    if (questionsFile) formData.append('questions', questionsFile);
    if (answersFile) formData.append('answers', answersFile);

    fetch('http://localhost:3000/upload', {
      method: 'POST',
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => alert('Files uploaded successfully.'))
      .catch((err) => alert('Error uploading files: ' + err));
  };

  // Create a game as a host
  const hostGame = () => {
    socket.emit('create_game', { questionsFilename: questionsFile.name, answersFilename: answersFile.name});
    setView('lobby');
    setHostId(socket.id);
    setCurrentUserId(socket.id);
    console.log("host currentUserId, ", socket.id);
  };

  // Emit start game event
  const startGame = () => {
    socket.emit('start_game', { gameId: gameId });
    console.log("socket.id ", socket.id);
    console.log("hostId ", hostId);
    if(socket.id === hostId) {
      setView('host_game');
    }
  };

  // Emit next question event
  const nextQuestion = () => {
    socket.emit('next_question', { gameId: gameId });
  };
  
  const showLeaderBoard = () => {
    socket.emit('show_board', { gameId: gameId });
  };

  useEffect(() => {
    // Listen for game creation and receive the game ID
    socket.on('game_created', (id) => {
      setGameId(id);
    });

    // Listen for question updates
    socket.on('update_question', (question, options) => {
      setQuestion(question);
      setOptions(options);
    });

    // Listen for player updates
    socket.on('update_players', (players) => {
      setPlayers(players);
    });

    socket.on('update_game_info', (players, gameId, hostId) => {
      setGameId(gameId);
      setHostId(hostId);
      setPlayers(players);
    });

    socket.on('changeView', (view) => {
      setView(view);
    });

    socket.on('timer_update', (remainingTime) => {
      setTimeLeft(remainingTime);
    });
  }, []);

  return (
    <div className="App">
      {view === 'dashboard' && (
        <div className="dashboard-container">
          <h1>Trivia Game Dashboard</h1>
          <button className="button" onClick={() => setView('login')}>
            Log in as Host
          </button>
          <button className="button" onClick={() => setView('join')}>
            Join a Game
          </button>
        </div>
      )}

      {view === 'login' && (
        <div className="login-container">
          <h2>Host Login</h2>
          <input
            className="input"
            placeholder="Username"
            value={hostUsername}
            onChange={(e) => setHostUsername(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={hostPassword}
            onChange={(e) => setHostPassword(e.target.value)}
          />
          <button className="button" onClick={loginAsHost}>
            Log In
          </button>
        </div>
      )}

      {view === 'host_dashboard' && (
        <div className="host-dashboard">
          <h2>Host Dashboard</h2>
          <div>
            <label>Upload Questions CSV:</label>
            <input type="file" onChange={(e) => handleFileUpload(e, 'questions')} />
          </div>
          <div>
            <label>Upload Answers CSV:</label>
            <input type="file" onChange={(e) => handleFileUpload(e, 'answers')} />
          </div>
          <button className="button" onClick={uploadFiles}>
            Upload Files
          </button>
          <button className="button" onClick={hostGame}>
            Create Game
          </button>
        </div>
      )}

      {view === 'join' && (
        <div className="join-container">
          <h1>MK Wedding 2024</h1>
          <h2>Join using a game ID and your name (First and last name)</h2>
          <input
            className="input"
            placeholder="Enter Game ID"
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
          />
          <input
            className="input"
            placeholder="Enter Your Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <button className="button" onClick={joinGame}>
            Join Game
          </button>
        </div>
      )}

      {view === 'player' && (
        <div className="player-container">
          <h1>Game ID: {gameId}</h1>
          <h2>{question}</h2>
          <h3>Timer: {timeLeft}</h3>
          <div className="options">
            {options.map((option, index) => (
              <button
                key={index}
                className={`option-button ${playerAnswer === option ? 'selected' : ''}`}
                onClick={() => {console.log("selected ", option); setPlayerAnswer(option)}}
              >
                {option}
              </button>
            ))}
          </div>
          <button className="button submit-button" onClick={submitAnswer}>
            Submit Answer
          </button>
        </div>
      )}

      {view === 'host_game' && (
        <div className="player-container">
          <h1>Game ID: {gameId}</h1>
          <h2>{question}</h2>
          <h3>Timer: {timeLeft}</h3>
          <div className="options">
            {options.map((option, index) => (
              <button
                key={index}
                className="option-button"
              >
                {option}
              </button>
            ))}
          </div>
          <button className="button" onClick={showLeaderBoard}>
            Show Board
          </button>
        </div>
      )}

      {view === 'board' && (
        <div className="leaderboard">
        <h1>Game ID: {gameId}</h1>
        <h2>Leaderboard:</h2>
          {Object.values(players).map((player) => (
            <p key={player.id} class="leaderboard-item">
              {player.name} - {player.score} points
            </p>
          ))}

          {hostId === currentUserId ? (
            <button className="button" onClick={nextQuestion}>
              Next Question
            </button>
          ) : (
            <p></p>
          )}
        </div>
      )}

      {view === 'lobby' && (
        <div className="host-container">
          <h2>Game ID: {gameId}</h2>
          {hostId === currentUserId ? (
            <button className="button" onClick={startGame}>
              Start Game
            </button>
          ) : (
            <p>Waiting for host to start the game...</p>
          )}
          <div className="player_list">
            <h3>Players:</h3>
            {Object.keys(players).length === 0 ? (
              <p>Waiting for players to join...</p>
            ) : (
              <ul>
                {Object.values(players).map((player) => (
                  <li key={player.id}>
                    {player.name} - {player.score} points
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
