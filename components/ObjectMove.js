'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision';

const ObjectMove = () => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const detectorRef = useRef(null);
    const [isModelLoaded, setIsModelLoaded] = useState(false);

    // Game State
    const [isPlaying, setIsPlaying] = useState(false);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(30);
    const [isGameOver, setIsGameOver] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [currentMission, setCurrentMission] = useState({ id: 'cell phone', emoji: '📱', name: 'cell phone' });
    const [goalPos, setGoalPos] = useState({ x: 100, y: 100 });

    const requestRef = useRef();
    const intervalRef = useRef();
    const audioCtxRef = useRef(null);
    const lastCheckTime = useRef(0);
    const gameRef = useRef({ isPlaying: false, missionId: 'cell phone', goalPos: { x: 100, y: 100 }, score: 0 });

    useEffect(() => {
        gameRef.current.isPlaying = isPlaying;
        gameRef.current.missionId = currentMission.id;
        gameRef.current.goalPos = goalPos;
        gameRef.current.score = score;
    }, [isPlaying, currentMission, goalPos, score]);

    const MISSIONS = [
        { id: 'cell phone', emoji: '📱', name: 'cell phone' },
        { id: 'cup', emoji: '☕', name: 'cup' },
        { id: 'mouse', emoji: '🖱️', name: 'mouse' }
    ];

    const initAudio = () => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
    };

    const playTone = (freq, startTime, duration) => {
        if (isMuted || !audioCtxRef.current) return;
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc.frequency.setValueAtTime(freq, audioCtxRef.current.currentTime + startTime);
        gain.gain.setValueAtTime(0.1, audioCtxRef.current.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + startTime + duration);
        osc.start(audioCtxRef.current.currentTime + startTime);
        osc.stop(audioCtxRef.current.currentTime + startTime + duration);
    };

    const playSuccessSound = () => {
        initAudio();
        playTone(659, 0, 0.08);
        playTone(880, 0.08, 0.1);
    };

    const createConfetti = () => {
        if (!containerRef.current) return;
        const colors = ['#FF4E50', '#F9D423', '#4ECDC4', '#7B61FF'];
        for (let i = 0; i < 15; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti-piece';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            containerRef.current.appendChild(confetti);
            setTimeout(() => confetti.remove(), 1500);
        }
    };

    useEffect(() => {
        const initDetector = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
                );
                const objectDetector = await ObjectDetector.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
                        delegate: "GPU"
                    },
                    scoreThreshold: 0.35,
                    runningMode: "VIDEO"
                });
                detectorRef.current = objectDetector;
                setIsModelLoaded(true);
            } catch (error) {
                console.error("Init Error:", error);
            }
        };
        initDetector();
    }, []);

    const nextMission = useCallback(() => {
        const randomMission = MISSIONS[Math.floor(Math.random() * MISSIONS.length)];
        gameRef.current.missionId = randomMission.id;
        setCurrentMission(randomMission);
        if (canvasRef.current) {
            const padding = 60;
            const size = 150;
            const newPos = {
                x: padding + Math.random() * (canvasRef.current.width - size - padding * 2),
                y: padding + Math.random() * (canvasRef.current.height - size - padding * 2)
            };
            gameRef.current.goalPos = newPos;
            setGoalPos(newPos);
        }
    }, []);

    const startGame = () => {
        setScore(0);
        setTimeLeft(30);
        setIsGameOver(false);
        setIsPlaying(true);
        gameRef.current.isPlaying = true;
        gameRef.current.score = 0;
        nextMission();
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current);
                    setIsPlaying(false);
                    gameRef.current.isPlaying = false;
                    setIsGameOver(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleSuccess = () => {
        const now = Date.now();
        if (now - lastCheckTime.current < 800) return;
        lastCheckTime.current = now;

        const newScore = gameRef.current.score + 1;
        gameRef.current.score = newScore;
        setScore(newScore);
        playSuccessSound();
        createConfetti();
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 600);
        nextMission();
    };

    const predictLoop = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas || !detectorRef.current || video.readyState < 2) {
            requestRef.current = requestAnimationFrame(predictLoop);
            return;
        }

        // canvas 크기를 video에 맞춤
        if (video.videoWidth > 0 && canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        if (canvas.width === 0) {
            requestRef.current = requestAnimationFrame(predictLoop);
            return;
        }

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        try {
            const startTimeMs = performance.now();
            const detections = detectorRef.current.detectForVideo(video, startTimeMs);

            const gPos = gameRef.current.goalPos;

            // 목표 영역 그리기
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = "#4ECDC4";
            ctx.lineWidth = 3;
            ctx.strokeRect(gPos.x, gPos.y, 150, 150);
            ctx.setLineDash([]);

            detections.detections.forEach(detection => {
                const category = detection.categories[0].categoryName;
                if (['cell phone', 'cup', 'mouse'].includes(category)) {
                    const { originX, originY, width, height } = detection.boundingBox;
                    const cx = originX + width / 2;
                    const cy = originY + height / 2;

                    ctx.strokeStyle = "#FF4E50";
                    ctx.lineWidth = 2;
                    ctx.strokeRect(originX, originY, width, height);
                    ctx.fillStyle = "#FF4E50";
                    ctx.font = "bold 14px sans-serif";
                    ctx.fillText(category, originX, originY - 5);

                    if (gameRef.current.isPlaying && category === gameRef.current.missionId) {
                        if (cx >= gPos.x && cx <= gPos.x + 150 && cy >= gPos.y && cy <= gPos.y + 150) {
                            handleSuccess();
                        }
                    }
                }
            });
        } catch (e) {
            // 타임스탬프 충돌 등 무시
        }

        requestRef.current = requestAnimationFrame(predictLoop);
    };

    useEffect(() => {
        if (!isModelLoaded) return;
        // HandPose와 동일한 방식: 카메라 켜고 onloadeddata에서 루프 시작
        navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: { ideal: 30 } } })
            .then(stream => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadeddata = () => {
                        requestRef.current = requestAnimationFrame(predictLoop);
                    };
                }
            })
            .catch(err => console.error('카메라 오류:', err));

        return () => {
            cancelAnimationFrame(requestRef.current);
            clearInterval(intervalRef.current);
        };
    }, [isModelLoaded]);

    return (
        <div className="game-root" ref={containerRef}>
            <div className="header-hud">
                <div className="mission card">
                    <span className="lbl">MISSION</span>
                    <span className="txt">{currentMission.emoji} {currentMission.name} {"->"} Target</span>
                </div>
                <div className="meta">
                   <button className="mute-btn" onClick={() => setIsMuted(!isMuted)}>{isMuted?'🔇':'🔊'}</button>
                   <div className="score card">
                     <span className="scr">{score}</span>
                     <span className="pts">PTS</span>
                   </div>
                </div>
            </div>

            <div className="timer-track"><div className={`bar ${timeLeft<=10?'warn':''}`} style={{width:`${(timeLeft/30)*100}%`}}></div></div>

            <div className="view-card card">
                {!isModelLoaded && <div className="overlay loader"><div className="spin"></div><p>READYING AI...</p></div>}

                {isModelLoaded && !isPlaying && !isGameOver && (
                    <div className="overlay">
                        <h2>Speed Object Race</h2>
                        <button className="btn-go" onClick={startGame}>START GAME</button>
                    </div>
                )}

                {isGameOver && (
                    <div className="overlay">
                        <h2 style={{color:'#FF4E50'}}>FINISHED!</h2>
                        <div className="total">{score}pts</div>
                        <button className="btn-go" onClick={startGame}>RETRY</button>
                    </div>
                )}

                {showSuccess && <div className="pop">SUCCESS!</div>}

                <div className="video-area">
                    <video ref={videoRef} autoPlay playsInline muted className="mirrored" />
                    <canvas ref={canvasRef} className="mirrored canvas-overlay" />
                </div>
            </div>

            <style jsx>{`
                .game-root { width: 100%; max-width: 960px; display: flex; flex-direction: column; gap: 1rem; perspective: 1000px; }
                .header-hud { display: flex; justify-content: space-between; align-items: center; }
                .meta { display: flex; align-items: center; gap: 0.8rem; }
                .card { background: rgba(255,255,255,0.06); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 0.8rem; }
                .mission { border-left: 5px solid #4ECDC4; flex: 1; }
                .mission .lbl { font-size: 0.6rem; font-weight: 800; opacity: 0.5; display: block; }
                .mission .txt { font-size: 1.1rem; font-weight: 700; color: #4ECDC4; }
                .score { display: flex; align-items: baseline; gap: 4px; padding: 0.5rem 1.5rem; }
                .scr { font-size: 2rem; font-weight: 900; color: #F9D423; }
                .pts { font-size: 0.7rem; font-weight: 800; opacity: 0.6; }
                .mute-btn { width: 44px; height: 44px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
                .timer-track { width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; }
                .bar { height: 100%; background: #4ECDC4; transition: width 1s linear; }
                .bar.warn { background: #FF4E50; animation: flash 0.5s infinite alternate; }
                .view-card { padding: 0; background: #000; min-height: 480px; position: relative; overflow: hidden; }
                .video-area { position: relative; display: flex; justify-content: center; }
                .mirrored { transform: scaleX(-1); width: 100%; height: auto; max-width: 640px; display: block; }
                .canvas-overlay { position: absolute; top: 0; left: 50%; transform: translateX(-50%) scaleX(-1); pointer-events: none; }
                .overlay { position: absolute; inset: 0; z-index: 50; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); gap: 1.5rem; }
                .btn-go { padding: 1rem 3rem; border-radius: 30px; border: none; background: #4ECDC4; color: #000; font-weight: 900; font-size: 1.2rem; cursor: pointer; transition: 0.2s; }
                .btn-go:hover { transform: scale(1.1); background: #FFF; }
                .pop { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); font-size: 5rem; font-weight: 900; color: #F9D423; text-shadow: 0 0 20px rgba(0,0,0,1); z-index: 100; animation: jump 0.5s ease-out; }
                .total { font-size: 4rem; font-weight: 900; color: #FFF; }
                @global(.confetti-piece) { position: absolute; width: 8px; height: 8px; z-index: 200; animation: fall 1.5s linear forwards; }
                @keyframes fall { 0% { transform: translateY(-50px) rotate(0deg); opacity: 1; } 100% { transform: translateY(600px) rotate(360deg); opacity: 0; } }
                @keyframes jump { 0% { transform: translate(-50%,-50%) scale(0.5); opacity: 0; } 70% { transform: translate(-50%,-50%) scale(1.2); opacity: 1; } 100% { transform: translate(-50%,-50%) scale(1); } }
                @keyframes flash { from { opacity: 0.5; } to { opacity: 1; } }
                .spin { width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #4ECDC4; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1rem; }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default ObjectMove;
