#!/usr/bin/env node

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const open = require('open');

// 스텔스 플러그인 추가 (봇 감지 우회)
puppeteer.use(StealthPlugin());

// 환경 변수 설정
const PORT = process.env.PORT || 3000;
const MAX_RANK = parseInt(process.env.MAX_RANK || 200);
const OUTPUT_FILE = process.env.OUTPUT_FILE || 'playboard_rankings.json';
const HEADLESS = process.env.HEADLESS === 'true';
const EMAIL = process.env.PLAYBOARD_EMAIL;
const PASSWORD = process.env.PLAYBOARD_PASSWORD;

// Express 앱 설정
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));

// CORS 미들웨어 추가
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 루트 경로 처리
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 크롤링 작업 상태
let crawlInProgress = false;
let browser = null;
let page = null;
let stopRequested = false;
let isLoggedIn = false;

// 소켓 연결 처리
io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;
  console.log(`클라이언트가 연결되었습니다. (ID: ${socket.id}, IP: ${clientIp})`);
  
  // 환경 설정 요청 처리
  socket.on('getConfig', () => {
    console.log(`설정 요청 수신 (클라이언트 ID: ${socket.id})`);
    socket.emit('config', {
      email: EMAIL,
      password: PASSWORD,
      contentType: 'short',
      country: 'south-korea',
      period: 'daily',
      maxRank: MAX_RANK,
      outputFile: OUTPUT_FILE,
      showBrowser: !HEADLESS,
      isLoggedIn: isLoggedIn
    });
  });
  
  // 크롤링 시작 요청 처리
  socket.on('startCrawling', async (config) => {
    if (crawlInProgress) {
      socket.emit('status', { 
        message: '이미 크롤링이 진행 중입니다.', 
        type: 'warning' 
      });
      return;
    }
    
    crawlInProgress = true;
    stopRequested = false;
    
    try {
      await startCrawling(socket, config);
    } catch (error) {
      socket.emit('error', { message: error.message });
      crawlInProgress = false;
    }
  });
  
  // 크롤링 중단 요청 처리
  socket.on('stopCrawling', async () => {
    if (!crawlInProgress) {
      return;
    }
    
    stopRequested = true;
    socket.emit('status', { 
      message: '크롤링 중단 요청을 처리 중입니다...', 
      type: 'warning' 
    });
    
    // 브라우저는 유지하고 크롤링만 중단
    crawlInProgress = false;
    socket.emit('stopped');
  });
  
  // 프로그램 종료 요청 처리
  socket.on('exitProgram', async () => {
    console.log('프로그램 종료 요청 수신');
    
    // 브라우저가 열려있으면 닫기
    if (browser) {
      try {
        await browser.close();
        browser = null;
        page = null;
      } catch (error) {
        console.error('브라우저 종료 오류:', error);
      }
    }
    
    // 서버 종료
    console.log('서버를 종료합니다...');
    setTimeout(() => {
      process.exit(0);
    }, 500);
  });
  
  // 연결 해제 처리
  socket.on('disconnect', () => {
    console.log('클라이언트 연결이 해제되었습니다.');
  });
});

