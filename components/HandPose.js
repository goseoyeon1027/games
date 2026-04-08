'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const HandPose = () => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [detector, setDetector] = useState(null);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [statusText, setStatusText] = useState("🔄 핸드 모델 로딩 중...");

    // Gesture & Debug State
    const [debugData, setDebugData] = useState([]);
    const [confirmedGesture, setConfirmedGesture] = useState({ id: 'NONE', emoji: '✨', name: '자유 제스처' });

    // Game State
    const [isPlaying, setIsPlaying] = useState(false);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(30);
    const [isGameOver, setIsGameOver] = useState(false);
    const [mission, setMission] = useState({ id: 'THUMBS_UP', emoji: '👍', name: '엄지척' });
    const [gauge, setGauge] = useState(0); // 0 to 100
    const [showSuccess, setShowSuccess] = useState(false);
    const [activeMode, setActiveMode] = useState('basic');

    const requestRef = useRef();
    const intervalRef = useRef();
    const fingerHistoryRef = useRef([]);
    const gestureHistoryRef = useRef([]);
    const lastTimeRef = useRef(performance.now());
    const audioCtxRef = useRef(null);
    const gameRef = useRef({ isPlaying: false, missionId: 'THUMBS_UP' });

    // Sync game state to ref for access in high-speed loop (avoiding closure traps)
    useEffect(() => {
        gameRef.current.isPlaying = isPlaying;
        gameRef.current.missionId = mission.id;
    }, [isPlaying, mission]);

    const GESTURES = {
        OK: { id: 'OK', emoji: '👌', name: 'OK' },
        V: { id: 'V', emoji: '✌️', name: 'V' },
        THUMBS_UP: { id: 'THUMBS_UP', emoji: '👍', name: '엄지척' },
        FIST: { id: 'FIST', emoji: '✊', name: '주먹' },
        PAPER: { id: 'PAPER', emoji: '🖐', name: '보' },
        NONE: { id: 'NONE', emoji: '✨', name: '자유 제스처' }
    };

    const MISSION_POOL = ['OK', 'V', 'THUMBS_UP', 'FIST', 'PAPER'];

    // --- Audio Logic ---
    const initAudio = () => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
    };

    const playSuccessSound = () => {
        initAudio();
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc.frequency.setValueAtTime(523.25, audioCtxRef.current.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1046.50, audioCtxRef.current.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, audioCtxRef.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtxRef.current.currentTime + 0.3);
    };

    // --- Confetti ---
    const createConfetti = () => {
        if (!containerRef.current) return;
        const colors = ['#00AFFF', '#7B61FF', '#FFD700', '#FF4E50'];
        for (let i = 0; i < 20; i++) {
            const c = document.createElement('div');
            c.className = 'confetti';
            c.style.left = Math.random() * 100 + '%';
            c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            containerRef.current.appendChild(c);
            setTimeout(() => c.remove(), 2000);
        }
    };

    // --- Game Logic ---
    const nextMission = useCallback(() => {
        const nextId = MISSION_POOL[Math.floor(Math.random() * MISSION_POOL.length)];
        setMission(GESTURES[nextId]);
        setGauge(0);
    }, []);

    const startGame = () => {
        setIsPlaying(true);
        setScore(0);
        setTimeLeft(30);
        setGauge(0);
        setIsGameOver(false);
        nextMission();
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1) {
                    clearInterval(intervalRef.current);
                    setIsPlaying(false);
                    setIsGameOver(true);
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
    };

    useEffect(() => {
        const init = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
                const landmark = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numHands: 1
                });
                setDetector(landmark);
                setIsModelLoaded(true);
            } catch (err) {
                console.error(err);
                setStatusText("❌ 로딩 실패");
            }
        };
        init();
    }, []);

    const getDist = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    const predictLoop = async () => {
        if (!videoRef.current || !canvasRef.current || !detector) return;
        const now = performance.now();
        const delta = now - lastTimeRef.current;
        lastTimeRef.current = now;

        const results = await detector.detectForVideo(videoRef.current, now);
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (results.landmarks && results.landmarks.length > 0) {
            const lm = results.landmarks[0];
            const handed = results.handedness[0][0].displayName;
            const isPalm = handed === "Right" ? lm[5].x > lm[17].x : lm[5].x < lm[17].x;

            // Finger check
            const fingers = [
                handed === "Right" ? (isPalm ? lm[4].x > lm[3].x : lm[4].x < lm[3].x) : (isPalm ? lm[4].x < lm[3].x : lm[4].x > lm[3].x),
                lm[8].y < lm[6].y, lm[12].y < lm[10].y, lm[16].y < lm[14].y, lm[20].y < lm[18].y
            ];

            fingerHistoryRef.current.push(fingers);
            if (fingerHistoryRef.current.length > 3) fingerHistoryRef.current.shift();
            const stableF = [0, 1, 2, 3, 4].map(idx => fingerHistoryRef.current.filter(f => f[idx]).length >= 2);

            // Gesture logic
            let gId = "NONE";
            const d48 = getDist(lm[4], lm[8]);
            if (d48 <= 0.06 && stableF[2] && stableF[3] && stableF[4]) gId = "OK";
            else if (stableF[1] && stableF[2] && !stableF[0] && !stableF[3] && !stableF[4]) gId = "V";
            else if (stableF[0] && !stableF[1] && !stableF[2] && !stableF[3] && !stableF[4]) gId = "THUMBS_UP";
            else if (!stableF[0] && !stableF[1] && !stableF[2] && !stableF[3] && !stableF[4]) gId = "FIST";
            else if (stableF[0] && stableF[1] && stableF[2] && stableF[3] && stableF[4]) gId = "PAPER";

            gestureHistoryRef.current.push(gId);
            if (gestureHistoryRef.current.length > 5) gestureHistoryRef.current.shift();
            const counts = {}; gestureHistoryRef.current.forEach(id => counts[id] = (counts[id] || 0) + 1);
            const topId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
            
            setConfirmedGesture(GESTURES[topId]);
            setDebugData([{ handed, side: isPalm ? "Palm" : "Back", extended: stableF.filter(v => v).length }]);
            drawSkel(ctx, lm);

            // --- Game Logic Handling ---
            if (gameRef.current.isPlaying) {
                if (topId === gameRef.current.missionId) {
                    setGauge(prev => {
                        const next = prev + (delta / 3000) * 100; // 3 seconds to fill
                        if (next >= 100) {
                            handleSuccess();
                            return 0;
                        }
                        return next;
                    });
                } else {
                    setGauge(prev => Math.max(0, prev - (delta / 5000) * 100)); // slow decay
                }
            }
        } else {
            setConfirmedGesture(GESTURES.NONE);
            setGauge(prev => Math.max(0, prev - (delta / 2000) * 100));
        }
        requestRef.current = requestAnimationFrame(predictLoop);
    };

    const handleSuccess = () => {
        setScore(s => s + 1);
        playSuccessSound();
        createConfetti();
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 1000);
        nextMission();
    };

    const drawSkel = (ctx, lm) => {
        ctx.strokeStyle = "#7B61FF"; ctx.lineWidth = 2;
        const conn = (ids) => {
            ctx.beginPath(); ctx.moveTo(lm[ids[0]].x * ctx.canvas.width, lm[ids[0]].y * ctx.canvas.height);
            ids.slice(1).forEach(id => ctx.lineTo(lm[id].x * ctx.canvas.width, lm[id].y * ctx.canvas.height)); ctx.stroke();
        };
        conn([0, 1, 2, 3, 4]); conn([0, 5, 6, 7, 8]); conn([0, 9, 10, 11, 12]); conn([0, 13, 14, 15, 16]); conn([0, 17, 18, 19, 20]); conn([5, 9, 13, 17]);
        ctx.fillStyle = "#00AFFF"; lm.forEach(p => { ctx.beginPath(); ctx.arc(p.x * ctx.canvas.width, p.y * ctx.canvas.height, 4, 0, 7); ctx.fill(); });
    };

    useEffect(() => {
        if (isModelLoaded) {
            navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
                .then(s => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.onloadeddata = predictLoop; } });
        }
        return () => { cancelAnimationFrame(requestRef.current); clearInterval(intervalRef.current); };
    }, [isModelLoaded]);

    return (
        <div className="handpose-game-root" ref={containerRef}>
            <h2 className="title mb-1">✋ 핸드포즈 챌린지</h2>
            
            <div className="main-layout">
                {/* Left: Webcam Area (65%) */}
                <div className="webcam-area card relative overflow-hidden">
                    {!isModelLoaded && <div className="loader-overlay"><div className="spin"></div><p>{statusText}</p></div>}
                    
                    {isPlaying && (
                        <div className="gesture-feedback animate-pop">
                            <span className="big-emoji">{confirmedGesture.emoji}</span>
                            <span className="big-name">{confirmedGesture.name}</span>
                        </div>
                    )}

                    {showSuccess && <div className="success-banner">🎉 SUCCESS!</div>}

                    <div className="video-hold">
                        <video ref={videoRef} autoPlay playsInline muted className="mirrored" />
                        <canvas ref={canvasRef} width="640" height="480" className="mirrored overlay" />
                    </div>

                    <div className="debug-mini">
                        {debugData.length > 0 && `Hand: ${debugData[0].handed} | Side: ${debugData[0].side} | Ext: ${debugData[0].extended}/5`}
                    </div>
                </div>

                {/* Right: Game Panel (35%) */}
                <div className="game-panel card">
                    <div className="panel-tabs">
                        <button className={`p-tab ${activeMode === 'basic' ? 'active' : ''}`} onClick={() => setActiveMode('basic')}>🎯 기본</button>
                        <button className={`p-tab ${activeMode === 'custom' ? 'active' : ''}`} disabled>✨ 나만의</button>
                    </div>

                    <div className="panel-body">
                        {!isPlaying && !isGameOver ? (
                            <div className="intro-view">
                                <h3>제스처 레이스</h3>
                                <p>표시되는 제스처를 3초간 유지하세요!</p>
                                <button className="btn-main" onClick={startGame}>🎮 게임 시작</button>
                            </div>
                        ) : isGameOver ? (
                            <div className="intro-view">
                                <h2 style={{color: '#FF4E50'}}>GAME OVER</h2>
                                <div className="final-score">{score}점</div>
                                <button className="btn-main" onClick={startGame}>🔄 다시 하기</button>
                            </div>
                        ) : (
                            <div className="game-view">
                                <div className="mission-box">
                                    <div className="mission-emoji">{mission.emoji}</div>
                                    <div className="mission-txt">{mission.name}를 해보세요!</div>
                                </div>

                                <div className="gauge-container">
                                    <div className="gauge-header-row">
                                        <div className="gauge-lbl">HOLD (3s)</div>
                                        <div className="gauge-pct">{Math.floor(gauge)}%</div>
                                    </div>
                                    <div className="gauge-track">
                                        <div className={`gauge-bar ${gauge > 80 ? 'glow' : ''}`} style={{width: `${gauge}%`}}></div>
                                    </div>
                                </div>

                                <div className="stats-grid">
                                    <div className="stat-item">
                                        <div className="s-lbl">SCORE</div>
                                        <div className="s-val gold">{score}</div>
                                    </div>
                                    <div className="stat-item">
                                        <div className="s-lbl">TIME</div>
                                        <div className="s-val">{timeLeft}s</div>
                                    </div>
                                </div>

                                <div className={`time-track ${timeLeft <= 10 ? 'blink-red' : ''}`}>
                                    <div className="time-bar" style={{width: `${(timeLeft/30)*100}%`}}></div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style jsx>{`
                .handpose-game-root { width: 100%; max-width: 1100px; display: flex; flex-direction: column; }
                .main-layout { display: grid; grid-template-columns: 6.5fr 3.5fr; gap: 1.5rem; min-height: 500px; }
                .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(15px); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 1.5rem; }
                
                /* Left Area */
                .webcam-area { padding: 0; background: #000; position: relative; }
                .video-hold { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000; }
                .mirrored { transform: scaleX(-1); width: 100%; height: auto; max-width: 640px; }
                .overlay { position: absolute; pointer-events: none; }
                .gesture-feedback { position: absolute; left: 50%; top: 20px; transform: translateX(-50%); z-index: 10; display: flex; flex-direction: column; align-items: center; }
                .big-emoji { font-size: 5rem; }
                .big-name { font-size: 1.5rem; background: rgba(0,0,0,0.5); padding: 5px 20px; border-radius: 20px; color: white; border: 1px solid rgba(255,255,255,0.2); }
                .debug-mini { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.8); padding: 8px; font-size: 11px; font-family: monospace; color: #AAA; text-align: center; }
                .success-banner { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 5rem; font-weight: 900; color: #FFD700; text-shadow: 0 0 20px rgba(0,0,0,0.5); z-index: 50; }

                /* Right Area */
                .game-panel { display: flex; flex-direction: column; gap: 1.5rem; }
                .panel-tabs { display: flex; gap: 0.5rem; background: rgba(255,255,255,0.05); padding: 4px; border-radius: 12px; }
                .p-tab { flex: 1; border: none; background: none; color: #AAA; padding: 8px; border-radius: 8px; cursor: pointer; font-weight: 700; transition: 0.2s; }
                .p-tab.active { background: rgba(255,255,255,0.1); color: #fff; }
                .panel-body { flex: 1; display: flex; flex-direction: column; justify-content: center; }
                .intro-view { text-align: center; }
                .btn-main { background: linear-gradient(135deg, #00AFFF, #7B61FF); color: white; border: none; padding: 1rem 2rem; border-radius: 15px; font-size: 1.1rem; font-weight: 800; cursor: pointer; margin-top: 1rem; width: 100%; transition: 0.2s; }
                .btn-main:hover { transform: scale(1.05); }

                .mission-box { text-align: center; background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 2rem; }
                .mission-emoji { font-size: 4rem; margin-bottom: 0.5rem; }
                .mission-txt { color: #AAA; font-size: 1.1rem; }

                .gauge-container { margin-bottom: 1.5rem; }
                .gauge-header-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 6px; }
                .gauge-lbl { font-size: 0.75rem; font-weight: 800; color: #00AFFF; text-transform: uppercase; letter-spacing: 1px; }
                .gauge-pct { font-size: 0.9rem; font-weight: 900; color: #fff; font-variant-numeric: tabular-nums; }
                .gauge-track { height: 16px; background: rgba(255,255,255,0.15); border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }
                .gauge-bar { height: 100%; background: linear-gradient(90deg, #00FFCC, #00AFFF, #7B61FF); box-shadow: inset 0 0 10px rgba(255,255,255,0.3); }
                .gauge-bar.glow { box-shadow: 0 0 20px #7B61FF, inset 0 0 10px rgba(255,255,255,0.5); }

                .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: auto; padding-bottom: 1rem; }
                .stat-item { background: rgba(255,255,255,0.05); padding: 0.8rem; border-radius: 15px; text-align: center; }
                .s-lbl { font-size: 0.7rem; color: #AAA; }
                .s-val { font-size: 1.8rem; font-weight: 900; }
                .s-val.gold { color: #FFD700; }

                .time-track { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; }
                .time-bar { height: 100%; background: #4ECDC4; transition: width 1s linear; }
                .blink-red .time-bar { background: #FF4E50; animation: blink 0.5s infinite; }

                @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
                @global(.confetti) { position: absolute; width: 10px; height: 10px; z-index: 100; animation: fall 2s linear forwards; }
                @keyframes fall { to { transform: translateY(600px) rotate(720deg); } }
                .final-score { font-size: 3.5rem; font-weight: 900; margin: 1rem 0; }
                .loader-overlay { position: absolute; inset:0; background:rgba(0,0,0,0.8); z-index:100; display:flex; flex-direction:column; align-items:center; justify-content:center; }
                .spin { width:40px; height:40px; border:3px solid rgba(255,255,255,0.1); border-top:3px solid #00AFFF; border-radius:50%; animation:s 1s linear infinite; }
                @keyframes s { to { transform:rotate(360deg); } }
                .title { font-size: 2.2rem; background: linear-gradient(135deg, #00AFFF, #7B61FF); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; font-weight: 800; }
            `}</style>
        </div>
    );
};

export default HandPose;
