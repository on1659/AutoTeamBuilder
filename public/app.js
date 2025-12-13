const socket = io({
    transports: ['websocket', 'polling']
});

// 소켓 연결 상태 확인
socket.on('connect', () => {
    console.log('✅ 서버 연결됨, socket.id:', socket.id);
});

socket.on('disconnect', () => {
    console.log('❌ 서버 연결 끊김');
    // 세션이 끊기면 landing section으로 돌아가기
    if (currentSessionId) {
        currentSessionId = null;
        isHost = false;
        currentUsers = [];
        sessionData = {
            players: [],
            teamConfig: [],
            restrictions: [],
            restrictionGroups: [],
            result: null
        };
        landingSection.style.display = 'block';
        sessionSection.style.display = 'none';
        resultSection.style.display = 'none';
        alert('서버 연결이 끊어졌습니다.');
    }
});

socket.on('connect_error', (error) => {
    console.error('❌ 서버 연결 오류:', error);
    alert('서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.');
});

let currentSessionId = null;
let isHost = false;
let currentUsers = []; // 현재 방의 참가자 목록
let sessionData = {
    players: [],
    teamConfig: [],
    restrictions: [],
    restrictionGroups: [], // 그룹 정보 저장: { name: string, members: string[] }
    result: null
};


// DOM 요소
const landingSection = document.getElementById('landing-section');
const sessionSection = document.getElementById('session-section');
const nicknameInput = document.getElementById('nickname-input');
const roomNameInput = document.getElementById('room-name-input');
const createRoomBtn = document.getElementById('create-room-btn');
const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
const roomList = document.getElementById('room-list');
const roomCount = document.getElementById('room-count');
const activeRoomCount = document.getElementById('active-room-count');
const currentSessionIdSpan = document.getElementById('current-session-id');
const currentHostNameSpan = document.getElementById('current-host-name');
const roleBadge = document.getElementById('role-badge');
const hostControls = document.getElementById('host-controls');
const viewerArea = document.getElementById('viewer-area');
const resultSection = document.getElementById('result-section');
const participantsList = document.getElementById('participants-list');
const participantsCount = document.getElementById('participants-count');

// 호스트 컨트롤 요소
const playersList = document.getElementById('players-list');
const playerCountBadge = document.getElementById('player-count-badge');
const playerNameInput = document.getElementById('player-name-input');
const addPlayerBtn = document.getElementById('add-player-btn');
const teamConfigList = document.getElementById('team-config-list');
const teamAssignmentBadge = document.getElementById('team-assignment-badge');
const teamNameInput = document.getElementById('team-name-input');
const teamSizeInput = document.getElementById('team-size-input');
const addTeamBtn = document.getElementById('add-team-btn');
const restrictionsLis = document.getElementById('restrictions-list');
const restrictionPlayersCheckboxes = document.getElementById('restriction-players-checkboxes');
const addRestrictionBtn = document.getElementById('add-restriction-btn');
const assignTeamsBtn = document.getElementById('assign-teams-btn');
const resetBtn = document.getElementById('reset-btn');

// 뷰어 요소
const viewerPlayerCount = document.getElementById('viewer-player-count');
const viewerPlayers = document.getElementById('viewer-players');
const viewerTeams = document.getElementById('viewer-teams');
const viewerRestrictions = document.getElementById('viewer-restrictions');

// 결과 요소
const resultMessage = document.getElementById('result-message');
const resultTeams = document.getElementById('result-teams');

// 이벤트 리스너
createRoomBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();
    const roomName = roomNameInput.value.trim();
    
    console.log('방 생성 버튼 클릭:', { nickname, roomName, socketConnected: socket.connected });
    
    if (!nickname) {
        alert('닉네임을 입력하세요');
        nicknameInput.focus();
        return;
    }
    
    if (nickname.length > 20) {
        alert('닉네임은 20자 이하로 입력하세요');
        nicknameInput.focus();
        return;
    }
    
    if (!roomName) {
        alert('방 이름을 입력하세요');
        roomNameInput.focus();
        return;
    }
    
    if (roomName.length > 30) {
        alert('방 이름은 30자 이하로 입력하세요');
        roomNameInput.focus();
        return;
    }
    
    if (!socket.connected) {
        alert('서버에 연결되지 않았습니다. 페이지를 새로고침해주세요.');
        console.error('소켓 연결 상태:', socket.connected);
        return;
    }
    
    console.log('방 생성 요청 전송:', { userName: nickname, roomName });
    socket.emit('create_session', { userName: nickname, roomName });
    roomNameInput.value = '';
});

