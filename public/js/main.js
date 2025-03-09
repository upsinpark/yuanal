// 소켓 연결
const socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

// DOM 요소
const elements = {
    loginStatus: document.getElementById('loginStatus'),
    loginSettingsBtn: document.getElementById('loginSettingsBtn'),
    modalEmail: document.getElementById('modalEmail'),
    modalPassword: document.getElementById('modalPassword'),
    showBrowser: document.getElementById('showBrowser'),
    saveLoginBtn: document.getElementById('saveLoginBtn'),
    startCrawlBtn: document.getElementById('startCrawlBtn'),
    stopCrawlBtn: document.getElementById('stopCrawlBtn'),
    exitBtn: document.getElementById('exitBtn'),
    confirmExitBtn: document.getElementById('confirmExitBtn'),
    resultsTable: document.getElementById('resultsTable'),
    errorMessage: document.getElementById('errorMessage'),
    retryBtn: document.getElementById('retryBtn'),
    loadingOverlay: document.createElement('div')
};

// 모달
const modals = {
    loginSettings: new bootstrap.Modal(document.getElementById('loginSettingsModal')),
    exitConfirm: new bootstrap.Modal(document.getElementById('exitConfirmModal')),
    error: new bootstrap.Modal(document.getElementById('errorModal'))
};

// 상태 변수
let state = {
    crawlInProgress: false,
    results: [],
    isLoggedIn: false,
    email: '',
    password: '',
    showBrowser: false
};

// 이벤트 리스너 설정
function setupEventListeners() {
    // 로그인 설정
    elements.loginSettingsBtn.addEventListener('click', () => {
        elements.modalEmail.value = state.email;
        elements.modalPassword.value = state.password;
        elements.showBrowser.checked = state.showBrowser;
        modals.loginSettings.show();
    });

    elements.saveLoginBtn.addEventListener('click', () => {
        state.email = elements.modalEmail.value;
        state.password = elements.modalPassword.value;
        state.showBrowser = elements.showBrowser.checked;
        updateLoginStatus();
        modals.loginSettings.hide();
    });

    // 크롤링 제어
    elements.startCrawlBtn.addEventListener('click', startCrawling);
    elements.stopCrawlBtn.addEventListener('click', stopCrawling);

    // 재시도 버튼
    elements.retryBtn?.addEventListener('click', () => {
        modals.error.hide();
        startCrawling();
    });

    // 종료
    elements.exitBtn.addEventListener('click', () => modals.exitConfirm.show());
    elements.confirmExitBtn.addEventListener('click', () => {
        socket.emit('exitProgram');
        window.close();
    });

    // 브라우저 종료
    window.addEventListener('beforeunload', () => {
        socket.emit('exitProgram');
    });
}

// 로딩 오버레이 초기화
function initLoadingOverlay() {
    elements.loadingOverlay.className = 'loading-overlay';
    
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    
    const loadingText = document.createElement('div');
    loadingText.className = 'loading-text';
    loadingText.textContent = '데이터를 수집하고 있습니다...';
    
    elements.loadingOverlay.appendChild(spinner);
    elements.loadingOverlay.appendChild(loadingText);
    document.body.appendChild(elements.loadingOverlay);
}

// 로딩 상태 토글
function toggleLoading(show) {
    elements.loadingOverlay.classList.toggle('active', show);
}

// 크롤링 시작
function startCrawling() {
    if (state.crawlInProgress) return;

    if (!state.isLoggedIn && !state.email && !state.password) {
        document.getElementById('errorMessage').textContent = '로그인 정보가 필요합니다.';
        modals.error.show();
        elements.loginSettingsBtn.focus();
        return;
    }

    const config = {
        mode: state.email && state.password ? 'login' : 'no-login',
        email: state.email,
        password: state.password,
        contentType: document.getElementById('contentType').value,
        country: document.getElementById('country').value,
        period: document.getElementById('period').value,
        maxRank: parseInt(document.getElementById('maxRank').value),
        showBrowser: state.showBrowser
    };

    clearResults();
    state.crawlInProgress = true;
    updateButtons(true);
    toggleLoading(true);
    
    socket.emit('startCrawling', config);
}

// 크롤링 중단
function stopCrawling() {
    if (!state.crawlInProgress) return;
    socket.emit('stopCrawling');
    toggleLoading(false);
}

// UI 업데이트 함수들
function updateButtons(isCrawling) {
    elements.startCrawlBtn.disabled = isCrawling;
    elements.stopCrawlBtn.disabled = !isCrawling;
    elements.exitBtn.disabled = isCrawling;
    elements.startCrawlBtn.innerHTML = isCrawling ? 
        '<i class="bi bi-hourglass-split"></i> 크롤링 중...' : 
        '<i class="bi bi-play-fill"></i> 시작';
}

function updateLoginStatus() {
    if (state.isLoggedIn) {
        elements.loginStatus.textContent = '로그인됨';
        elements.loginStatus.className = 'login-status logged-in';
    } else if (state.email && state.password) {
        elements.loginStatus.textContent = '로그인 준비됨';
        elements.loginStatus.className = 'login-status not-logged-in';
    } else {
        elements.loginStatus.textContent = '로그인 필요';
        elements.loginStatus.className = 'login-status not-logged-in';
    }
}

