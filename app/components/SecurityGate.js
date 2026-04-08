'use client';

import { useEffect, useRef, useState } from 'react';

const MODEL_PATH = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_PATH  = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
const LEFT_EYE  = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33];
const RIGHT_EYE = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398,362];
const LEFT_EYEBROW  = [70,63,105,66,107,55,65,52,53,46];
const RIGHT_EYEBROW = [300,293,334,296,336,285,295,282,283,276];
const NOSE_BRIDGE   = [168,6,197,195,5];
const LIPS_OUTER    = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61];
const LIPS_INNER    = [78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95,78];

// 주요 포인트: 눈(33,133,362,263), 코(1,4), 입(61,291,0,17), 턱(152,377,148,234,454)
const KEY_POINTS = [33, 133, 362, 263, 1, 4, 61, 291, 0, 17, 152, 377, 148, 234, 454];

function drawPolyline(ctx, lm, indices, w, h, close = false) {
  if (!lm || indices.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(lm[indices[0]].x * w, lm[indices[0]].y * h);
  for (let i = 1; i < indices.length; i++) ctx.lineTo(lm[indices[i]].x * w, lm[indices[i]].y * h);
  if (close) ctx.closePath();
  ctx.stroke();
}

export default function SecurityGate() {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const detectorRef = useRef(null);
  const rafRef      = useRef();
  const lastResultRef = useRef(null);

  const [isLoaded, setIsLoaded]         = useState(false);
  const [error, setError]               = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  
  // 얼굴 등록 관련 상태
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inputName, setInputName] = useState('');
  const [countdown, setCountdown] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const initDetector = async () => {
    try {
      const vision = await import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs");
      const { FaceLandmarker, FilesetResolver } = vision;
      const visionTasks = await FilesetResolver.forVisionTasks(WASM_PATH);
      detectorRef.current = await FaceLandmarker.createFromOptions(visionTasks, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      startCamera();
    } catch (err) {
      setError("Face model loading failed: " + err.message);
    }
  };

  const startCamera = async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } });
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = async () => {
        try { await videoRef.current.play(); } catch (e) { if (e.name !== 'AbortError') throw e; }
        setIsLoaded(true);
        rafRef.current = requestAnimationFrame(predictLoop);
      };
    } catch (err) {
      setError("Camera access denied");
    }
  };

  const predictLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!detectorRef.current || !video || video.readyState < 2 || !video.videoWidth) {
      rafRef.current = requestAnimationFrame(predictLoop);
      return;
    }
    try {
      const result = detectorRef.current.detectForVideo(video, performance.now());
      lastResultRef.current = result;
      drawLandmarks(result, canvas, video);
      setFaceDetected(result.faceLandmarks && result.faceLandmarks.length > 0);
    } catch (e) {}
    rafRef.current = requestAnimationFrame(predictLoop);
  };

  const drawLandmarks = (result, canvas, video) => {
    if (!canvas || !video) return;
    const w = video.videoWidth, h = video.videoHeight;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) return;
    const flipped = result.faceLandmarks[0].map(p => ({ x: 1 - p.x, y: p.y }));

    ctx.fillStyle = 'rgba(255, 182, 193, 0.6)';
    for (const p of flipped) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 1, 0, Math.PI * 2); ctx.fill(); }

    ctx.strokeStyle = 'rgba(255, 182, 193, 0.85)';
    ctx.lineWidth = 1.2;
    drawPolyline(ctx, flipped, FACE_OVAL, w, h, true);
    drawPolyline(ctx, flipped, LEFT_EYE, w, h, true);
    drawPolyline(ctx, flipped, RIGHT_EYE, w, h, true);
    drawPolyline(ctx, flipped, LEFT_EYEBROW, w, h);
    drawPolyline(ctx, flipped, RIGHT_EYEBROW, w, h);
    drawPolyline(ctx, flipped, NOSE_BRIDGE, w, h);
    drawPolyline(ctx, flipped, LIPS_OUTER, w, h, true);
    drawPolyline(ctx, flipped, LIPS_INNER, w, h, true);
  };

  useEffect(() => {
    initDetector();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleRegisterClick = () => {
    if (registeredUsers.length >= 5) {
      alert('최대 5명까지만 등록 가능합니다.');
      return;
    }
    setIsModalOpen(true);
  };

  const startRegistration = () => {
    if (!inputName.trim()) return;
    setIsModalOpen(false);
    setCountdown(3);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      performCapture();
      setCountdown(null);
    }
  }, [countdown]);

  const performCapture = () => {
    const result = lastResultRef.current;
    if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
      alert('얼굴을 인식할 수 없어 등록에 실패했습니다.');
      return;
    }

    const landmarks = result.faceLandmarks[0];
    const noseIdx = 1; // 코 1번 기준
    const origin = landmarks[noseIdx];

    // 특징 벡터 추출 (상대 좌표)
    const features = KEY_POINTS.map(idx => ({
      x: landmarks[idx].x - origin.x,
      y: landmarks[idx].y - origin.y,
      z: landmarks[idx].z - origin.z
    }));

    // 썸네일 생성
    const video = videoRef.current;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 60;
    thumbCanvas.height = 45;
    const tctx = thumbCanvas.getContext('2d');
    // 비디오 좌우 반전 반영하여 그리기
    tctx.translate(60, 0);
    tctx.scale(-1, 1);
    tctx.drawImage(video, 0, 0, 60, 45);
    const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.8);

    setRegisteredUsers(prev => [...prev, { id: Date.now(), name: inputName, features, thumbnail }]);
    setInputName('');
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1000);
  };

  const deleteUser = (id) => {
    setRegisteredUsers(prev => prev.filter(u => u.id !== id));
  };

  return (
    <div className="detector-panel" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <h2 className="text-gradient">🔐 VIP 라운지 — 보안 게이트</h2>
      </div>

      {error && <div style={{ padding: '3rem', textAlign: 'center', color: '#ff6b6b' }}>{error}</div>}

      {!error && (
        <>
          <div className="card" style={{ padding: 0, overflow: 'hidden', maxWidth: '640px', width: '100%', position: 'relative', border: '2px solid rgba(255,255,255,0.1)' }}>
            {!isLoaded && (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <div style={{ 
                  width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', 
                  borderTopColor: '#00D4FF', borderRadius: '50%', margin: '0 auto 1rem',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <p>🔄 얼굴 인식 모델 로딩 중...</p>
                <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
              </div>
            )}
            <div className="video-wrapper mirrored" style={{ display: isLoaded ? 'block' : 'none', position: 'relative', lineHeight: 0 }}>
              <video ref={videoRef} playsInline muted style={{ display: 'block', width: '100%', transform: 'scaleX(-1)' }} />
              <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
              
              {countdown !== null && (
                <div style={{ 
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '8rem', fontWeight: 800,
                  textShadow: '0 0 20px rgba(0,0,0,0.5)'
                }}>
                  {countdown}
                </div>
              )}

              {showSuccess && (
                <div style={{ 
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  background: 'rgba(78, 205, 196, 0.9)', color: 'white', padding: '1rem 2rem',
                  borderRadius: '10px', fontWeight: 700, fontSize: '1.5rem', boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                  animation: 'fadeIn 0.3s ease'
                }}>
                  ✅ 등록 완료!
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: '1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <div style={{ fontSize: '1.1rem' }}>
              {faceDetected
                ? <span style={{ color: '#4ECDC4', fontWeight: 700 }}>✅ 얼굴 인식됨</span>
                : <span style={{ color: '#aaa' }}>❌ 얼굴을 인식할 수 없습니다</span>}
            </div>

            <button 
              onClick={handleRegisterClick}
              disabled={!faceDetected || isLoaded === false || countdown !== null}
              style={{
                padding: '0.8rem 2rem', borderRadius: '30px', border: 'none',
                background: faceDetected ? 'linear-gradient(135deg, #6e8efb, #a777e3)' : '#444',
                color: 'white', fontWeight: 600, cursor: faceDetected ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s', boxShadow: faceDetected ? '0 4px 15px rgba(110, 142, 251, 0.4)' : 'none'
              }}
            >
              📸 얼굴 등록
            </button>
          </div>

          {/* 등록된 목록 */}
          <div style={{ marginTop: '2.5rem', width: '100%', maxWidth: '640px' }}>
            <h3 style={{ marginBottom: '1rem', textAlign: 'left', fontSize: '1.2rem', opacity: 0.9 }}>👥 등록된 사용자 ({registeredUsers.length}/5)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {registeredUsers.length === 0 && (
                <div style={{ padding: '2rem', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '15px', color: '#888' }}>
                  등록된 사용자가 없습니다.
                </div>
              )}
              {registeredUsers.map(user => (
                <div key={user.id} className="card" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <img src={user.thumbnail} alt={user.name} style={{ width: '60px', height: '45px', borderRadius: '6px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }} />
                  <div style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{user.name}</div>
                  <button 
                    onClick={() => deleteUser(user.id)}
                    style={{ background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '1.2rem', padding: '5px' }}
                    title="삭제"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 이름 입력 모달 */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '90%', maxWidth: '400px', padding: '2rem', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>사용자 등록</h3>
            <input 
              type="text" 
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="이름을 입력하세요"
              autoFocus
              style={{
                width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.05)', color: 'white', marginBottom: '1.5rem', outline: 'none'
              }}
              onKeyDown={(e) => e.key === 'Enter' && startRegistration()}
            />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={() => setIsModalOpen(false)}
                style={{ flex: 1, padding: '0.7rem', borderRadius: '10px', border: 'none', background: '#444', color: 'white', cursor: 'pointer' }}
              >
                취소
              </button>
              <button 
                onClick={startRegistration}
                disabled={!inputName.trim()}
                style={{ 
                  flex: 1, padding: '0.7rem', borderRadius: '10px', border: 'none', 
                  background: inputName.trim() ? 'linear-gradient(135deg, #00D4FF, #0070f3)' : '#222', 
                  color: 'white', cursor: inputName.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                시작
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