refreshRoomsBtn.addEventListener('click', () => {
    socket.emit('get_room_list');
});

// Enter 키로 방 생성
roomNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        createRoomBtn.click();
    }
});

// 닉네임 입력 시 방 목록 업데이트 및 버튼 상태 변경
if (nicknameInput) {
    nicknameInput.addEventListener('input', () => {
        // 방 목록 다시 렌더링 (참가 버튼 활성화/비활성화)
        socket.emit('get_room_list');
        
        // 방 생성 버튼 활성화/비활성화
        const hasNickname = nicknameInput.value.trim().length > 0;
        if (createRoomBtn) {
            createRoomBtn.disabled = !hasNickname;
            if (!hasNickname) {
                createRoomBtn.title = '닉네임을 먼저 입력하세요';
            } else {
                createRoomBtn.title = '';
            }
        }
    });
}

// 페이지 로드 시 방 목록 가져오기
socket.emit('get_room_list');

addPlayerBtn.addEventListener('click', () => {
    const input = playerNameInput.value.trim();

    if (!input) {
        alert('플레이어 이름을 입력하세요');
        return;
    }

    // 쉼표로 구분하여 여러 이름 파싱
    const names = input.split(',')
        .map(name => name.trim())
        .filter(name => name.length > 0);

    if (names.length === 0) {
        alert('플레이어 이름을 입력하세요');
        return;
    }

    // 중복 체크 및 새 플레이어 목록 생성
    const newPlayers = [...sessionData.players];
    const duplicateNames = [];
    const addedNames = [];

    names.forEach(name => {
        if (sessionData.players.includes(name)) {
            duplicateNames.push(name);
        } else {
            newPlayers.push(name);
            addedNames.push(name);
        }
    });

    // 중복된 이름이 있으면 경고
    if (duplicateNames.length > 0) {
        alert(`이미 추가된 플레이어: ${duplicateNames.join(', ')}`);
    }

    // 새로 추가된 플레이어가 있으면 업데이트
    if (addedNames.length > 0) {
        socket.emit('update_players', { sessionId: currentSessionId, players: newPlayers });
        if (addedNames.length > 1) {
            console.log(`${addedNames.length}명의 플레이어가 추가되었습니다: ${addedNames.join(', ')}`);
        }
    } else if (duplicateNames.length > 0) {
        // 모든 이름이 중복이면 아무것도 하지 않음
        return;
    }
    
    playerNameInput.value = '';
});

// Enter 키로 플레이어 추가
playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addPlayerBtn.click();
    }
});

addTeamBtn.addEventListener('click', () => {
    // 이미 딱 맞으면 추가 불가
    const totalPlayers = sessionData.players.length;
    const assignedPlayers = sessionData.teamConfig.reduce((sum, team) => sum + team.size, 0);
    const remainingPlayers = totalPlayers - assignedPlayers;
    
    if (remainingPlayers === 0) {
        alert('팀 구성이 이미 완료되었습니다. 더 이상 팀을 추가할 수 없습니다.');
        return;
    }
    
    let name = teamNameInput.value.trim();
    const size = parseInt(teamSizeInput.value);

    if (!size || size < 1) {
        alert('인원을 올바르게 입력하세요');
        return;
    }
    
    // 팀 이름이 비어있으면 자동으로 번호 매기기
    if (!name) {
        const teamCount = sessionData.teamConfig.length;
        name = `${teamCount + 1}팀`;
    }
    
    // 추가하려는 인원이 남은 인원보다 많으면 경고
    if (size > remainingPlayers) {
        alert(`남은 인원(${remainingPlayers}명)보다 많은 인원을 추가할 수 없습니다.`);
        return;
    }

    const newConfig = [...sessionData.teamConfig, { name, size }];
    socket.emit('update_team_config', { sessionId: currentSessionId, teamConfig: newConfig });
    
    teamNameInput.value = '';
    teamSizeInput.value = '';
});