function updateProgress(current, total) {
    const percentage = Math.min(Math.round((current / total) * 100), 100);
    elements.progressBar.style.width = `${percentage}%`;
    elements.progressText.textContent = `${current}/${total} 항목 (${percentage}%)`;
}

function resetProgress() {
    elements.progressBar.style.width = '0%';
    elements.progressText.textContent = '0/0 항목 (0%)';
}

function clearResults() {
    elements.resultsTable.innerHTML = '';
    state.results = [];
}

// 결과 처리
function addResult(item) {
    state.results.push(item);
    
    const row = document.createElement('tr');
    
    // 순위 및 변동
    const rankCell = document.createElement('td');
    const rankNumber = document.createElement('span');
    rankNumber.className = 'rank-number';
    rankNumber.textContent = item.rank;
    rankCell.appendChild(rankNumber);
    
    if (item.rankChange) {
        const changeDiv = document.createElement('div');
        changeDiv.className = `rank-change ${item.rankChange.type}`;
        
        // SVG 아이콘 추가
        if (item.rankChange.type === 'up' || item.rankChange.type === 'down') {
            const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svgIcon.setAttribute('viewBox', '0 0 24 16');
            svgIcon.classList.add('rank-change-icon');
            
            // 상승/하락 아이콘 경로
            const pathData = item.rankChange.type === 'up' ?
                'M3.37343685,15.9683269 L1.27599638,15.9715388 C0.572361366,15.9726163 0.00107899738,15.4030809 1.49486781e-06,14.6994459 C-0.000429887184,14.4177431 0.0925146057,14.1438404 0.26429852,13.9205761 L10.6747981,0.390244984 C11.011584,-0.0474692466 11.6394403,-0.129287879 12.0771545,0.207497954 C12.144426,0.259257922 12.2048338,0.31937211 12.2569209,0.386390574 L22.8197472,13.9771646 C23.2377889,14.5150425 23.1406425,15.2899684 22.6027646,15.7080101 C22.3863086,15.876241 22.1199769,15.9675684 21.8458332,15.9675684 L19.8121057,15.9675684 C19.5046179,15.9675684 19.2142258,15.8261069 19.0246853,15.5839847 L11.4787686,5.94470705 L4.16835112,15.5730383 C3.97959507,15.8216432 3.68557949,15.9678489 3.37343685,15.9683269 Z' :
                'M3.37343685,0.0316731 L1.27599638,0.0284612 C0.572361366,0.0273837 0.00107899738,0.5969191 1.49486781e-06,1.3005541 C-0.000429887184,1.5822569 0.0925146057,1.8561596 0.26429852,2.0794239 L10.6747981,15.609755 C11.011584,16.0474692 11.6394403,16.1292879 12.0771545,15.792502 C12.144426,15.7407421 12.2048338,15.6806279 12.2569209,15.6136094 L22.8197472,2.0228354 C23.2377889,1.4849575 23.1406425,0.7100316 22.6027646,0.2919899 C22.3863086,0.123759 22.1199769,0.0324316 21.8458332,0.0324316 L19.8121057,0.0324316 C19.5046179,0.0324316 19.2142258,0.1738931 19.0246853,0.4160153 L11.4787686,10.0552929 L4.16835112,0.4269617 C3.97959507,0.1783568 3.68557949,0.0321511 3.37343685,0.0316731 Z';
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', pathData);
            svgIcon.appendChild(path);
            changeDiv.appendChild(svgIcon);
            
            if (item.rankChange.value) {
                const valueSpan = document.createElement('span');
                valueSpan.className = 'rank-change-value';
                valueSpan.textContent = item.rankChange.value;
                changeDiv.appendChild(valueSpan);
            }
        } else if (item.rankChange.type === 'new') {
            changeDiv.innerHTML = '<span class="rank-change-value">NEW</span>';
        } else if (item.rankChange.type === 'same') {
            changeDiv.innerHTML = '<span class="rank-change-value">-</span>';
        }
        
        rankCell.appendChild(changeDiv);
    }
    row.appendChild(rankCell);
    
    // 썸네일
    const thumbnailCell = document.createElement('td');
    const thumbnailLink = document.createElement('a');
    thumbnailLink.href = item.videoUrl;
    thumbnailLink.target = '_blank';
    const thumbnail = document.createElement('img');
    thumbnail.src = item.thumbnail || 'https://via.placeholder.com/240x135?text=No+Image';
    thumbnail.alt = item.title;
    thumbnail.loading = 'lazy';
    thumbnailLink.appendChild(thumbnail);
    thumbnailCell.appendChild(thumbnailLink);
    row.appendChild(thumbnailCell);
    
    // 제목
    const titleCell = document.createElement('td');
    titleCell.className = 'title-cell';
    
    const titleLink = document.createElement('a');
    titleLink.href = item.videoUrl;
    titleLink.target = '_blank';
    titleLink.textContent = item.title;
    
    const titleWrapper = document.createElement('div');
    titleWrapper.appendChild(titleLink);
    
    if (item.tags && item.tags.length > 0) {
        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'tags';
        item.tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'tag';
            tagSpan.textContent = tag;
            tagsDiv.appendChild(tagSpan);
        });
        titleWrapper.appendChild(tagsDiv);
    }
    
    if (item.date) {
        const dateDiv = document.createElement('div');
        dateDiv.className = 'date';
        dateDiv.textContent = item.date;
        titleWrapper.appendChild(dateDiv);
    }
    
    titleCell.appendChild(titleWrapper);
    row.appendChild(titleCell);
    
    // 조회수
    const viewsCell = document.createElement('td');
    viewsCell.className = 'views-cell';
    viewsCell.textContent = item.views;
    row.appendChild(viewsCell);
    
    // 채널
    const channelCell = document.createElement('td');
    channelCell.className = 'channel-cell';
    
    const channelWrapper = document.createElement('div');
    channelWrapper.className = 'd-flex flex-column align-items-center';
    
    // 채널명
    const channelName = document.createElement('div');
    channelName.className = 'channel-name text-center mb-1';
    if (item.channelUrl) {
        const channelLink = document.createElement('a');
        channelLink.href = item.channelUrl;
        channelLink.target = '_blank';
        channelLink.textContent = item.channel;
        channelName.appendChild(channelLink);
    } else {
        channelName.textContent = item.channel || '-';
    }
    channelWrapper.appendChild(channelName);
    
    // 구독자 수
    if (item.subscribers) {
        const subsCount = document.createElement('div');
        subsCount.className = 'subs-count text-center';
        subsCount.textContent = item.subscribers;
        channelWrapper.appendChild(subsCount);
    }
    
    channelCell.appendChild(channelWrapper);
    row.appendChild(channelCell);
    
    elements.resultsTable.appendChild(row);
    elements.exportBtn.disabled = false;
    elements.clearBtn.disabled = false;
}

