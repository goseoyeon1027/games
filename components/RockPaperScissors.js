'use client';

import React, { useState, useEffect, useRef } from 'react';
import Script from 'next/script';

const MODEL_URL = "https://teachablemachine.withgoogle.com/models/PuBwXDDH6/";

const RockPaperScissors = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [model, setModel] = useState(null);
  const [webcam, setWebcam] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [bestPrediction, setBestPrediction] = useState("인식 대기 중...");
  
  // Game State
  const [playerScore, setPlayerScore] = useState(0);
  const [computerScore, setComputerScore] = useState(0);
  const [playerHand, setPlayerHand] = useState("❓");
  const [computerHand, setComputerHand] = useState("❓");
  const [gameResult, setGameResult] = useState("준비되셨나요?");
  const [resultClass, setResultClass] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameHistory, setGameHistory] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeedMode, setIsSpeedMode] = useState(false);
  const [isBestOfFive, setIsBestOfFive] = useState(false);
  const [countdownMsg, setCountdownMsg] = useState("");
  const [showCountdown, setShowCountdown] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalGames: 0,
    wins: 0,
    handCounts: { "가위": 0, "바위": 0, "보": 0 }
  });

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const predictionRef = useRef({ class: "", prob: 0 });
  const requestRef = useRef();

  const emojiMap = {
    "가위": "✌️",
    "바위": "✊",
    "보": "🖐",
    "unknown": "❓"
  };

  const TARGET_WINS = 3;

  // Sound Logic
  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const playTone = (freq, duration, type = 'sine', startTime = 0) => {
    if (isMuted) return;
    initAudio();

    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);

    gain.gain.setValueAtTime(0.3, ctx.currentTime + startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + startTime);
    osc.stop(ctx.currentTime + startTime + duration);
  }

  const playGameSound = (type) => {
    switch (type) {
      case 'countdown': playTone(800, 0.1); break;
      case 'shutter': playTone(1200, 0.05, 'square'); break;
      case 'win':
        playTone(261.63, 0.15, 'sine', 0);
        playTone(329.63, 0.15, 'sine', 0.15);
        playTone(392.00, 0.3, 'sine', 0.3);
        break;
      case 'lose':
        playTone(392.00, 0.15, 'sine', 0);
        playTone(329.63, 0.15, 'sine', 0.15);
        playTone(261.63, 0.3, 'sine', 0.3);
        break;
      case 'draw':
        playTone(440.00, 0.1, 'sine', 0);
        playTone(440.00, 0.1, 'sine', 0.15);
        break;
      case 'click': playTone(600, 0.05); break;
    }
  };

  const initGame = async () => {
    try {
      const modelURL = MODEL_URL + "model.json";
      const metadataURL = MODEL_URL + "metadata.json";

      const loadedModel = await window.tmImage.load(modelURL, metadataURL);
      setModel(loadedModel);

      const flip = true; 
      const webCamInstance = new window.tmImage.Webcam(400, 400, flip); 
      await webCamInstance.setup(); 
      await webCamInstance.play();
      setWebcam(webCamInstance);

      if (canvasRef.current) {
        canvasRef.current.appendChild(webCamInstance.canvas);
      }
      setIsLoaded(true);
    } catch (error) {
      console.error("Initialization error:", error);
      setGameResult("카메라 연결 실패");
    }
  };

  const predict = async () => {
    if (!webcam || !model) return;
    
    webcam.update();
    const prediction = await model.predict(webcam.canvas);
    
    let highestProbability = 0;
    let bestClass = "";

    setPredictions(prediction);

    prediction.forEach(p => {
      if (p.probability > highestProbability) {
        highestProbability = p.probability;
        bestClass = p.className;
      }
    });

    predictionRef.current = { class: bestClass, prob: highestProbability };

    if (highestProbability > 0.5) setBestPrediction(bestClass);
    else setBestPrediction("분석 중...");

    requestRef.current = requestAnimationFrame(predict);
  };

  useEffect(() => {
    if (isLoaded && webcam && model) {
      requestRef.current = requestAnimationFrame(predict);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isLoaded, webcam, model]);

  const startGame = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    playGameSound('click');
    
    const countdown = ["3", "2", "1", "찰칵!"];
    const intervalTime = isSpeedMode ? 400 : 1000;
    
    setShowCountdown(true);
    
    for (let msg of countdown) {
      setCountdownMsg(msg);
      setGameResult(msg);
      if (msg === "찰칵!") playGameSound('shutter');
      else playGameSound('countdown');
      await new Promise(resolve => setTimeout(resolve, intervalTime));
    }

    setShowCountdown(false);
    processResult();
  };

  const processResult = () => {
    const { class: bestClass, prob } = predictionRef.current;

    if (prob < 0.6) {
      setGameResult("인식 실패! 다시 시도해주세요");
      setResultClass("lose");
      playGameSound('lose');
      setIsPlaying(false);
      return;
    }

    const playerChoice = bestClass;
    const choices = ["가위", "바위", "보"];
    const computerChoice = choices[Math.floor(Math.random() * 3)];

    let result = "";
    if (playerChoice === computerChoice) result = "draw";
    else if (
      (playerChoice === "가위" && computerChoice === "보") ||
      (playerChoice === "바위" && computerChoice === "가위") ||
      (playerChoice === "보" && computerChoice === "바위")
    ) result = "win";
    else result = "lose";

    setPlayerHand(emojiMap[playerChoice]);
    setComputerHand(emojiMap[computerChoice]);
    
    // Stats update
    setStats(prev => ({
      totalGames: prev.totalGames + 1,
      wins: result === 'win' ? prev.wins + 1 : prev.wins,
      handCounts: {
        ...prev.handCounts,
        [playerChoice]: prev.handCounts[playerChoice] + 1
      }
    }));

    if (result === "win") {
      setPlayerScore(s => s + 1);
      setGameResult("고서연 승리! 🎉");
      setResultClass("win");
      playGameSound('win');
    } else if (result === "lose") {
      setComputerScore(s => s + 1);
      setGameResult("패배.. 😢");
      setResultClass("lose");
      playGameSound('lose');
    } else {
      setGameResult("무승부 🤝");
      setResultClass("draw");
      playGameSound('draw');
    }

    setGameHistory(prev => {
      const icons = { win: "⭕", lose: "❌", draw: "➖" };
      const newHistory = [icons[result], ...prev];
      return newHistory.slice(0, 5);
    });

    if (isBestOfFive) {
      if ((result === 'win' && playerScore + 1 >= TARGET_WINS) || (result === 'lose' && computerScore + 1 >= TARGET_WINS)) {
        const winner = (result === 'win' && playerScore + 1 >= TARGET_WINS) ? "고서연" : "컴퓨터";
        setGameResult(`🏆 ${winner} 최종 우승!!!`);
        setResultClass(result === 'win' ? 'win' : 'lose');
        if (result === 'win') {
          for(let i=0; i<3; i++) setTimeout(createConfetti, i*500);
        }
        setTimeout(() => {
          setIsPlaying(false);
          // Optional: reset just the session scores but keep stats
        }, 4000);
        return;
      } else {
        setTimeout(() => {
          setPlayerHand("❓");
          setComputerHand("❓");
          startGame(); // Auto next round
        }, 2000);
      }
    } else {
      setTimeout(() => {
        setIsPlaying(false);
      }, 2000);
    }
  };

  const createConfetti = () => {
    const rpsFull = document.querySelector('.rps-game-wrapper');
    if (!rpsFull) return;
    const colors = ['#FFD700', '#7B61FF', '#00AFFF'];
    for (let i = 0; i < 30; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.top = '-20px';
        confetti.style.position = 'absolute';
        confetti.style.width = '10px';
        confetti.style.height = '10px';
        confetti.style.borderRadius = '50%';
        confetti.style.zIndex = '1000';
        confetti.style.animation = `fall ${1 + Math.random() * 2}s linear forwards`;
        rpsFull.appendChild(confetti);
        setTimeout(() => confetti.remove(), 3000);
    }
  };

  const resetGame = () => {
    setPlayerScore(0);
    setComputerScore(0);
    setGameHistory([]);
    setIsPlaying(false);
    setPlayerHand("❓");
    setComputerHand("❓");
    setGameResult("준비되셨나요?");
    setResultClass("");
    setStats({
      totalGames: 0,
      wins: 0,
      handCounts: { "가위": 0, "바위": 0, "보": 0 }
    });
    playGameSound('click');
  };

  return (
    <>
      <Script 
        src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js" 
        strategy="afterInteractive"
      />
      <Script 
        src="https://cdn.jsdelivr.net/npm/@teachablemachine/image@latest/dist/teachablemachine-image.min.js" 
        strategy="afterInteractive"
        onLoad={() => {
          if (window.tmImage) initGame();
        }}
      />

      <div className="rps-game-wrapper">
        <div className="rps-grid">
          {/* Webcam Section */}
          <div className="rps-panel webcam-panel relative">
             {!isLoaded && (
               <div className="loading-overlay">
                 <div className="spinner"></div>
                 <p>AI 모델 불러오는 중...</p>
               </div>
             )}
             <div className="webcam-view" ref={canvasRef}></div>
             <div className="prediction-box">
                <div className="best-label">{bestPrediction}</div>
                <div className="prediction-bars">
                  {predictions.map(p => (
                    <div key={p.className} className="p-bar-item">
                      <span className="p-name">{p.className}</span>
                      <div className="p-bar-bg">
                        <div 
                          className={`p-bar-fill ${p.className} ${p.probability > 0.8 ? 'glow' : ''}`}
                          style={{ width: `${(p.probability * 100).toFixed(0)}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
             </div>
          </div>

          {/* Game Control Section */}
          <div className="rps-panel game-panel">
            <div className="game-header">
              <button className="mute-toggle" onClick={() => setIsMuted(!isMuted)}>
                {isMuted ? "🔇" : "🔊"}
              </button>
            </div>

            <div className="score-display">
               <div className="score-box">
                 <span className="name">User</span>
                 <span className="val">{playerScore}</span>
               </div>
               <div className="vs-sign">VS</div>
               <div className="score-box">
                 <span className="name">AI</span>
                 <span className="val">{computerScore}</span>
               </div>
            </div>

            <div className="battle-view">
              <div className="emoji-set">
                <span className={`emoji-hand ${resultClass === 'draw' ? 'shake' : ''}`}>{playerHand}</span>
                <span className="spark">⚡</span>
                <span className={`emoji-hand ${resultClass === 'draw' ? 'shake' : ''}`}>{computerHand}</span>
              </div>
              <div className={`result-msg ${resultClass}`}>{gameResult}</div>
            </div>

            <div className="controls">
               <div className="toggles">
                  <label className="switch">
                    <input type="checkbox" checked={isSpeedMode} onChange={(e) => setIsSpeedMode(e.target.checked)} disabled={isPlaying} />
                    <span className="slider"></span>
                    <span className="lbl">⚡ 스피드</span>
                  </label>
                  <label className="switch">
                    <input type="checkbox" checked={isBestOfFive} onChange={(e) => setIsBestOfFive(e.target.checked)} disabled={isPlaying} />
                    <span className="slider"></span>
                    <span className="lbl">🏆 5판3승</span>
                  </label>
               </div>
               <button className="btn-start" onClick={startGame} disabled={isPlaying || !isLoaded}>
                 {isPlaying ? '대결 중...' : '🎮 게임 시작'}
               </button>
               <button className="btn-reset" onClick={resetGame}>점수 초기화</button>
            </div>

            <div className="history-tray">
              <div className="lbl">최근 기록</div>
              <div className="h-list">
                {gameHistory.length > 0 ? gameHistory.map((h, i) => (
                  <span key={i} className="h-item">{h}</span>
                )) : <span className="empty">기록 없음</span>}
              </div>
            </div>

            <div className="stats-box">
               <div className="stat">
                 <span className="v">{stats.totalGames}</span>
                 <span className="l">총 게임</span>
               </div>
               <div className="stat">
                 <span className="v">{stats.totalGames > 0 ? Math.round((stats.wins / stats.totalGames)*100) : 0}%</span>
                 <span className="l">승률</span>
               </div>
               <div className="stat">
                 <span className="v">{stats.totalGames > 0 ? Object.entries(stats.handCounts).sort((a,b)=>b[1]-a[1])[0][0] : '-'}</span>
                 <span className="l">선호</span>
               </div>
            </div>
          </div>
        </div>

        {showCountdown && (
          <div className="countdown-fs">
            <div className="count-txt animate-zoom">{countdownMsg}</div>
          </div>
        )}

        <style jsx>{`
          .rps-game-wrapper {
            width: 100%;
            max-width: 1000px;
            margin: 0 auto;
          }
          .rps-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
            align-items: start;
          }
          .rps-panel {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 1.5rem;
          }
          .webcam-panel {
            min-height: 500px;
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          .webcam-view {
            width: 100%;
            height: 400px;
            max-width: 400px;
            margin: 0 auto;
            background: #000;
            border-radius: 16px;
            overflow: hidden;
            border: 2px solid rgba(255, 255, 255, 0.05);
          }
          .webcam-view :global(canvas) {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover;
          }
          .prediction-box {
            text-align: center;
          }
          .best-label {
            font-size: 2rem;
            font-weight: 800;
            color: var(--secondary-blue);
            margin-bottom: 1rem;
          }
          .prediction-bars {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }
          .p-bar-item {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .p-name { width: 50px; font-size: 0.8rem; opacity: 0.8; }
          .p-bar-bg { flex: 1; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
          .p-bar-fill { height: 100%; transition: width 0.3s ease; }
          .p-bar-fill.가위 { background: #FF6B6B; }
          .p-bar-fill.바위 { background: #4ECDC4; }
          .p-bar-fill.보 { background: #45B7D1; }
          .p-bar-fill.glow { box-shadow: 0 0 10px rgba(255,255,255,0.5); filter: brightness(1.2); }

          .score-display {
            display: flex;
            justify-content: space-around;
            align-items: center;
            background: rgba(255,255,255,0.03);
            border-radius: 16px;
            padding: 1rem;
            margin-bottom: 1.5rem;
          }
          .score-box { display: flex; flex-direction: column; align-items: center; }
          .score-box .name { font-size: 0.7rem; opacity: 0.6; }
          .score-box .val { font-size: 2.5rem; font-weight: 800; }
          .vs-sign { font-weight: 900; color: #FFD700; }

          .battle-view { text-align: center; margin-bottom: 2rem; }
          .emoji-set { display: flex; justify-content: center; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
          .emoji-hand { font-size: 3.5rem; }
          .result-msg { font-size: 1.2rem; font-weight: 700; min-height: 1.8rem; }
          .result-msg.win { color: #FFD700; }
          .result-msg.lose { color: #FF6B6B; }

          .controls { display: flex; flex-direction: column; gap: 1rem; align-items: center; }
          .toggles { display: flex; gap: 1rem; }
          .switch { display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 0.8rem; }
          .switch input { display: none; }
          .slider { width: 30px; height: 16px; background: rgba(255,255,255,0.1); border-radius: 10px; position: relative; transition: 0.3s; }
          .slider:before { content: ""; position: absolute; width: 10px; height: 10px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s; }
          input:checked + .slider { background: var(--primary-blue); }
          input:checked + .slider:before { transform: translateX(14px); }

          .btn-start {
            width: 100%;
            background: linear-gradient(90deg, var(--primary-blue), var(--primary-purple));
            border: none;
            padding: 1rem;
            border-radius: 50px;
            color: white;
            font-size: 1.1rem;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            transition: 0.3s;
          }
          .btn-start:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
          .btn-start:disabled { opacity: 0.5; cursor: not-allowed; }
          .btn-reset { background: none; border: none; color: rgba(255,255,255,0.4); cursor: pointer; font-size: 0.8rem; }

          .history-tray { margin-top: 1.5rem; text-align: center; }
          .h-list { display: flex; justify-content: center; gap: 5px; margin-top: 0.5rem; }
          .h-item { width: 30px; height: 30px; display: flex; alignItems: center; justifyContent: center; background: rgba(255,255,255,0.05); border-radius: 8px; }

          .stats-box { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 1.5rem; }
          .stat { background: rgba(255,255,255,0.03); padding: 0.5rem; border-radius: 12px; display: flex; flex-direction: column; align-items: center; }
          .stat .v { font-size: 1.1rem; font-weight: 700; }
          .stat .l { font-size: 0.6rem; opacity: 0.5; }

          .loading-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; alignItems: center; justifyContent: center; background: rgba(0,0,0,0.5); z-index: 10; border-radius: 24px; }
          .spinner { width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid var(--primary-blue); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px; }

          .countdown-fs { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; alignItems: center; justifyContent: center; z-index: 100; backdrop-filter: blur(10px); }
          .count-txt { font-size: 8rem; font-weight: 900; color: white; text-shadow: 0 0 30px rgba(255,255,255,0.5); }
          
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes zoom { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1.2); opacity: 1; } }
          .animate-zoom { animation: zoom 0.5s ease-out forwards; }
          .shake { animation: shake 0.5s ease-in-out infinite; }
          @keyframes shake { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-10deg); } 75% { transform: rotate(10deg); } }

          @media (max-width: 768px) {
            .rps-grid { grid-template-columns: 1fr; }
          }

          @keyframes fall {
            to { transform: translateY(600px) rotate(720deg); opacity: 0; }
          }
        `}</style>
      </div>
    </>
  );
};

export default RockPaperScissors;