addRestrictionBtn.addEventListener('click', () => {
    // 선택된 플레이어들 가져오기
    const checkboxes = restrictionPlayersCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
    const selectedPlayers = Array.from(checkboxes).map(cb => cb.value);

    if (selectedPlayers.length < 2) {
        alert('최소 2명 이상 선택하세요');
        return;
    }

    // 선택된 플레이어들을 정렬 (가나다순)
    const sortedPlayers = [...selectedPlayers].sort((a, b) => {
        return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
    });

    // 선택된 플레이어들 간의 모든 쌍 생성
    const newRestrictions = [...sessionData.restrictions];
    const newRestrictionPairs = [];
    let addedCount = 0;

    for (let i = 0; i < sortedPlayers.length; i++) {
        for (let j = i + 1; j < sortedPlayers.length; j++) {
            const player1 = sortedPlayers[i];
            const player2 = sortedPlayers[j];
            
            // 중복 체크
            const exists = newRestrictions.some(r => 
                (r[0] === player1 && r[1] === player2) || (r[0] === player2 && r[1] === player1)
            );

            if (!exists) {
                newRestrictions.push([player1, player2]);
                newRestrictionPairs.push([player1, player2]);
                addedCount++;
            }
        }
    }

    if (addedCount === 0) {
        alert('선택한 플레이어들 간의 제약 조건이 이미 모두 추가되어 있습니다');
        return;
    }

    // 제약 조건 추가 전 팀 배정 가능 여부 검증
    const validationResult = validateTeamAssignment(
        sessionData.players,
        sessionData.teamConfig,
        newRestrictions
    );

    if (!validationResult.possible) {
        const confirmAdd = confirm(
            `⚠️ 경고: 이 제약 조건을 추가하면 팀 배정이 불가능할 수 있습니다.\n\n` +
            `${validationResult.reason}\n\n` +
            `그래도 추가하시겠습니까?`
        );
        
        if (!confirmAdd) {
            return;
        }
    }

    // 새로운 그룹 추가 (선택된 플레이어들을 하나의 그룹으로, 병합하지 않음)
    const newGroups = [...(sessionData.restrictionGroups || [])];
    newGroups.push({
        members: sortedPlayers
    });

    socket.emit('update_restrictions', { 
        sessionId: currentSessionId, 
        restrictions: newRestrictions,
        restrictionGroups: newGroups
    });

    // 체크박스 초기화
    checkboxes.forEach(cb => cb.checked = false);
});

assignTeamsBtn.addEventListener('click', () => {
    if (sessionData.players.length === 0) {
        alert('플레이어를 먼저 설정하세요');
        return;
    }

    if (sessionData.teamConfig.length === 0) {
        alert('팀 구성을 먼저 설정하세요');
        return;
    }

    socket.emit('assign_teams', { sessionId: currentSessionId });
});

resetBtn.addEventListener('click', () => {
    if (confirm('결과를 초기화하시겠습니까?')) {
        socket.emit('reset_result', { sessionId: currentSessionId });
    }
});

// Socket 이벤트 핸들러
socket.on('session_created', (data) => {
    console.log('방 생성 성공:', data);
    currentSessionId = data.sessionId;
    isHost = true;
    currentUsers = data.users || [];
    
    if (data.session) {
        sessionData = {
            ...data.session,
            restrictionGroups: data.session.restrictionGroups || []
        };
        updateUI();
        
        // 기존 배정 결과가 있으면 표시
        if (data.session.result) {
            sessionData.result = data.session.result;
            showResult();
        }
    }
    
    showSession(data.hostName || data.userName);
    updateParticipants();
});

