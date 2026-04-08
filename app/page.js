'use client';

import { useState, useEffect } from 'react';
import RockPaperScissors from '../components/RockPaperScissors';
import ObjectMove from '../components/ObjectMove';
import HandPose from '../components/HandPose';
import SecurityGate from '../components/SecurityGate';
import ARFilter from '../components/ARFilter';

export default function Home() {
  const [activeTabId, setActiveTabId] = useState('rock-paper-scissors');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 탭 데이터 정의
  const TABS = [
    { 
      id: 'rock-paper-scissors', 
      title: '🎮 가위바위보', 
      week: '2주차',
      color: '#6366f1',
      desc: 'AI와 대결하는 손동작 인식 게임입니다.'
    },
    { 
      id: 'object-move', 
      title: '📦 물건 이동', 
      week: '3주차',
      color: '#4ECDC4',
      desc: '가상의 물체를 인식하고 분석해 보는 체험입니다.'
    },
    { 
      id: 'handpose', 
      title: '✋ 핸드포즈', 
      week: '3주차',
      color: '#00D4FF',
      desc: '다양한 손 모양을 인식하고 분석합니다.'
    },
    { 
      id: 'security-gate', 
      title: '🔐 보안 게이트', 
      week: '4주차',
      color: '#ff6b6b',
      desc: '얼굴 인식을 통한 보안 시스템 체험입니다.'
    },
    { 
      id: 'ar-filter', 
      title: isUnlocked ? '🎭 AR 필터' : '🔒 AR 필터', 
      week: '4주차',
      color: '#a855f7',
      desc: 'AI 얼굴 인식을 이용한 실시간 증강현실 필터 체험입니다.'
    },
  ];

  if (!mounted) return null;

  return (
    <main style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 2rem' }}>
      {/* 배경용 추가 블롭 (유니크 포인트) */}
      <div className="blob-2"></div>

      <div className="container" style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '1200px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* 헤더 섹션 */}
        <header style={{ textAlign: 'center', marginBottom: '4rem', paddingTop: '4rem' }}>
          <h1 className="text-gradient" style={{ fontSize: '5.5rem', marginBottom: '1.2rem', fontWeight: 900, letterSpacing: '-0.05em' }}>
            🎮 AI 체험관
          </h1>
          <p style={{ fontSize: '1.6rem', opacity: 1, fontWeight: 400, color: '#636E72', letterSpacing: '-0.02em' }}>
            Realize Academy · <span style={{ fontWeight: 700, color: '#74b9ff' }}>나만의 AI 꿈의 공간</span>
          </p>
        </header>

        {/* 탭 내비게이션 */}
        <nav style={{ 
          display: 'flex', gap: '12px', background: 'rgba(255, 255, 255, 0.4)', 
          padding: '12px', borderRadius: '60px', border: '1px solid rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(30px)', marginBottom: '4.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.05)',
          position: 'sticky', top: '25px', zIndex: 100
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setActiveTabId(tab.id);
              }}
              style={{
                padding: '0.8rem 2.2rem', borderRadius: '50px', border: 'none',
                background: activeTabId === tab.id ? 'linear-gradient(135deg, #a29bfe, #81ecec)' : 'transparent',
                color: activeTabId === tab.id ? 'white' : '#636E72',
                cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700,
                transition: 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                boxShadow: activeTabId === tab.id ? '0 10px 25px rgba(162, 155, 254, 0.3)' : 'none',
                transform: activeTabId === tab.id ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              <span style={{ fontSize: '0.75rem', opacity: activeTabId === tab.id ? 1 : 0.6, fontWeight: 600 }}>{tab.week}</span>
              {tab.title}
            </button>
          ))}
        </nav>

        {/* 콘텐츠 전환 영역 */}
        <section style={{ width: '100%', minHeight: '700px', display: 'flex', justifyContent: 'center' }}>
          <div key={activeTabId} style={{ width: '100%', display: 'flex', justifyContent: 'center', animation: 'contentShow 1s cubic-bezier(0.19, 1, 0.22, 1)' }}>
            {activeTabId === 'rock-paper-scissors' && <RockPaperScissors />}
            {activeTabId === 'object-move' && <ObjectMove />}
            {activeTabId === 'handpose' && <HandPose />}
            {activeTabId === 'security-gate' && (
              <SecurityGate onUnlockSuccess={() => setIsUnlocked(true)} />
            )}
            {activeTabId === 'ar-filter' && (
              <ARFilter 
                isUnlocked={isUnlocked} 
                onGoToSecurity={() => setActiveTabId('security-gate')} 
              />
            )}
          </div>
        </section>

        {/* 푸터 섹션 */}
        <footer style={{ 
          marginTop: '10rem', padding: '4rem 0', width: '100%',
          borderTop: '1px solid rgba(0,0,0,0.05)', textAlign: 'center', 
          background: 'linear-gradient(to bottom, transparent, rgba(162, 155, 254, 0.05))'
        }}>
          <p style={{ fontSize: '1.2rem', color: '#636E72', letterSpacing: '0.02em', marginBottom: '1.2rem' }}>
            Made with 🤍 by <strong style={{ color: '#2D3436', fontSize: '1.3rem' }}>고서연</strong> · Realize Academy
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '2.5rem', opacity: 0.6, fontSize: '0.95rem' }}>
            <span style={{ cursor: 'pointer' }}>Privacy Policy</span>
            <span style={{ cursor: 'pointer' }}>Terms of Service</span>
            <span style={{ cursor: 'pointer' }}>Contact Us</span>
          </div>
          <p style={{ fontSize: '0.9rem', marginTop: '2.5rem', opacity: 0.4 }}>
            © {new Date().getFullYear()} AI Experience Dream. All rights reserved.
          </p>
        </footer>
      </div>

      <style jsx global>{`
        @keyframes contentShow {
          from { opacity: 0; transform: translateY(30px) scale(0.95); filter: blur(10px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        .text-gradient {
          background: linear-gradient(135deg, #00D4FF 0%, #a855f7 50%, #6366f1 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          background-size: 200% auto;
          animation: shine-text 3s linear infinite;
        }
        @keyframes shine-text {
          to { background-position: 200% center; }
        }
      `}</style>
    </main>
  );
}
