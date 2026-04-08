'use client';

import { useEffect, useRef, useState } from 'react';

const MODEL_PATH = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_PATH  = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

const POSITION_MAP = {
  forehead: (lm) => ({ x: (lm[10].x + lm[151].x) / 2, y: lm[10].y }),
  eyes:     (lm) => ({ x: (lm[33].x + lm[263].x) / 2, y: (lm[33].y + lm[263].y) / 2 }),
  nose:     (lm) => ({ x: lm[4].x, y: lm[4].y }),
  mouth:    (lm) => ({ x: (lm[61].x + lm[291].x) / 2, y: (lm[13].y + lm[14].y) / 2 }),
};

const BUILT_IN_FILTERS = [
  { id: 'dog', name: '🐶 강아지', items: [{ emoji: '🐶', position: 'forehead' }] },
  { id: 'sunglasses', name: '😎 선글라스', items: [{ emoji: '😎', position: 'eyes' }] },
  { id: 'crown', name: '👑 왕관', items: [{ emoji: '👑', position: 'forehead' }] },
];

function getFaceAngle(lm, isFlipped = false) {
  const dx = isFlipped ? (lm[33].x - lm[263].x) : (lm[263].x - lm[33].x);
  const dy = isFlipped ? (lm[33].y - lm[263].y) : (lm[263].y - lm[33].y);
  return Math.atan2(dy, dx);
}

function getEyeDistance(lm, w) {
  return Math.sqrt(((lm[263].x - lm[33].x) * w) ** 2 + ((lm[263].y - lm[33].y) * w) ** 2);
}