socket.on('session_joined', (data) => {
    currentSessionId = data.sessionId;
    isHost = data.isHost;
    currentUsers = data.users || [];
    sessionData = {
        ...data.session,
        restrictionGroups: data.session.restrictionGroups || []
    };
    showSession(data.hostName);
    updateUI();
    updateParticipants();
    
    // 기존 배정 결과가 있으면 표시
    if (data.session.result) {
        sessionData.result = data.session.result;
        showResult();
    }
});

socket.on('players_updated', (data) => {
    sessionData.players = data.players;
    updateUI();
});

socket.on('team_config_updated', (data) => {
    sessionData.teamConfig = data.teamConfig;
    updateUI();
});

socket.on('restrictions_updated', (data) => {
    sessionData.restrictions = data.restrictions;
    if (data.restrictionGroups !== undefined) {
        sessionData.restrictionGroups = data.restrictionGroups;
    }
    updateUI();
});

socket.on('teams_assigned', (data) => {
    sessionData.result = data.result;
    showResult();
});

socket.on('result_reset', () => {
    sessionData.result = null;
    hideResult();
});

socket.on('error', (data) => {
    console.error('서버 에러:', data);
    alert(data.message || '오류가 발생했습니다.');
});

socket.on('users_updated', (data) => {
    currentUsers = data.users || [];
    updateParticipants();
});

socket.on('host_changed', (data) => {
    alert(data.message);
    // 호스트가 변경되었으므로 UI 업데이트
    isHost = currentUsers.some(u => u.id === socket.id && u.isHost);
    showSession();
});

socket.on('host_transferred', (data) => {
    alert(data.message);
    isHost = true;
    showSession();
});

socket.on('no_active_session', (data) => {
    alert(data.message);
});

socket.on('room_list', (data) => {
    updateRoomList(data);
    updateRoomStats(data);
});

socket.on('room_list_updated', (data) => {
    updateRoomList(data);
    updateRoomStats(data);
});

// 방 목록 업데이트
function updateRoomList(rooms) {
    if (!roomList) return;
    
    roomList.innerHTML = '';
    
    if (rooms.length === 0) {
        roomList.innerHTML = '<p class="empty-message">생성된 방이 없습니다</p>';
        return;
    }
    
    rooms.forEach(room => {
        const roomItem = document.createElement('div');
        roomItem.className = 'room-item';
        roomItem.innerHTML = `
            <div class="room-info">
                <h4>${room.roomName}</h4>
                <p>호스트: ${room.hostName || '알 수 없음'}</p>
                <p>참가자: ${room.participantCount}명</p>
                <p class="room-id">방 ID: ${room.sessionId}</p>
            </div>
            <button class="btn btn-primary" onclick="joinRoom('${room.sessionId}')">참가</button>
        `;
        roomList.appendChild(roomItem);
    });
}

// 방 통계 업데이트
function updateRoomStats(roomList) {
    if (roomCount) {
        roomCount.textContent = roomList.length;
    }
    if (activeRoomCount) {
        const activeRooms = roomList.filter(r => r.isActive).length;
        activeRoomCount.textContent = activeRooms;
    }
}

// 방 참가 함수
function joinRoom(sessionId) {
    if (!nicknameInput) {
        alert('닉네임 입력 필드를 찾을 수 없습니다.');
        return;
    }
    
    const nickname = nicknameInput.value.trim();
    
    if (!nickname) {
        alert('닉네임을 입력하지 않아서 방에 입장할 수 없습니다.\n\n닉네임을 입력한 후 다시 시도해주세요.');
        nicknameInput.focus();
        return;
    }
    
    if (nickname.length > 20) {
        alert(`닉네임이 너무 깁니다 (${nickname.length}자).\n\n닉네임은 20자 이하로 입력해주세요.`);
        nicknameInput.focus();
        return;
    }
    
    console.log('방 입장 요청:', { sessionId, userName: nickname });
    socket.emit('join_room', { sessionId, userName: nickname });
}

// 전역 스코프에 함수 노출
window.joinRoom = joinRoom;