function exportResults() {
    if (state.results.length === 0) return;
    
    const fileName = `playboard_${document.getElementById('contentType').value}_${document.getElementById('country').value}_${document.getElementById('period').value}.json`;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.results, null, 2));
    const downloadLink = document.createElement('a');
    downloadLink.href = dataStr;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
}

// 상태 메시지
function addStatusMessage(message, type = 'info') {
    const messageElement = document.createElement('div');
    messageElement.className = 'status-message';
    
    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = new Date().toTimeString().split(' ')[0];
    
    const messageText = document.createElement('span');
    messageText.className = `message status-${type}`;
    messageText.textContent = message;
    
    messageElement.appendChild(timestamp);
    messageElement.appendChild(messageText);
    elements.statusMessages.appendChild(messageElement);
    elements.statusMessages.scrollTop = elements.statusMessages.scrollHeight;
}

// 소켓 이벤트 핸들러
function setupSocketHandlers() {
    socket.on('connect', () => {
        console.log('서버에 연결되었습니다.');
        socket.emit('getConfig');
    });

    socket.on('config', (config) => {
        console.log('설정을 받았습니다:', config);
        state.email = config.email || '';
        state.password = config.password || '';
        state.isLoggedIn = config.isLoggedIn || false;
        state.showBrowser = config.showBrowser || false;
        elements.showBrowser.checked = state.showBrowser;
        updateLoginStatus();
    });

    socket.on('status', (data) => {
        console.log('상태 업데이트:', data);
        if (data.message === '로그인 완료' && data.type === 'success') {
            state.isLoggedIn = true;
            updateLoginStatus();
        }
    });
    
    socket.on('result', (item) => {
        console.log('결과 수신:', item);
        addResult(item);
    });

    socket.on('complete', (data) => {
        console.log('크롤링 완료:', data);
        state.crawlInProgress = false;
        updateButtons(false);
        elements.loadingOverlay.querySelector('.loading-text').textContent = '수집 완료!';
        setTimeout(() => {
            toggleLoading(false);
        }, 1000);
    });

    socket.on('stopped', () => {
        console.log('크롤링 중단됨');
        state.crawlInProgress = false;
        updateButtons(false);
        toggleLoading(false);
    });

    socket.on('error', (data) => {
        console.error('에러 발생:', data);
        state.crawlInProgress = false;
        updateButtons(false);
        toggleLoading(false);
        elements.errorMessage.textContent = data.message;
        modals.error.show();
    });

    socket.on('disconnect', () => {
        console.log('서버와 연결이 끊어졌습니다.');
        state.crawlInProgress = false;
        updateButtons(false);
        toggleLoading(false);
    });
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    console.log('페이지 로드됨');
    initLoadingOverlay();
    setupEventListeners();
    setupSocketHandlers();
});

// 채널명을 색상으로 변환하는 함수 추가
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = Math.abs(hash).toString(16).substring(0, 6);
    return '0'.repeat(6 - color.length) + color;
} 