// 크롤링 함수
async function startCrawling(socket, config) {
  const { mode, email, password, contentType, country, period, maxRank, outputFile, showBrowser } = config;
  const needLogin = mode === 'login' && !isLoggedIn;
  
  socket.emit('status', { 
    message: `${maxRank}위까지 크롤링을 시작합니다...`, 
    type: 'info' 
  });
  
  // URL 생성
  const targetUrl = `https://playboard.co/chart/${contentType}/most-viewed-all-videos-in-${country}-${period}`;
  
  socket.emit('status', { 
    message: `대상 URL: ${targetUrl}`, 
    type: 'info' 
  });
  
  try {
    // 브라우저 시작 (아직 없는 경우에만)
    if (!browser) {
      socket.emit('status', { message: '브라우저 시작 중...', type: 'info' });
      browser = await puppeteer.launch({
        headless: !showBrowser,
        defaultViewport: { width: 1024, height: 768 },
        args: ['--window-size=1024,768', '--no-sandbox', '--disable-setuid-sandbox']
      });
      
      page = await browser.newPage();
      
      // 유저 에이전트 설정
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // 이미지 로딩 최적화 (썸네일 문제 해결)
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        // 필요한 리소스만 로드하도록 설정
        const resourceType = request.resourceType();
        if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
          request.continue();
        } else if (resourceType === 'script') {
          // 필수 스크립트만 로드
          request.continue();
        } else if (resourceType === 'xhr' || resourceType === 'fetch') {
          request.continue();
        } else if (resourceType === 'document') {
          request.continue();
        } else {
          // 다른 리소스는 차단 (광고, 트래커 등)
          request.continue();
        }
      });
    }
    
    // 로그인 처리 (아직 로그인하지 않은 경우에만)
    if (needLogin) {
      socket.emit('status', { message: '로그인 시도 중...', type: 'info' });
      
      // 로그인 페이지로 이동
      await page.goto('https://playboard.co/account/signin', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      
      // 중단 요청 확인
      if (stopRequested) {
        throw new Error('사용자에 의해 중단되었습니다.');
      }
      
      // 쿠키 동의 처리
      try {
        const cookieButton = await page.$('button[aria-label="동의"]');
        if (cookieButton) {
          await cookieButton.click();
          socket.emit('status', { message: '쿠키 동의 완료', type: 'success' });
          await page.waitForTimeout(1000);
        }
      } catch (error) {
        socket.emit('status', { 
          message: '쿠키 동의 버튼을 찾을 수 없습니다. 계속 진행합니다.', 
          type: 'warning' 
        });
      }
      
      // 중단 요청 확인
      if (stopRequested) {
        throw new Error('사용자에 의해 중단되었습니다.');
      }
      
      // 로그인 폼 작성
      socket.emit('status', { message: '로그인 정보 입력 중...', type: 'info' });
      
      // 이메일 입력
      await page.waitForSelector('input[name="email"]', { timeout: 10000 });
      await page.type('input[name="email"]', email);
      
      // 비밀번호 입력
      await page.waitForSelector('input[name="password"]', { timeout: 10000 });
      await page.type('input[name="password"]', password);
      
      // 로그인 버튼 클릭
      socket.emit('status', { message: '로그인 버튼 클릭...', type: 'info' });
      await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
      
      try {
        await Promise.all([
          page.click('button[type="submit"]'),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
        ]);
        socket.emit('status', { message: '로그인 완료', type: 'success' });
        isLoggedIn = true;
      } catch (error) {
        socket.emit('status', { 
          message: '로그인 중 오류가 발생했지만 계속 진행합니다: ' + error.message, 
          type: 'warning' 
        });
      }
      
      // 중단 요청 확인
      if (stopRequested) {
        throw new Error('사용자에 의해 중단되었습니다.');
      }
    } else if (isLoggedIn) {
      socket.emit('status', { message: '이미 로그인되어 있습니다.', type: 'info' });
    }
    
    // 차트 페이지로 이동
    socket.emit('status', { message: '차트 페이지로 이동 중...', type: 'info' });
    await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // 중단 요청 확인
    if (stopRequested) {
      throw new Error('사용자에 의해 중단되었습니다.');
    }
    
    // 데이터 로드를 위한 스크롤
    socket.emit('status', { message: '데이터 로드를 위해 스크롤 중...', type: 'info' });
    
    // 현재 로드된 항목 수 확인 함수
    const getLoadedItemsCount = async () => {
      return await page.evaluate(() => {
        return document.querySelectorAll('.chart__row').length;
      });
    };
    
    // 초기 로드된 항목 수 확인
    await page.waitForSelector('.chart__row', { timeout: 60000 });
    let loadedItems = await getLoadedItemsCount();
    
    socket.emit('status', { 
      message: `초기 로드된 항목 수: ${loadedItems}`, 
      type: 'info' 
    });
    
    // 진행 상황 업데이트
    socket.emit('progress', { current: loadedItems, total: maxRank });
    
    // 목표 순위까지 스크롤
    let scrollAttempts = 0;
    const maxScrollAttempts = 50; // 최대 스크롤 시도 횟수
    const scrollDelay = 800; // 스크롤 간 대기 시간 (ms)
    const scrollSteps = 5; // 한 번에 스크롤할 단계 수
    
    while (loadedItems < maxRank && scrollAttempts < maxScrollAttempts && !stopRequested) {
      // 페이지 끝까지 스크롤 (더 빠른 스크롤을 위해 여러 번 스크롤)
      await page.evaluate((steps) => {
        const scrollHeight = document.body.scrollHeight;
        const viewportHeight = window.innerHeight;
        
        // 여러 단계로 나누어 스크롤
        for (let i = 1; i <= steps; i++) {
          const targetScroll = (scrollHeight - viewportHeight) * (i / steps);
          window.scrollTo(0, targetScroll);
        }
        
        // 마지막에는 항상 맨 아래로 스크롤
        window.scrollTo(0, document.body.scrollHeight);
      }, scrollSteps);
      
      // 새 콘텐츠 로드 대기 (더 짧은 대기 시간)
      await page.waitForTimeout(scrollDelay);
      
      // 중단 요청 확인
      if (stopRequested) {
        throw new Error('사용자에 의해 중단되었습니다.');
      }
      
      // 새로 로드된 항목 수 확인
      const newLoadedItems = await getLoadedItemsCount();
      
      // 더 이상 새 항목이 로드되지 않으면 종료
      if (newLoadedItems === loadedItems) {
        scrollAttempts++;
        if (scrollAttempts >= 3) {
          socket.emit('status', { 
            message: `더 이상 항목을 로드할 수 없습니다. 총 ${loadedItems}개 항목을 찾았습니다.`, 
            type: 'warning' 
          });
          break;
        }
        
        // 스크롤이 안 되면 페이지를 약간 위로 올렸다가 다시 아래로 내리는 트릭 사용
        if (scrollAttempts === 2) {
          await page.evaluate(() => {
            // 현재 스크롤 위치에서 약간 위로
            window.scrollTo(0, window.scrollY - 500);
            // 잠시 후 다시 아래로
            setTimeout(() => {
              window.scrollTo(0, document.body.scrollHeight);
            }, 100);
          });
          await page.waitForTimeout(1000);
        }
      } else {
        scrollAttempts = 0; // 새 항목이 로드되면 카운터 리셋
        
        // 로드된 항목이 많이 증가했으면 대기 시간 줄이기
        if (newLoadedItems - loadedItems > 20) {
          await page.waitForTimeout(500); // 추가 대기
        }
      }
      
      loadedItems = newLoadedItems;
      socket.emit('progress', { current: Math.min(loadedItems, maxRank), total: maxRank });
      
      // 충분한 항목이 로드되었으면 스크롤 중단
      if (loadedItems >= maxRank + 5) { // 여유분을 조금 더 로드
        break;
      }
    }
    
    // 중단 요청 확인
    if (stopRequested) {
      throw new Error('사용자에 의해 중단되었습니다.');
    }
    
    // 데이터 추출
    socket.emit('status', { message: '데이터 추출 중...', type: 'info' });
    
    const rankings = await page.evaluate((maxRank) => {
      const items = Array.from(document.querySelectorAll('.chart__row')).slice(0, maxRank);
      
      return items.map((item, index) => {
        try {
          // 순위
          const rank = index + 1;
          
          // 순위 변동
          let rankChange = null;
          const rankElement = item.querySelector('.rank');
          if (rankElement) {
            const newElement = rankElement.querySelector('.new');
            const fluctElement = rankElement.querySelector('.fluc');
            
            if (newElement && newElement.textContent.includes('NEW')) {
              rankChange = { type: 'new' };
            } else if (fluctElement) {
              if (fluctElement.classList.contains('up')) {
                // 상승
                const numElement = fluctElement.querySelector('.num');
                const value = numElement ? numElement.textContent.trim() : '';
                rankChange = { 
                  type: 'up', 
                  value: value
                };
              } else if (fluctElement.classList.contains('down')) {
                // 하락
                const numElement = fluctElement.querySelector('.num');
                const value = numElement ? numElement.textContent.trim() : '';
                rankChange = { 
                  type: 'down', 
                  value: value
                };
              } else if (fluctElement.classList.contains('same')) {
                // 변동 없음
                rankChange = { type: 'same' };
              }
            }
          }
          
          // 썸네일 (개선된 방식)
          let thumbnail = '';
          const thumbElement = item.querySelector('.thumb-wrapper img, .thumb');
          
          if (thumbElement) {
            // 이미지 태그가 있는 경우
            if (thumbElement.tagName === 'IMG' && thumbElement.src) {
              thumbnail = thumbElement.src;
            } 
            // 배경 이미지가 있는 경우
            else if (thumbElement.style && thumbElement.style.backgroundImage) {
              const bgImage = thumbElement.style.backgroundImage;
              if (bgImage) {
                thumbnail = bgImage.replace(/url\(['"]?(.*?)['"]?\)/i, '$1');
              }
            }
            // data-background-image 속성이 있는 경우
            else if (thumbElement.getAttribute('data-background-image')) {
              thumbnail = thumbElement.getAttribute('data-background-image');
            }
          }
          
          // 유튜브 썸네일 URL 수정 (http -> https)
          if (thumbnail && thumbnail.includes('img.youtube.com')) {
            thumbnail = thumbnail.replace('http://', 'https://');
            // 고품질 썸네일로 변경
            thumbnail = thumbnail.replace('mqdefault.jpg', 'hqdefault.jpg');
          }
          
          // 제목
          let title = 'Unknown Title';
          const titleElement = item.querySelector('.title__label h3');
          if (titleElement) {
            title = titleElement.textContent.trim();
          }
          
          // 비디오 URL
          let videoUrl = '';
          let videoId = '';
          const titleLinkElement = item.querySelector('.title__label');
          if (titleLinkElement && titleLinkElement.href) {
            videoUrl = titleLinkElement.href;
            
            // Playboard URL에서 비디오 ID 추출
            const videoIdMatch = videoUrl.match(/\/video\/([^?]+)/);
            if (videoIdMatch && videoIdMatch[1]) {
              videoId = videoIdMatch[1];
              // 유튜브 URL로 변환
              videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            }
          }
          
          // 태그
          const tags = [];
          const tagElements = item.querySelectorAll('.ttags__item a');
          if (tagElements.length > 0) {
            tagElements.forEach(tag => {
              tags.push(tag.textContent.trim());
            });
          }
          
          // 날짜
          let date = '';
          const dateElement = item.querySelector('.title__date');
          if (dateElement) {
            date = dateElement.textContent.trim();
          }
          
          // 조회수
          let views = 'Unknown Views';
          const viewsElement = item.querySelector('.score .fluc-label');
          if (viewsElement) {
            views = viewsElement.textContent.trim();
          }
          
          // 채널 정보
          let channel = 'Unknown Channel';
          let channelUrl = '';
          let channelId = '';
          let channelThumbnail = '';
          let subscribers = '';
          
          const channelElement = item.querySelector('.channel__wrapper');
          if (channelElement) {
            // 채널명
            const channelNameElement = channelElement.querySelector('.name');
            if (channelNameElement) {
              channel = channelNameElement.textContent.trim();
            }
            
            // 채널 URL
            if (channelElement.href) {
              channelUrl = channelElement.href;
              
              // Playboard URL에서 채널 ID 추출
              const channelIdMatch = channelUrl.match(/\/channel\/([^?/]+)/);
              if (channelIdMatch && channelIdMatch[1]) {
                channelId = channelIdMatch[1];
                // 유튜브 URL로 변환
                channelUrl = `https://www.youtube.com/channel/${channelId}`;
              }
            }
            
            // 채널 썸네일
            const channelImgElement = channelElement.querySelector('img');
            if (channelImgElement && channelImgElement.src) {
              channelThumbnail = channelImgElement.src;
            } else if (channelElement.querySelector('.profile-image')) {
              // 프로필 이미지 컨테이너가 있는 경우
              const profileImage = channelElement.querySelector('.profile-image');
              const imgInProfile = profileImage.querySelector('img[src]');
              if (imgInProfile && imgInProfile.src) {
                channelThumbnail = imgInProfile.src;
              } else if (profileImage.style && profileImage.style.backgroundImage) {
                // 배경 이미지로 설정된 경우
                const bgImage = profileImage.style.backgroundImage;
                if (bgImage) {
                  channelThumbnail = bgImage.replace(/url\(['"]?(.*?)['"]?\)/i, '$1');
                }
              }
            }
            
            // 구독자 수
            const subsElement = channelElement.querySelector('.subs__count');
            if (subsElement) {
              subscribers = subsElement.textContent.trim();
            }
          }
          
          // 필수 데이터가 없는 경우 null 반환 (나중에 필터링)
          if (!title || title === 'Unknown Title' || !videoUrl) {
            return null;
          }
          
          return {
            rank,
            rankChange,
            title,
            tags,
            date,
            views,
            channel,
            subscribers,
            thumbnail,
            videoUrl,
            videoId,
            channelUrl,
            channelId,
            channelThumbnail,
            crawledAt: new Date().toISOString()
          };
        } catch (error) {
          console.error('항목 처리 중 오류:', error);
          return null;
        }
      }).filter(item => item !== null); // null 항목 제거
    }, maxRank);
    
    // 중단 요청 확인
    if (stopRequested) {
      throw new Error('사용자에 의해 중단되었습니다.');
    }
    
    // 결과를 클라이언트에 전송
    rankings.forEach(item => {
      socket.emit('result', item);
    });
    
    socket.emit('status', { 
      message: `크롤링 완료! ${rankings.length}개 항목을 찾았습니다.`, 
      type: 'success' 
    });
    
    // 완료 이벤트 전송
    socket.emit('complete', { count: rankings.length });
    
  } catch (error) {
    if (stopRequested) {
      socket.emit('stopped');
    } else {
      socket.emit('error', { message: error.message });
    }
  } finally {
    crawlInProgress = false;
    stopRequested = false;
    
    // 브라우저는 닫지 않고 유지 (세션 유지)
    socket.emit('status', { 
      message: '브라우저 세션을 유지합니다. 다른 조건으로 크롤링할 수 있습니다.', 
      type: 'info' 
    });
  }
}

// 서버 시작
server.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`환경 설정: 이메일=${EMAIL ? '설정됨' : '없음'}, 비밀번호=${PASSWORD ? '설정됨' : '없음'}`);
  console.log(`로그인 상태: ${isLoggedIn ? '로그인됨' : '로그인 안됨'}`);
  // 브라우저에서 자동으로 열기
  open(`http://localhost:${PORT}`);
});

// 프로세스 종료 처리
process.on('SIGINT', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit(0);
}); 