// 참가자 목록 업데이트
function updateParticipants() {
    if (!participantsList || !participantsCount) return;
    
    participantsCount.textContent = currentUsers.length;
    
    participantsList.innerHTML = '';
    
    if (currentUsers.length === 0) {
        participantsList.innerHTML = '<p class="empty-message">참가자가 없습니다</p>';
        return;
    }
    
    currentUsers.forEach(user => {
        const isCurrentUser = user.id === socket.id;
        const participantBadge = document.createElement('div');
        participantBadge.className = 'participant-badge';
        
        const userName = user.userName || '알 수 없음';
        const displayName = isCurrentUser ? `${userName} (나)` : userName;
        
        participantBadge.textContent = displayName;
        participantsList.appendChild(participantBadge);
    });
}

// UI 함수
function showSession(hostName) {
    landingSection.style.display = 'none';
    sessionSection.style.display = 'block';
    
    // 호스트 닉네임 표시
    if (currentHostNameSpan) {
        currentHostNameSpan.textContent = hostName || '알 수 없음';
    }
    
    if (isHost) {
        roleBadge.textContent = '호스트';
        roleBadge.className = 'role-badge host';
    } else {
        roleBadge.textContent = '관전자';
        roleBadge.className = 'role-badge viewer';
    }
    
    updateParticipants();
    
    // 호스트와 관전자 모두 같은 UI를 보되, 관전자는 입력/버튼 숨김
    hostControls.style.display = 'block';
    viewerArea.style.display = 'none';
    
    // 관전자일 때 입력 필드와 추가/배정 버튼 숨기기
    if (!isHost) {
        const inputFields = hostControls.querySelectorAll('input, textarea');
        inputFields.forEach(el => {
            el.style.display = 'none';
        });
        
        const addButtons = hostControls.querySelectorAll('#add-player-btn, #add-team-btn, #add-restriction-btn, #assign-teams-btn, #reset-btn');
        addButtons.forEach(btn => {
            btn.style.display = 'none';
        });
        
        // 가이드 텍스트도 숨기기
        const guideText = hostControls.querySelector('.player-input-guide');
        if (guideText) {
            guideText.style.display = 'none';
        }
    } else {
        // 호스트일 때는 모든 요소 표시
        const allElements = hostControls.querySelectorAll('input, button, textarea, .player-input-guide');
        allElements.forEach(el => {
            el.style.display = '';
        });
    }
}

function updateUI() {
    updateHostUI();
    // 관전자도 같은 UI를 보므로 updateViewerUI는 사용하지 않음
}

// 팀 배정 가능 여부 검증 (클라이언트)
function validateTeamAssignment(players, teamConfig, restrictions) {
    // 기본 검증
    if (players.length === 0) {
        return { possible: true, reason: '' };
    }

    if (teamConfig.length === 0) {
        return { possible: true, reason: '팀 구성이 설정되지 않았습니다.' };
    }

    const totalSlots = teamConfig.reduce((sum, team) => sum + team.size, 0);
    if (players.length !== totalSlots) {
        return { 
            possible: true, 
            reason: `플레이어 수(${players.length})와 팀 인원 수(${totalSlots})가 맞지 않습니다.` 
        };
    }

    if (!restrictions || restrictions.length === 0) {
        return { possible: true, reason: '' };
    }

    // 제약 조건이 너무 많으면 배정 불가능할 가능성이 높음
    // 간단한 휴리스틱: 각 플레이어가 너무 많은 제약 조건에 포함되어 있는지 확인
    const playerRestrictionCount = {};
    players.forEach(player => {
        playerRestrictionCount[player] = 0;
    });

    restrictions.forEach(restriction => {
        playerRestrictionCount[restriction[0]] = (playerRestrictionCount[restriction[0]] || 0) + 1;
        playerRestrictionCount[restriction[1]] = (playerRestrictionCount[restriction[1]] || 0) + 1;
    });

    // 각 플레이어가 배정 가능한 팀 수 계산
    const teamSizes = teamConfig.map(t => t.size);
    const maxTeamSize = Math.max(...teamSizes);
    
    // 제약 조건이 너무 많으면 배정이 어려울 수 있음
    // 실제로 시뮬레이션을 몇 번 시도해보기
    const MAX_ATTEMPTS = 1000; // 빠른 검증을 위해 적은 횟수
    let attempt = 0;
    let success = false;

    while (attempt < MAX_ATTEMPTS && !success) {
        attempt++;
        
        // 플레이어 섞기
        const shuffled = [...players].sort(() => Math.random() - 0.5);
        
        // 팀 구성
        const teams = [];
        let index = 0;
        
        for (let i = 0; i < teamConfig.length; i++) {
            const teamSize = teamConfig[i].size;
            const teamMembers = shuffled.slice(index, index + teamSize);
            teams.push({
                name: teamConfig[i].name,
                members: teamMembers
            });
            index += teamSize;
        }

        // 제약 조건 검증
        let valid = true;
        for (const restriction of restrictions) {
            const player1 = restriction[0];
            const player2 = restriction[1];
            
            for (const team of teams) {
                if (team.members.includes(player1) && team.members.includes(player2)) {
                    valid = false;
                    break;
                }
            }
            if (!valid) break;
        }

        if (valid) {
            success = true;
        }
    }

    if (!success) {
        return {
            possible: false,
            reason: '같은팀 금지 설정으로 인하여 팀 배정이 불가능할 수 있습니다.\n제약 조건을 완화하거나 팀 구성을 변경해주세요.'
        };
    }

    return { possible: true, reason: '' };
}

