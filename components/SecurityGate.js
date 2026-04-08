'use client';

import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const MODEL_PATH = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_PATH  = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

const FACE_OVAL     = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
const LEFT_EYE      = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33];
const RIGHT_EYE     = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398,362];
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

export default function SecurityGate({ onUnlockSuccess }) {
  const videoRef      = useRef(null);

  const canvasRef     = useRef(null);
  const detectorRef   = useRef(null);
  const rafRef        = useRef(null);
  const lastResultRef = useRef(null);

  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError]                 = useState(null);
  const [faceDetected, setFaceDetected]   = useState(false);

  // 시스템 및 등록 관련 상태
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [systemStatus, setSystemStatus]       = useState('IDLE'); // 'IDLE', 'SCANNING', 'SUCCESS', 'FAILURE'
  const [authInfo, setAuthInfo]               = useState({ name: '', similarity: 0 });
  const [isModalOpen, setIsModalOpen]         = useState(false);
  const [inputName, setInputName]             = useState('');
  const [countdown, setCountdown]             = useState(null);
  const [mode, setMode]                       = useState('REGISTER'); // 'REGISTER', 'UNLOCK'

  // ─── 모델 초기화 ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
        const landmark = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
        });
        if (cancelled) return;
        detectorRef.current = landmark;
        setIsModelLoaded(true);
      } catch (err) {
        if (!cancelled) setError('모델 로딩 실패: ' + err.message);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // ─── 카메라 시작 ──────────────────────────────────────────────
  useEffect(() => {
    if (!isModelLoaded) return;

    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 360 } })
      .then((stream) => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          setIsCameraReady(true);
          rafRef.current = requestAnimationFrame(predictLoop);
        };
      })
      .catch(() => setError('카메라 접근이 거부되었습니다.'));

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isModelLoaded]);

  // ─── 예측 루프 ──────────────────────────────────────────────
  const predictLoop = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;

    if (!detectorRef.current || !video || video.readyState < 2 || !video.videoWidth) {
      rafRef.current = requestAnimationFrame(predictLoop);
      return;
    }

    try {
      const result = detectorRef.current.detectForVideo(video, performance.now());
      lastResultRef.current = result;
      drawLandmarks(result, canvas, video);
      setFaceDetected(!!(result.faceLandmarks && result.faceLandmarks.length > 0));
    } catch (_) {}

    rafRef.current = requestAnimationFrame(predictLoop);
  };

  // ─── 랜드마크 그리기 ─────────────────────────────────────────
  const drawLandmarks = (result, canvas, video) => {
    if (!canvas || !video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width  = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    if (!result.faceLandmarks || result.faceLandmarks.length === 0) return;

    const flipped = result.faceLandmarks[0].map((p) => ({ x: 1 - p.x, y: p.y }));

    ctx.fillStyle = 'rgba(255, 182, 193, 0.6)';
    for (const p of flipped) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255, 182, 193, 0.85)';
    ctx.lineWidth = 1.2;
    drawPolyline(ctx, flipped, FACE_OVAL,     w, h, true);
    drawPolyline(ctx, flipped, LEFT_EYE,      w, h, true);
    drawPolyline(ctx, flipped, RIGHT_EYE,     w, h, true);
    drawPolyline(ctx, flipped, LEFT_EYEBROW,  w, h);
    drawPolyline(ctx, flipped, RIGHT_EYEBROW, w, h);
    drawPolyline(ctx, flipped, NOSE_BRIDGE,   w, h);
    drawPolyline(ctx, flipped, LIPS_OUTER,    w, h, true);
    drawPolyline(ctx, flipped, LIPS_INNER,    w, h, true);
  };

  // ─── 기능 스위칭 ──────────────────────────────────────────────
  const handleRegisterClick = () => {
    if (registeredUsers.length >= 5) {
      alert('최대 5명까지만 등록 가능합니다.');
      return;
    }
    setMode('REGISTER');
    setIsModalOpen(true);
  };

  const handleUnlockClick = () => {
    if (registeredUsers.length === 0) return;
    setMode('UNLOCK');
    setSystemStatus('SCANNING');
    setCountdown(3);
  };

  const startRegistration = () => {
    if (!inputName.trim()) return;
    setIsModalOpen(false);
    setSystemStatus('SCANNING');
    setCountdown(3);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
    // countdown === 0
    if (mode === 'REGISTER') performCapture();
    else performRecognition();
    setCountdown(null);
  }, [countdown]);

  // ─── 얼굴 등록 ──────────────────────────────────────────────
  const performCapture = () => {
    const result = lastResultRef.current;
    if (!result?.faceLandmarks?.length) {
      alert('얼굴을 인식할 수 없어 등록에 실패했습니다.');
      setSystemStatus('IDLE');
      return;
    }

    const landmarks = result.faceLandmarks[0];
    const origin    = landmarks[1];

    const features = KEY_POINTS.map((idx) => ({
      x: landmarks[idx].x - origin.x,
      y: landmarks[idx].y - origin.y,
      z: landmarks[idx].z - origin.z,
    }));

    const video       = videoRef.current;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width  = 60;
    thumbCanvas.height = 45;
    const tctx = thumbCanvas.getContext('2d');
    tctx.translate(60, 0);
    tctx.scale(-1, 1);
    tctx.drawImage(video, 0, 0, 60, 45);
    const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.8);

    setRegisteredUsers((prev) => [
      ...prev,
      { id: Date.now(), name: inputName, features, thumbnail },
    ]);
    setInputName('');
    setSystemStatus('SUCCESS');
    setTimeout(() => setSystemStatus('IDLE'), 1500);
  };

  // ─── 유사도 계산 및 인식 ──────────────────────────────────────
  const calculateSimilarity = (v1, v2) => {
    let sumDistSq = 0;
    for (let i = 0; i < v1.length; i++) {
      const dx = v1[i].x - v2[i].x;
      const dy = v1[i].y - v2[i].y;
      const dz = v1[i].z - v2[i].z;
      sumDistSq += (dx * dx + dy * dy + dz * dz);
    }
    const dist = Math.sqrt(sumDistSq);
    const scale = 350; // 유사도 감도 조절값
    return Math.max(0, Math.min(100, Math.round(100 - dist * scale)));
  };

  const performRecognition = () => {
    const result = lastResultRef.current;
    if (!result?.faceLandmarks?.length) {
      setSystemStatus('FAILURE');
      setAuthInfo({ name: '인식 실패', similarity: 0 });
      setTimeout(() => setSystemStatus('IDLE'), 2500);
      return;
    }

    const landmarks = result.faceLandmarks[0];
    const origin    = landmarks[1];
    const currentFeatures = KEY_POINTS.map((idx) => ({
      x: landmarks[idx].x - origin.x,
      y: landmarks[idx].y - origin.y,
      z: landmarks[idx].z - origin.z,
    }));

    let bestMatch = { user: null, sim: -1 };
    registeredUsers.forEach(user => {
      const sim = calculateSimilarity(user.features, currentFeatures);
      if (sim > bestMatch.sim) {
        bestMatch = { user, sim };
      }
    });

    if (bestMatch.sim >= 70) {
      setSystemStatus('SUCCESS');
      setAuthInfo({ name: bestMatch.user.name, similarity: bestMatch.sim });
      if (onUnlockSuccess) {
        setTimeout(() => onUnlockSuccess(), 1500);
      }
    } else {

      setSystemStatus('FAILURE');
      setAuthInfo({ name: '알 수 없음', similarity: bestMatch.sim });
    }
    
    setTimeout(() => {
      setSystemStatus('IDLE');
      setAuthInfo({ name: '', similarity: 0 });
    }, 4000);
  };

  const deleteUser = (id) =>
    setRegisteredUsers((prev) => prev.filter((u) => u.id !== id));

  // ─── UI 설정 ────────────────────────────────────────────────
  const isReady = isModelLoaded && isCameraReady;
  
  const getBorderColor = () => {
    if (systemStatus === 'SCANNING') return '#00D4FF';
    if (systemStatus === 'SUCCESS') return '#4ECDC4';
    if (systemStatus === 'FAILURE') return '#ff6b6b';
    return 'rgba(255,255,255,1)';
  };

  const getStatusText = () => {
    if (systemStatus === 'SCANNING') return '스캔 중...';
    if (systemStatus === 'SUCCESS' && mode === 'UNLOCK') return '입장 허가!';
    if (systemStatus === 'FAILURE' && mode === 'UNLOCK') return '입장 거부!';
    return '대기 중';
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* 상태 헤더 */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h2 className="text-gradient" style={{ fontSize: '2rem' }}>
          🔐 VIP 라운지 — 보안 게이트
        </h2>
        <div style={{ 
          marginTop: '0.5rem', padding: '4px 15px', borderRadius: '15px', 
          background: 'rgba(255,255,255,0.05)', display: 'inline-block',
          color: getBorderColor(), fontWeight: 600, border: `1px solid ${getBorderColor()}`,
          transition: 'all 0.3s'
        }}>
          {getStatusText()}
        </div>
      </div>

      {!error && (
        <>
          {/* 카메라 영역 */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '640px',
            background: '#000',
            borderRadius: '20px',
            overflow: 'hidden',
            border: `3px solid ${getBorderColor()}`,
            boxShadow: `0 10px 40px ${systemStatus !== 'IDLE' ? getBorderColor() + '44' : 'rgba(0,0,0,0.5)'}`,
            aspectRatio: '16/9',
            transition: 'border-color 0.3s, box-shadow 0.3s',
          }}>

            {/* 게이트 애니메이션 레이어 (Success 시) */}
            {systemStatus === 'SUCCESS' && mode === 'UNLOCK' && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex' }}>
                <div style={{ 
                  flex: 1, background: 'rgba(78, 205, 196, 0.4)', 
                  borderRight: '2px solid #fff',
                  animation: 'gate-open-left 1.2s forwards cubic-bezier(0.4, 0, 0.2, 1)' 
                }} />
                <div style={{ 
                  flex: 1, background: 'rgba(78, 205, 196, 0.4)', 
                  borderLeft: '2px solid #fff',
                  animation: 'gate-open-right 1.2s forwards cubic-bezier(0.4, 0, 0.2, 1)' 
                }} />
                <style dangerouslySetInnerHTML={{ __html: `
                  @keyframes gate-open-left { to { transform: translateX(-100%); opacity: 0; } }
                  @keyframes gate-open-right { to { transform: translateX(100%); opacity: 0; } }
                `}} />
              </div>
            )}

            {!isReady && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 20,
                background: 'rgba(5,11,24,0.9)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem',
              }}>
                <div style={{
                  width: 44, height: 44, border: '3px solid rgba(255,255,255,0.1)',
                  borderTopColor: '#00D4FF', borderRadius: '50%', animation: 'sg-spin 1s linear infinite',
                }} />
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem' }}>
                  {!isModelLoaded ? '🔄 얼굴 인식 모델 로딩 중...' : '📷 카메라 연결 중...'}
                </p>
                <style dangerouslySetInnerHTML={{ __html: '@keyframes sg-spin { to { transform: rotate(360deg); } }' }} />
              </div>
            )}

            <video ref={videoRef} autoPlay playsInline muted style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }} />

            {/* 카운트다운 */}
            {countdown !== null && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 15,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.35)',
                fontSize: '9rem', fontWeight: 900, color: '#fff',
                textShadow: '0 0 30px rgba(110,142,251,0.9)',
              }}>
                {countdown}
              </div>
            )}

            {/* 결과 메시지 */}
            {systemStatus === 'SUCCESS' && mode === 'UNLOCK' && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                zIndex: 40, background: 'rgba(78,205,196,0.95)', color: '#fff', padding: '1.2rem 2.5rem',
                borderRadius: '14px', fontWeight: 700, fontSize: '1.4rem', textAlign: 'center',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)', animation: 'pop-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
              }}>
                ✅ 입장 허가!<br/>
                <span style={{ fontSize: '1.1rem', fontWeight: 500 }}>{authInfo.name}님 환영합니다!</span>
                <div style={{ fontSize: '0.9rem', marginTop: '5px', opacity: 0.8 }}>유사도: {authInfo.similarity}%</div>
                <style dangerouslySetInnerHTML={{ __html: '@keyframes pop-in { from { transform: translate(-50%,-40%) scale(0.8); opacity: 0; } }' }} />
              </div>
            )}

            {systemStatus === 'FAILURE' && mode === 'UNLOCK' && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                zIndex: 40, background: 'rgba(255,107,107,0.95)', color: '#fff', padding: '1.2rem 2.5rem',
                borderRadius: '14px', fontWeight: 700, fontSize: '1.4rem', textAlign: 'center',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)', animation: 'shake 0.5s ease-in-out'
              }}>
                🚫 입장 거부!<br/>
                <span style={{ fontSize: '1rem', fontWeight: 500 }}>등록되지 않은 얼굴입니다.</span>
                <div style={{ fontSize: '0.9rem', marginTop: '5px', opacity: 0.8 }}>유사도: {authInfo.similarity}%</div>
                <style dangerouslySetInnerHTML={{ __html: `
                  @keyframes shake {
                    0%, 100% { transform: translate(-50%,-50%); }
                    20%, 60% { transform: translate(-55%,-50%); }
                    40%, 80% { transform: translate(-45%,-50%); }
                  }
                `}} />
              </div>
            )}
          </div>

          {/* 컨트롤 버튼 구성 */}
          <div style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1rem' }}>
            <button
              onClick={handleRegisterClick}
              disabled={!faceDetected || !isReady || countdown !== null}
              style={{
                padding: '0.8rem 2.2rem', borderRadius: '30px', border: 'none',
                background: (faceDetected && isReady) ? 'rgba(255,255,255,0.1)' : '#222',
                color: '#fff', fontWeight: 600, fontSize: '1rem',
                cursor: (faceDetected && isReady) ? 'pointer' : 'not-allowed',
                border: '1px solid rgba(255,255,255,0.2)', transition: 'all 0.2s',
              }}
            >
              📸 얼굴 등록
            </button>

            <button
              onClick={handleUnlockClick}
              disabled={!faceDetected || !isReady || countdown !== null || registeredUsers.length === 0}
              style={{
                padding: '0.8rem 2.2rem', borderRadius: '30px', border: 'none',
                background: (faceDetected && isReady && registeredUsers.length > 0)
                  ? 'linear-gradient(135deg, #00D4FF, #0070f3)'
                  : '#222',
                color: '#fff', fontWeight: 600, fontSize: '1.1rem',
                cursor: (faceDetected && isReady && registeredUsers.length > 0) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                boxShadow: (faceDetected && isReady && registeredUsers.length > 0) ? '0 4px 15px rgba(0, 212, 255, 0.4)' : 'none',
              }}
            >
              🔓 입장 시도
            </button>
          </div>

          <div style={{ marginTop: '1rem', fontSize: '0.95rem', color: faceDetected ? '#4ECDC4' : '#888' }}>
            {faceDetected ? '✅ 얼굴 감지됨' : '❌ 얼굴 감지 안됨'}
          </div>

          {/* 목록 */}
          <div style={{ marginTop: '2.5rem', width: '100%', maxWidth: '640px' }}>
            <h3 style={{ marginBottom: '1rem', textAlign: 'left', fontSize: '1.1rem', opacity: 0.85 }}>
              👥 등록된 사용자 ({registeredUsers.length}/5)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {registeredUsers.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#666', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '14px' }}>
                  등록된 사용자가 없습니다.
                </div>
              ) : (
                registeredUsers.map((user) => (
                  <div key={user.id} className="card" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <img src={user.thumbnail} alt={user.name} style={{ width: 60, height: 45, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }} />
                    <div style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{user.name}</div>
                    <button onClick={() => deleteUser(user.id)} style={{ background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '1.2rem', padding: '4px 8px' }} title="삭제">
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* 등록 모달 */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '90%', maxWidth: 400, padding: '2rem', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>사용자 등록</h3>
            <input type="text" value={inputName} onChange={(e) => setInputName(e.target.value)} placeholder="이름을 입력하세요" autoFocus onKeyDown={(e) => e.key === 'Enter' && startRegistration()} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#fff', marginBottom: '1.5rem', outline: 'none', fontSize: '1rem' }} />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: 'none', background: '#444', color: '#fff', cursor: 'pointer' }}>취소</button>
              <button onClick={startRegistration} disabled={!inputName.trim()} style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: 'none', background: inputName.trim() ? 'linear-gradient(135deg, #00D4FF, #0070f3)' : '#222', color: '#fff', cursor: inputName.trim() ? 'pointer' : 'not-allowed' }}>시작</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
