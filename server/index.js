const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const csv = require('csv-parser'); // Install csv-parser to handle CSV parsing
const { Readable } = require('stream');

const PORT = 3000;

// Store games and players
const games = {};
const questions = {}
let intervalId;
let remainingTime = 10;

const multer = require('multer');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'trivia_source/'); // Save files to the 'uploads' folder
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // Use the original filename
    },
});

const upload = multer({ storage: storage });

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); // Random index between 0 and i
      [array[i], array[j]] = [array[j], array[i]];  // Swap elements
    }
    return array;
  }  

// Handle file uploads
app.post('/upload', upload.fields([{ name: 'questions' }, { name: 'answers' }]), (req, res) => {
  if (req.files) {
    console.log('Files uploaded:', req.files);
    res.json({ message: 'Files uploaded successfully.', files: req.files, });
  } else {
    res.status(400).json({ message: 'No files uploaded.' });
  }
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/build')));

// Define socket.io events
io.on('connection', (socket) => {
  console.log('A user connected, id: ', socket.id);

  // Handle game creation
  socket.on('create_game', ({questionsFilename, answersFilename}) => {
    const questionsPath = path.join(__dirname, 'trivia_source', questionsFilename);
    const answersPath = path.join(__dirname, 'trivia_source', answersFilename);

    // Check if both files exist
    if (!fs.existsSync(questionsPath) || !fs.existsSync(answersPath)) {
        socket.emit('error', 'Uploaded files not found on the server.');
        return;
    }

    // Parse the questions CSV
    const questions = {};
    fs.createReadStream(questionsPath)
        .pipe(csv())
        .on('data', (row) => {
        questions[row.id] = {question: row.question, type: row.type}; // Add each row to the questions array
        })
        .on('end', () => {
            console.log('Parsed Questions:', questions);

            // Parse the answers CSV
            const answers = {};
            fs.createReadStream(answersPath)
                .pipe(csv())
                .on('data', (row) => {
                answers[row.id] = {correctAnswer: row.correct_answer, options: [row.option_1, row.option_2, row.option_3].filter(option => option.length > 0)}; // Add each row to the answers array
                })
                .on('end', () => {
                console.log('Parsed Answers:', answers);

                const randomOrder = shuffleArray(Array.from({ length: Object.keys(questions).length }, (_, i) => i + 1));
                console.log(randomOrder);

                // Save the parsed data in the games object
                const gameId = Math.floor(1000 + Math.random() * 9000).toString();
                games[gameId] = {
                    host: socket.id,
                    players: {},
                    questions: questions,
                    answers: answers,
                    currentQuestion: 0,
                    randomOrder: randomOrder
                };

                // Send the game ID back to the host
                socket.join(gameId);
                socket.emit('game_created', gameId);
                console.log('Game created with ID:', gameId);
                });
        })
    .on('error', (err) => {
        console.error('Error reading questions file:', err);
        socket.emit('error', 'Error reading questions file.');
    });
  });

  // Handle joining a game
  socket.on('join_game', ({ gameId, playerName }) => {
    if (games[gameId]) {
      games[gameId].players[socket.id] = { id: socket.id, name: playerName, score: 0, answer: null, time: null};
      socket.join(gameId);

      console.log("info ", games[gameId].players, gameId, games[gameId].host);
      
      // Emit updated players list to all connected clients
      io.in(gameId).emit('update_game_info', games[gameId].players, gameId, games[gameId].host);
    }
  });

  // Handle starting the game
  socket.on('start_game', ({ gameId }) => {
    if (games[gameId]) {
        let game = games[gameId];
        let ind = game.randomOrder[game.currentQuestion];
        console.log(game);
        console.log(ind);
        let question = game.questions[ind.toString()].question;

        let answers = game.answers[ind.toString()].options;
        answers.push(game.answers[ind.toString()].correctAnswer);
        answers = shuffleArray(answers);
        console.log("shuffled answers, ", answers);
        console.log("answers in dict ", game.answers[ind.toString()]);

        io.in(gameId).emit('update_question', question, answers);

        socket.to(gameId).emit('changeView', 'player');
        socket.emit('changeView', 'host_game');

        games[gameId].questions[ind.toString()].startTime = Date.now();
        console.log("Question start time ", games[gameId].questions[ind.toString()].startTime);
        io.in(gameId).emit('timer_update', 10);
        startTimer(10, gameId, socket);
    }
  });

  function startTimer(duration, gameId, socket) {
    clearInterval(intervalId);
    let timeLeft = duration;
    const ind = games[gameId].randomOrder[games[gameId].currentQuestion];

    intervalId = setInterval(() => {
      if(games[gameId].questions[ind].answered) {
        clearInterval(intervalId);
        return;
      }

      console.log(timeLeft);
      timeLeft--;
      io.in(gameId).emit('timer_update', timeLeft);

      if (timeLeft <= 0) {
        clearInterval(intervalId);
        console.log('times up!');
        endQuestion(gameId, true, ind);
      }
    }, 1000);
  }

  socket.on('show_board', ({gameId}) => {
    if (games[gameId]) {
        io.in(gameId).emit('changeView', 'board');
    }
  });

  // Handle next question
  socket.on('next_question', ({ gameId }) => {
    console.log("gameId ", gameId, " currentQuestion ", games[gameId].currentQuestion, " question length ", Object.keys(games[gameId].questions).length);
    if (games[gameId] && games[gameId].currentQuestion < Object.keys(games[gameId].questions).length-1) {
        games[gameId].currentQuestion += 1;

        let game = games[gameId];
        let ind = game.randomOrder[game.currentQuestion].toString();        

        let question = game.questions[ind].question;

        let answers = game.answers[ind].options;
        answers.push(game.answers[ind].correctAnswer);
        answers = shuffleArray(answers);

        io.in(gameId).emit('update_question', question, answers);

        socket.to(gameId).emit('changeView', 'player');
        socket.emit('changeView', 'host_game');

        games[gameId].questions[ind.toString()].startTime = Date.now();
        console.log("Question start time ", games[gameId].questions[ind.toString()].startTime);
        io.in(gameId).emit('timer_update', 10);
        startTimer(10, gameId, socket);
    } else if (games[gameId] && games[gameId].currentQuestion == Object.keys(games[gameId].questions).length-1) {
        io.in(gameId).emit('changeView', 'board');
    } else {
        console.error('Error going to next question:', err);
        socket.emit('error', 'Error going to next question.');
    }
  });

  // Handle player answer submission
  socket.on('submit_answer', ({gameId, playerAnswer}) => {
    if (games[gameId]) {
        let ind = games[gameId].randomOrder[games[gameId].currentQuestion]
        const correctAnswer = games[gameId].answers[ind].correctAnswer;
        console.log("playerSelection ", playerAnswer, ", correct", correctAnswer);

        const player = games[gameId].players[socket.id];
        player.answer = playerAnswer;
        player.time = Date.now();
        console.log("player ", player.name, " answered at ", games[gameId].players[socket.id].time, " which is ", player.time - games[gameId].questions[ind].startTime, " microseconds after the question was shown.");

        endQuestion(gameId, false, ind);
    }
  });

  function endQuestion(gameId, timesUp, questionId) {
    const allAnswered = Object.values(games[gameId].players).every(p => p.answer !== null);
    console.log("endQuestion? allAnswered? ", allAnswered, " timesUp? ", timesUp);
    games[gameId].questions[questionId].answered = allAnswered;
    if(allAnswered || timesUp) {
        calculateScores(gameId, questionId);
        io.in(gameId).emit('changeView', 'board');
    }
  }

  // Function to calculate and assign points
  function calculateScores(gameId, questionId) {
    const game = games[gameId];
    const question = game.questions[questionId];
    if (!game) return;
  
    const players = Object.values(game.players);

    players.forEach((player) => {
        if(!player.time) {
            player.time = Date.now();
        }
    })
  
    console.log("calculating scores for players ", players);

    // Sort players by response time (ascending)
    const sortedPlayers = players.sort((a, b) => a.time - b.time);
  
    // Assign points based on speed (e.g., 10 points for the fastest, 5 for the second, etc.)
    sortedPlayers.forEach((player, index) => {
        console.log("playerAnswer", player.answer, " correctAnswer", game.answers[questionId].correctAnswer, " same?", game.answers[questionId].correctAnswer === player.answer, " toString same? ", new String(game.answers[questionId].correctAnswer).valueOf() === new String(player.answer).valueOf());
        if (new String(player.answer).valueOf() === new String(game.answers[questionId].correctAnswer).valueOf()) {
            const points = ((10000 / (player.time - question.startTime)) * 520) + (321 - index*2) + 100;
            player.score += Math.round(Math.max(points, 0)); // Prevent negative points
            console.log(`Player ${player.name} got the question right and earned ${Math.round(Math.max(points, 0))} points!`);
        } else {
            console.log(`Player ${player.name} got the question wrong or didn't answer in time.`);
        }
        player.answer = null;
    });

    io.in(gameId).emit('update_players', games[gameId].players);
  }

  // Handle player disconnection
  socket.on('disconnect', () => {
    for (const gameId in games) {
      const players = games[gameId].players;
      if (players[socket.id]) {
        delete players[socket.id];
        io.to(gameId).emit('update_players', players);
      }
    }
    console.log('A user disconnected');
  });
});

// Catch-all route to serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