function updateHostUI() {
    // 플레이어 수 업데이트
    if (playerCountBadge) {
        playerCountBadge.textContent = `(총 ${sessionData.players.length}명)`;
    }
    
    // 플레이어 리스트
    playersList.innerHTML = '';
    sessionData.players.forEach((player, index) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        const deleteBtn = isHost ? `<button class="btn btn-danger" onclick="removePlayer(${index})">삭제</button>` : '';
        div.innerHTML = `
            <span><strong>${player}</strong></span>
            ${deleteBtn}
        `;
        playersList.appendChild(div);
    });

    // 팀 구성 배지 업데이트
    if (teamAssignmentBadge) {
        const totalPlayers = sessionData.players.length;
        const assignedPlayers = sessionData.teamConfig.reduce((sum, team) => sum + team.size, 0);
        const remainingPlayers = totalPlayers - assignedPlayers;
        
        // 배지 텍스트 설정 (음수일 때 - 표시)
        if (remainingPlayers < 0) {
            teamAssignmentBadge.textContent = `(${remainingPlayers}/${totalPlayers})`;
        } else {
            teamAssignmentBadge.textContent = `(${remainingPlayers}/${totalPlayers})`;
        }
        
        // 색상 설정
        if (remainingPlayers === 0) {
            // 딱 맞으면 초록색
            teamAssignmentBadge.style.color = '#28a745';
        } else if (remainingPlayers < 0) {
            // 초과되면 빨간색
            teamAssignmentBadge.style.color = '#dc3545';
        } else {
            // 남은 인원이 있으면 기본색
            teamAssignmentBadge.style.color = '#667eea';
        }
    }
    
    // 팀 추가 버튼 비활성화 (딱 맞으면)
    const totalPlayers = sessionData.players.length;
    const assignedPlayers = sessionData.teamConfig.reduce((sum, team) => sum + team.size, 0);
    const remainingPlayers = totalPlayers - assignedPlayers;
    
    if (remainingPlayers === 0) {
        addTeamBtn.disabled = true;
        addTeamBtn.style.opacity = '0.5';
        addTeamBtn.style.cursor = 'not-allowed';
    } else {
        addTeamBtn.disabled = false;
        addTeamBtn.style.opacity = '1';
        addTeamBtn.style.cursor = 'pointer';
    }
    
    // 팀 구성 리스트
    teamConfigList.innerHTML = '';
    sessionData.teamConfig.forEach((team, index) => {
        const div = document.createElement('div');
        div.className = 'team-item';
        const deleteBtn = isHost ? `<button class="btn btn-danger" onclick="removeTeam(${index})">삭제</button>` : '';
        div.innerHTML = `
            <span><strong>${team.name}</strong> - ${team.size}명</span>
            ${deleteBtn}
        `;
        teamConfigList.appendChild(div);
    });

    // 제약 조건 셀렉트 업데이트
    updateRestrictionSelects();

    // 제약 조건 리스트
    restrictionsLis.innerHTML = '';
    
    if (!sessionData.restrictionGroups || sessionData.restrictionGroups.length === 0) {
        restrictionsLis.innerHTML = '<p style="color: #999; font-style: italic; text-align: center; padding: 10px;">제약 조건이 없습니다</p>';
    } else {
        // 저장된 그룹 정보를 사용해서 표시
        sessionData.restrictionGroups.forEach((group, groupIndex) => {
            if (!group.members || group.members.length === 0) return;
            
            // 그룹의 플레이어들을 가나다순으로 정렬
            const sortedMembers = [...group.members].sort((a, b) => {
                return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
            });
            
            const div = document.createElement('div');
            div.className = 'restriction-item';
            
            const deleteBtn = isHost ? `<button class="btn btn-danger" onclick="removeRestrictionGroup(${groupIndex})">삭제</button>` : '';
            
            div.innerHTML = `
                <span><strong>${sortedMembers.join(', ')}</strong> (같은 팀 불가)</span>
                ${deleteBtn}
            `;
            restrictionsLis.appendChild(div);
        });
    }
}