function renderFilters(ctx, lm, w, h, activeFilter, activeCustoms, customFilters, customImages, isFlipped) {
  const flipped = isFlipped ? lm.map(p => ({ x: 1 - p.x, y: p.y })) : lm;
  const eyeDist = getEyeDistance(flipped, w);
  const angle = getFaceAngle(flipped, isFlipped);

  if (activeFilter) {
    for (const item of activeFilter.items) {
      const pos = POSITION_MAP[item.position](flipped);
      let drawX = pos.x * w;
      let drawY = pos.y * h;
      let size = eyeDist * 0.9;

      if (item.position === 'forehead') {
        drawY -= eyeDist * 0.5; // 위로 올림
        size = eyeDist * 1.5;   // 크기 키움
      }

      ctx.save();
      ctx.translate(drawX, drawY);
      ctx.rotate(angle);
      ctx.font = `${size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.emoji, 0, 0);
      ctx.restore();
    }
  }

  for (const cId of activeCustoms) {
    const cf = customFilters.find(f => f.id === cId);
    if (!cf) continue;
    const img = customImages[cId];
    if (!img || !img.complete) continue;
    const pos = POSITION_MAP[cf.position](flipped);
    
    let drawX = pos.x * w;
    let drawY = pos.y * h;
    if (cf.position === 'forehead') {
      drawY -= eyeDist * 0.5;
    }

    const drawW = eyeDist * 1.5;
    const drawH = drawW * (img.naturalHeight / img.naturalWidth);
    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.rotate(angle);
    if (isFlipped) ctx.scale(-1, 1);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }
}

export default function ARFilter({ isUnlocked, onGoToSecurity }) {
  const videoRef         = useRef(null);

  const canvasRef        = useRef(null);
  const detectorRef      = useRef(null);
  const rafRef           = useRef();
  const customImagesRef  = useRef({});
  const latestResultRef  = useRef(null);

  const [isLoaded, setIsLoaded]           = useState(false);
  const [error, setError]                 = useState(null);
  const [activeFilter, setActiveFilter]   = useState(null);
  const [customFilters, setCustomFilters] = useState([]);
  const [activeCustoms, setActiveCustoms] = useState([]);
  const [showModal, setShowModal]         = useState(false);
  const [pendingImage, setPendingImage]   = useState(null);

  // --- Photo Capture & Gallery State ---
  const [photos, setPhotos] = useState([]);
  const [viewPhoto, setViewPhoto] = useState(null);
  const [capturing, setCapturing] = useState(null); // null or countdown number or "📸 찰칵!"

  const activeFilterRef  = useRef(activeFilter);
  const activeCustomsRef = useRef(activeCustoms);
  const customFiltersRef = useRef(customFilters);
  useEffect(() => { activeFilterRef.current = activeFilter; }, [activeFilter]);
  useEffect(() => { activeCustomsRef.current = activeCustoms; }, [activeCustoms]);
  useEffect(() => { customFiltersRef.current = customFilters; }, [customFilters]);

  // --- Shutter Sound ---
  const playShutterSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch(e) {}
  };

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
    const video = videoRef.current, canvas = canvasRef.current;
    if (!detectorRef.current || !video || video.readyState < 2 || !video.videoWidth) {
      rafRef.current = requestAnimationFrame(predictLoop);
      return;
    }
    try {
      const result = detectorRef.current.detectForVideo(video, performance.now());
      latestResultRef.current = result;

      if (!canvas) { rafRef.current = requestAnimationFrame(predictLoop); return; }
      const w = video.videoWidth, h = video.videoHeight;
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);

      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        renderFilters(ctx, result.faceLandmarks[0], w, h,
          activeFilterRef.current, activeCustomsRef.current,
          customFiltersRef.current, customImagesRef.current, true);
      }
    } catch (e) {}
    rafRef.current = requestAnimationFrame(predictLoop);
  };

  const takePhoto = async () => {
    if (capturing !== null) return;
    
    // 3초 카운트다운
    for (let i = 3; i > 0; i--) {
      setCapturing(i);
      await new Promise(r => setTimeout(r, 1000));
    }
    setCapturing("📸 찰칵!");
    playShutterSound();
    
    // 실제 캡처 로직
    const video = videoRef.current;
    if (!video || !latestResultRef.current) return;
    
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const ctx = captureCanvas.getContext('2d');
    
    // 1. 비디오 그리기 (미러링 적용)
    ctx.save();
    ctx.translate(captureCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.restore();
    
    // 2. 필터 그리기
    if (latestResultRef.current.faceLandmarks && latestResultRef.current.faceLandmarks.length > 0) {
      renderFilters(ctx, latestResultRef.current.faceLandmarks[0], 
        captureCanvas.width, captureCanvas.height,
        activeFilterRef.current, activeCustomsRef.current,
        customFiltersRef.current, customImagesRef.current, true);
    }
    
    const dataUrl = captureCanvas.toDataURL('image/png');
    setPhotos(prev => [dataUrl, ...prev].slice(0, 10));
    
    await new Promise(r => setTimeout(r, 800));
    setCapturing(null);
  };

  useEffect(() => {
    initDetector();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPendingImage(event.target.result);
      setShowModal(true);
    };
    reader.readAsDataURL(file);
  };

  const addCustomFilter = (position) => {
    if (customFilters.length >= 3) {
      alert("최대 3개까지만 추가 가능합니다.");
      setShowModal(false);
      return;
    }
    const id = "custom-" + Date.now();
    const newFilter = { id, name: "커스텀 " + (customFilters.length + 1), position, isCustom: true };
    
    const img = new Image();
    img.src = pendingImage;
    customImagesRef.current[id] = img;

    setCustomFilters([...customFilters, newFilter]);
    setActiveCustoms([...activeCustoms, id]);
    setShowModal(false);
    setPendingImage(null);
  };

  const removeCustomFilter = (id) => {
    setCustomFilters(customFilters.filter(f => f.id !== id));
    setActiveCustoms(activeCustoms.filter(cid => cid !== id));
    delete customImagesRef.current[id];
  };

  const toggleCustomActive = (id) => {
    if (activeCustoms.includes(id)) {
      setActiveCustoms(activeCustoms.filter(cid => cid !== id));
    } else {
      setActiveCustoms([...activeCustoms, id]);
    }
  };

  return (
    <div className="detector-panel" style={{ width: '100%', maxWidth: '900px', position: 'relative' }}>
      
      {/* 잠금 오버레이 */}
      {!isUnlocked && (
        <div style={{ 
          position: 'absolute', inset: 0, zIndex: 1000, 
          background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(25px) saturate(150%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          borderRadius: '30px', border: '1px solid rgba(255, 255, 255, 0.5)',
          animation: 'fadeIn 0.8s ease-out', padding: '2rem', textAlign: 'center'
        }}>
          <div style={{ fontSize: '7rem', marginBottom: '1.5rem', filter: 'drop-shadow(0 10px 20px rgba(162, 155, 254, 0.3))' }}>🔓</div>
          <h2 style={{ fontSize: '2.8rem', marginBottom: '1rem', color: '#2D3436' }}>VIP 전용 라운지</h2>
          <p style={{ fontSize: '1.25rem', marginBottom: '2.5rem', color: '#636E72', maxWidth: '420px', lineHeight: '1.6' }}>
            이곳은 인증된 VIP만 입장할 수 있는 특별한 공간입니다.<br/>
            보안 게이트에서 얼굴 인증을 완료해주세요.
          </p>
          <button 
            onClick={onGoToSecurity}
            style={{ 
              padding: '1.2rem 3.5rem', borderRadius: '50px', border: 'none',
              background: 'linear-gradient(135deg, #a29bfe, #fd79a8)',
              color: 'white', fontSize: '1.2rem', fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 15px 30px rgba(162, 155, 254, 0.4)',
              transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-5px) scale(1.05)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0) scale(1)'}
          >
            🔐 보안 게이트로 이동하기
          </button>
        </div>
      )}

      {/* 입장 환영 메시지 (해금 직후) */}
      {isUnlocked && (
        <div style={{ 
          position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1100, background: 'linear-gradient(135deg, #81ecec, #a29bfe)',
          padding: '1.5rem 4rem', borderRadius: '60px', color: 'white', fontWeight: 800,
          fontSize: '2rem', boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
          animation: 'welcome-fade 3.5s forwards cubic-bezier(0.19, 1, 0.22, 1)',
          pointerEvents: 'none', border: '2px solid rgba(255,255,255,0.5)'
        }}>
          ✨ VIP Dreams Granted! ✨
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes welcome-fade {
              0% { opacity: 0; transform: translate(-50%, -20px); }
              15% { opacity: 1; transform: translate(-50%, 0); }
              85% { opacity: 1; transform: translate(-50%, 0); }
              100% { opacity: 0; transform: translate(-50%, -20px); }
            }
          `}} />
        </div>
      )}

      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>

        <h2 className="text-gradient" style={{ fontSize: '2.5rem' }}>🎭 AI AR 필터 스튜디오</h2>
        <p style={{ opacity: 0.7 }}>실시간 AI 얼굴 인식을 통한 스마트 필터 체험</p>
      </div>

      {error && <div style={{ padding: '3rem', textAlign: 'center', color: '#ff6b6b' }}>{error}</div>}

      {!error && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', width: '100%' }}>
          
          <div style={{ display: 'flex', gap: '2rem', width: '100%', flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* 왼쪽: 메인 프리뷰 */}
            <div style={{ position: 'relative', width: '100%', maxWidth: '640px' }}>
              <div className="card" style={{ padding: 0, overflow: 'hidden', width: '100%', position: 'relative', background: '#000', borderRadius: '24px', border: '4px solid rgba(255,255,255,0.1)' }}>
                {!isLoaded && (
                  <div style={{ padding: '5rem 3rem', textAlign: 'center' }}>
                    <div style={{ 
                      width: '50px', height: '50px', border: '4px solid rgba(255,255,255,0.1)', 
                      borderTopColor: '#6366f1', borderRadius: '50%', margin: '0 auto 1.5rem',
                      animation: 'spin 1s linear infinite'
                    }}></div>
                    <p style={{ fontSize: '1.2rem' }}>🔄 얼굴 인식 모델 로딩 중...</p>
                    <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
                  </div>
                )}
                <div className="video-wrapper mirrored" style={{ display: isLoaded ? 'block' : 'none', position: 'relative', lineHeight: 0 }}>
                  <video ref={videoRef} playsInline muted style={{ display: 'block', width: '100%', transform: 'scaleX(-1)' }} />
                  <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
                  
                  {/* 카운트다운 */}
                  {capturing !== null && (
                    <div style={{ 
                      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: capturing === "📸 찰칵!" ? '4rem' : '8rem', fontWeight: 900,
                      textShadow: '0 0 20px rgba(0,0,0,0.5)', zIndex: 10, animation: 'pulse 1s infinite'
                    }}>
                      {capturing}
                    </div>
                  )}
                </div>
              </div>

              {/* 캡처 버튼 */}
              <button 
                onClick={takePhoto}
                disabled={!isLoaded || capturing !== null}
                className="card"
                style={{ 
                  marginTop: '1.5rem', width: '100%', padding: '1.2rem', 
                  background: capturing !== null ? '#444' : 'linear-gradient(135deg, #6366f1, #a855f7)', 
                  border: 'none', color: 'white', fontSize: '1.4rem', fontWeight: 700, 
                  cursor: isLoaded && capturing === null ? 'pointer' : 'not-allowed',
                  boxShadow: '0 10px 20px rgba(99, 102, 241, 0.3)', transition: 'all 0.3s'
                }}
              >
                📸 사진 찍기
              </button>
            </div>

            {/* 오른쪽: 필터 컨트롤 패널 */}
            <div style={{ flex: '1', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="card" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>🎭 기본 피터</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button 
                    className={`filter-btn ${!activeFilter ? 'active' : ''}`}
                    onClick={() => setActiveFilter(null)}
                    style={{ padding: '12px', borderRadius: '12px', border: activeFilter === null ? '2px solid #6366f1' : '1px solid #444', cursor: 'pointer', background: activeFilter === null ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)', color: 'white' }}
                  >
                    ❌ 없음
                  </button>
                  {BUILT_IN_FILTERS.map(f => (
                    <button 
                      key={f.id}
                      className={`filter-btn ${activeFilter?.id === f.id ? 'active' : ''}`}
                      onClick={() => setActiveFilter(f)}
                      style={{ padding: '12px', borderRadius: '12px', border: activeFilter?.id === f.id ? '2px solid #6366f1' : '1px solid #444', cursor: 'pointer', background: activeFilter?.id === f.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)', color: 'white' }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0 }}>🎨 커스텀 필터</h3>
                  <label style={{ background: '#6366f1', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: 'white' }}>
                    추가
                    <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '5px' }}>
                  {customFilters.map(f => (
                    <div key={f.id} style={{ position: 'relative' }}>
                      <div 
                        onClick={() => toggleCustomActive(f.id)}
                        style={{ 
                          width: '60px', height: '60px', borderRadius: '10px', overflow: 'hidden', 
                          border: activeCustoms.includes(f.id) ? '3px solid #6366f1' : '1px solid #444', 
                          cursor: 'pointer', position: 'relative', background: '#000'
                        }}
                      >
                        <img src={customImagesRef.current[f.id]?.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeCustomFilter(f.id); }}
                        style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ff4d4d', color: 'white', border: 'none', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {customFilters.length === 0 && <p style={{ opacity: 0.5, fontSize: '13px' }}>등록된 이미지 없음</p>}
                </div>
              </div>
            </div>
          </div>

          {/* 사진 갤러리 */}
          {photos.length > 0 && (
            <div className="card" style={{ width: '100%', padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>🖼️ 최근 갤러리</h3>
              <div style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px' }}>
                {photos.map((url, idx) => (
                  <div key={idx} style={{ position: 'relative', minWidth: '120px' }}>
                    <div 
                      onClick={() => setViewPhoto(url)}
                      style={{ width: '120px', height: '90px', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <button 
                      onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                      style={{ position: 'absolute', top: '5px', right: '5px', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer' }}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 위치 선택 모달 */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
          <div className="card" style={{ padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '20px' }}>위치 선택</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button onClick={() => addCustomFilter('forehead')} style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid #444', color: 'white', cursor: 'pointer' }}>이마 (위에 쓰기)</button>
              <button onClick={() => addCustomFilter('eyes')} style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid #444', color: 'white', cursor: 'pointer' }}>눈 (안경/선글라스)</button>
              <button onClick={() => addCustomFilter('nose')} style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid #444', color: 'white', cursor: 'pointer' }}>코 (빨간 코 등)</button>
              <button onClick={() => addCustomFilter('mouth')} style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid #444', color: 'white', cursor: 'pointer' }}>입 (수염/입술)</button>
            </div>
            <button onClick={() => setShowModal(false)} style={{ marginTop: '20px', background: 'transparent', color: '#888', border: 'none', cursor: 'pointer' }}>취소</button>
          </div>
        </div>
      )}

      {/* 사진 크게 보기 모달 */}
      {viewPhoto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}>
          <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '80vh' }}>
            <img src={viewPhoto} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }} />
            <button 
              onClick={() => setViewPhoto(null)}
              style={{ position: 'absolute', top: '-40px', right: '-10px', background: 'white', color: 'black', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ✕
            </button>
          </div>
          <div style={{ marginTop: '20px', display: 'flex', gap: '15px' }}>
            <a 
              href={viewPhoto} 
              download="ar-filter-사진.png"
              style={{ padding: '12px 25px', borderRadius: '30px', background: '#6366f1', color: 'white', fontWeight: 700, textDecoration: 'none', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' }}
            >
              💾 저장하기
            </a>
            <button 
              onClick={() => { setPhotos(photos.filter(p => p !== viewPhoto)); setViewPhoto(null); }}
              style={{ padding: '12px 25px', borderRadius: '30px', background: '#ff4d4d', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer' }}
            >
              🗑️ 삭제
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