function updateViewerUI() {
    // 플레이어 표시
    viewerPlayerCount.textContent = sessionData.players.length;
    if (sessionData.players.length > 0) {
        viewerPlayers.innerHTML = '<p>' + sessionData.players.join(', ') + '</p>';
    } else {
        viewerPlayers.innerHTML = '<p class="empty">플레이어가 설정되지 않았습니다</p>';
    }

    // 팀 구성 표시
    if (sessionData.teamConfig.length > 0) {
        const teamText = sessionData.teamConfig.map(t => `${t.name} (${t.size}명)`).join(', ');
        const totalSlots = sessionData.teamConfig.reduce((sum, t) => sum + t.size, 0);
        viewerTeams.innerHTML = `<p>${teamText}</p><p>총 인원: ${totalSlots}명</p>`;
    } else {
        viewerTeams.innerHTML = '<p class="empty">팀 구성이 설정되지 않았습니다</p>';
    }

    // 제약 조건 표시
    if (sessionData.restrictions.length > 0) {
        const restrictionText = sessionData.restrictions.map(r => `${r[0]} ↔️ ${r[1]}`).join('<br>');
        viewerRestrictions.innerHTML = `<p>${restrictionText}</p>`;
    } else {
        viewerRestrictions.innerHTML = '<p class="empty">제약 조건이 없습니다</p>';
    }
}

function updateRestrictionSelects() {
    restrictionPlayersCheckboxes.innerHTML = '';
    if (sessionData.players.length === 0) {
        restrictionPlayersCheckboxes.innerHTML = '<p style="color: #999; font-style: italic; text-align: center; padding: 20px;">플레이어를 먼저 추가하세요</p>';
        return;
    }
    
    sessionData.players.forEach(player => {
        const label = document.createElement('label');
        label.style.cssText = 'display: flex; align-items: center; cursor: pointer;';
        label.innerHTML = `
            <input type="checkbox" value="${player}" style="margin-right: 8px; width: 18px; height: 18px; cursor: pointer;">
            <span>${player}</span>
        `;
        restrictionPlayersCheckboxes.appendChild(label);
    });
}

function showResult() {
    const result = sessionData.result;
    
    if (result.success) {
        resultMessage.className = '';
        resultMessage.textContent = result.message;
        
        resultTeams.innerHTML = '';
        result.teams.forEach(team => {
            // 멤버를 가나다/abc순으로 정렬
            const sortedMembers = [...team.members].sort((a, b) => {
                return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
            });
            
            const div = document.createElement('div');
            div.className = 'result-team';
            div.innerHTML = `
                <h4>${team.name}</h4>
                <ul>
                    ${sortedMembers.map(m => `<li>${m}</li>`).join('')}
                </ul>
            `;
            resultTeams.appendChild(div);
        });
    } else {
        resultMessage.className = 'error';
        // 줄바꿈을 <br>로 변환
        const message = result.message.replace(/\n/g, '<br>');
        resultMessage.innerHTML = '❌ ' + message;
        resultTeams.innerHTML = '';
    }

    resultSection.style.display = 'block';
    if (isHost) {
        resetBtn.style.display = 'block';
    }
}

function hideResult() {
    resultSection.style.display = 'none';
    if (isHost) {
        resetBtn.style.display = 'none';
    }
}

// 전역 함수 (HTML onclick에서 사용)
function removePlayer(index) {
    const newPlayers = sessionData.players.filter((_, i) => i !== index);
    socket.emit('update_players', { sessionId: currentSessionId, players: newPlayers });
}

function removeTeam(index) {
    const newConfig = sessionData.teamConfig.filter((_, i) => i !== index);
    socket.emit('update_team_config', { sessionId: currentSessionId, teamConfig: newConfig });
}

function removeRestriction(index) {
    const newRestrictions = sessionData.restrictions.filter((_, i) => i !== index);
    socket.emit('update_restrictions', { 
        sessionId: currentSessionId, 
        restrictions: newRestrictions,
        restrictionGroups: sessionData.restrictionGroups || []
    });
}

function removeRestrictionIndices(indices) {
    try {
        // 지정된 인덱스의 제약 조건들 제거
        const indicesSet = new Set(indices);
        const newRestrictions = sessionData.restrictions.filter((_, index) => {
            return !indicesSet.has(index);
        });

        socket.emit('update_restrictions', { 
            sessionId: currentSessionId, 
            restrictions: newRestrictions,
            restrictionGroups: sessionData.restrictionGroups || []
        });
    } catch (e) {
        console.error('제약 조건 삭제 오류:', e);
        alert('제약 조건 삭제 중 오류가 발생했습니다: ' + e.message);
    }
}

// 기존 함수 호환성 유지 (사용하지 않지만 에러 방지)
function removeRestrictionGroupByIndex(groupIndex) {
    console.warn('removeRestrictionGroupByIndex는 더 이상 사용되지 않습니다.');
}

function removeRestrictionGroup(groupIndex) {
    try {
        if (!sessionData.restrictionGroups || groupIndex < 0 || groupIndex >= sessionData.restrictionGroups.length) {
            console.error('잘못된 그룹 인덱스:', groupIndex);
            return;
        }

        const group = sessionData.restrictionGroups[groupIndex];
        if (!group || !group.members) {
            console.error('그룹 정보가 없습니다:', group);
            return;
        }

        // 그룹 삭제
        const newGroups = sessionData.restrictionGroups.filter((_, i) => i !== groupIndex);
        
        // 이 그룹에 속한 제약 조건들만 제거
        // 그룹의 모든 플레이어 쌍이 포함된 제약 조건을 찾아서 제거
        const newRestrictions = sessionData.restrictions.filter(restriction => {
            const [player1, player2] = restriction;
            const isInThisGroup = group.members.includes(player1) && group.members.includes(player2);
            
            if (!isInThisGroup) {
                return true; // 이 그룹에 속하지 않으면 유지
            }
            
            // 이 그룹에 속하지만, 다른 그룹에도 속해있으면 유지
            let belongsToOtherGroup = false;
            newGroups.forEach(otherGroup => {
                if (otherGroup.members && 
                    otherGroup.members.includes(player1) && 
                    otherGroup.members.includes(player2)) {
                    belongsToOtherGroup = true;
                }
            });
            
            // 다른 그룹에도 속해있으면 유지, 이 그룹에만 속해있으면 제거
            return belongsToOtherGroup;
        });

        socket.emit('update_restrictions', { 
            sessionId: currentSessionId, 
            restrictions: newRestrictions,
            restrictionGroups: newGroups
        });
    } catch (e) {
        console.error('제약 조건 그룹 삭제 오류:', e);
        alert('제약 조건 삭제 중 오류가 발생했습니다: ' + e.message);
    }
}

// 전역 스코프에 함수 노출
window.removePlayer = removePlayer;
window.removeTeam = removeTeam;
window.removeRestriction = removeRestriction;
window.removeRestrictionIndices = removeRestrictionIndices;
window.removeRestrictionGroup = removeRestrictionGroup;
