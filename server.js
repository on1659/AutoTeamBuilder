const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"]
    }
});
const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

// 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));

// 세션 데이터 저장
const sessions = new Map();
let activeSessionId = null; // 가장 최근 활성 세션 ID

// 팀 배정 알고리즘
function assignTeams(players, teamConfig, restrictions) {
    const result = {
        success: false,
        teams: [],
        message: ''
    };

    // 검증
    const totalSlots = teamConfig.reduce((sum, team) => sum + team.size, 0);
    if (players.length !== totalSlots) {
        result.message = `플레이어 수(${players.length})와 팀 인원 수(${totalSlots})가 맞지 않습니다.`;
        return result;
    }
    
    // 필수 플레이어 검증
    const allRequiredPlayers = [];
    for (const team of teamConfig) {
        const requiredPlayers = team.requiredPlayers || [];
        // 필수 플레이어 수가 팀 인원보다 많으면 안 됨
        if (requiredPlayers.length > team.size) {
            result.message = `팀 "${team.name}"의 필수 플레이어 수(${requiredPlayers.length}명)가 팀 인원(${team.size}명)보다 많습니다.`;
            return result;
        }
        // 필수 플레이어가 플레이어 목록에 있는지 확인
        for (const requiredPlayer of requiredPlayers) {
            if (!players.includes(requiredPlayer)) {
                result.message = `필수 플레이어 "${requiredPlayer}"가 플레이어 목록에 없습니다.`;
                return result;
            }
            // 중복 확인
            if (allRequiredPlayers.includes(requiredPlayer)) {
                result.message = `필수 플레이어 "${requiredPlayer}"가 여러 팀에 중복 지정되었습니다.`;
                return result;
            }
            allRequiredPlayers.push(requiredPlayer);
        }
    }

    // 최대 시도 횟수
    const MAX_ATTEMPTS = 10000;
    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {        
        attempt++;
        
        // 플레이어 섞기
        const shuffled = [...players].sort(() => Math.random() - 0.5);
        const availablePlayers = [...shuffled];
        
        // 팀 구성
        const teams = [];
        
        for (let i = 0; i < teamConfig.length; i++) {
            const teamSize = teamConfig[i].size;
            const team = {
                name: teamConfig[i].name,
                members: []
            };
            
            // 필수 플레이어 먼저 배정
            const requiredPlayers = teamConfig[i].requiredPlayers || [];
            for (const requiredPlayer of requiredPlayers) {
                if (availablePlayers.includes(requiredPlayer)) {
                    team.members.push(requiredPlayer);
                    const playerIndex = availablePlayers.indexOf(requiredPlayer);
                    availablePlayers.splice(playerIndex, 1);
                }
            }
            
            // 나머지 인원 랜덤 배정
            const remainingSlots = teamSize - team.members.length;
            for (let j = 0; j < remainingSlots && availablePlayers.length > 0; j++) {
                const randomIndex = Math.floor(Math.random() * availablePlayers.length);
                team.members.push(availablePlayers[randomIndex]);
                availablePlayers.splice(randomIndex, 1);
            }
            
            teams.push(team);
        }

        // 필수 플레이어가 올바른 팀에 배정되었는지 검증
        let requiredPlayersValid = true;
        for (let i = 0; i < teamConfig.length; i++) {
            const requiredPlayers = teamConfig[i].requiredPlayers || [];
            const team = teams[i];
            
            for (const requiredPlayer of requiredPlayers) {
                if (!team.members.includes(requiredPlayer)) {
                    requiredPlayersValid = false;
                    break;
                }
            }
            if (!requiredPlayersValid) break;
        }
        
        // 필수 플레이어 검증 및 제약 조건 검증
        if (requiredPlayersValid && validateRestrictions(teams, restrictions)) {
            result.success = true;
            result.teams = teams;
            result.message = `${attempt}번 시도 후 성공`;
            return result;
        }
    }

    result.message = `같은팀 금지 설정으로 인하여 팀 배정이 불가능합니다.\n\n제약 조건을 완화하거나 팀 구성을 변경해주세요.`;
    return result;
}

// 제약 조건 검증
function validateRestrictions(teams, restrictions) {
    if (!restrictions || restrictions.length === 0) {
        return true;
    }

    for (const restriction of restrictions) {
        const player1 = restriction[0];
        const player2 = restriction[1];

        // 같은 팀에 있는지 확인
        for (const team of teams) {
            if (team.members.includes(player1) && team.members.includes(player2)) {
                return false;
            }
        }
    }

    return true;
}

io.on('connection', (socket) => {
    console.log('새로운 연결:', socket.id);

    // Host로 방 생성
    socket.on('create_session', async (data) => {
        console.log('방 생성 요청 받음:', data);
        const { userName, roomName: inputRoomName } = data || {};
        
        // 닉네임 검증
        if (!userName || typeof userName !== 'string' || userName.trim().length === 0) {
            console.log('닉네임 검증 실패:', userName);
            socket.emit('error', { message: '올바른 닉네임을 입력해주세요!' });
            return;
        }
        
        if (userName.trim().length > 20) {
            socket.emit('error', { message: '닉네임은 20자 이하로 입력해주세요!' });
            return;
        }
        
        // 방 이름 검증
        if (!inputRoomName || typeof inputRoomName !== 'string' || inputRoomName.trim().length === 0) {
            console.log('방 이름 검증 실패:', inputRoomName);
            socket.emit('error', { message: '올바른 방 이름을 입력해주세요!' });
            return;
        }
        
        if (inputRoomName.trim().length > 30) {
            socket.emit('error', { message: '방 이름은 30자 이하로 입력해주세요!' });
            return;
        }
        
        const hostName = userName.trim();
        
        // 중복 로그인 체크 - 같은 닉네임이 다른 방에 이미 연결되어 있는지 확인
        const allSockets = await io.fetchSockets();
        const connectedUserWithSameName = allSockets.find(s => 
            s.userName === hostName && 
            s.connected && 
            s.id !== socket.id &&
            s.currentSessionId
        );
        
        if (connectedUserWithSameName) {
            socket.emit('error', { message: '이미 다른 방에서 사용 중인 닉네임입니다! 다른 닉네임을 사용해주세요.' });
            return;
        }
        
        const sessionId = generateSessionId();
        const roomName = inputRoomName.trim();
        
        sessions.set(sessionId, {
            host: socket.id,
            hostName: hostName,
            roomName: roomName,
            users: [{ id: socket.id, userName: hostName, isHost: true }], // 참가자 목록
            players: [],
            teamConfig: [],
            restrictions: [],
            restrictionGroups: [],
            result: null,
            createdAt: Date.now(),
            emptyAt: null // 빈 방이 된 시간 (null이면 사용자가 있음)
        });

        // 소켓에 사용자 정보 저장
        socket.userName = hostName;
        socket.currentSessionId = sessionId;

        activeSessionId = sessionId; // 가장 최근 방을 활성 세션으로 설정
        socket.join(sessionId);
        socket.emit('session_created', { 
            sessionId, 
            roomName, 
            userName: hostName,
            hostName: hostName, // 호스트 닉네임 전송
            users: sessions.get(sessionId).users, // 참가자 목록 전송
            session: {
                players: sessions.get(sessionId).players,
                teamConfig: sessions.get(sessionId).teamConfig,
                restrictions: sessions.get(sessionId).restrictions,
                restrictionGroups: sessions.get(sessionId).restrictionGroups || [],
                result: sessions.get(sessionId).result
            }
        });
        
        // 모든 클라이언트에 방 목록 업데이트 알림
        io.emit('room_list_updated', getRoomList());
        
        console.log('세션 생성 (Host):', sessionId, roomName, hostName, socket.id);
    });

    // 방 목록 가져오기
    socket.on('get_room_list', () => {
        socket.emit('room_list', getRoomList());
    });

    // 방 참가
    socket.on('join_room', async (data) => {
        const { sessionId, userName: inputUserName } = data || {};
        
        // 닉네임 검증
        if (!inputUserName || typeof inputUserName !== 'string' || inputUserName.trim().length === 0) {
            socket.emit('error', { message: '올바른 닉네임을 입력해주세요!' });
            return;
        }
        
        if (inputUserName.trim().length > 20) {
            socket.emit('error', { message: '닉네임은 20자 이하로 입력해주세요!' });
            return;
        }
        
        if (!sessionId) {
            socket.emit('error', { message: '방 ID를 입력해주세요!' });
            return;
        }
        
        const session = sessions.get(sessionId);

        if (!session) {
            socket.emit('error', { message: '방을 찾을 수 없습니다.' });
            return;
        }

        const userName = inputUserName.trim();
        
        // 중복 닉네임 체크 - 같은 닉네임이 이미 연결되어 있는지 확인
        const socketsInRoom = await io.in(sessionId).fetchSockets();
        const connectedUserWithSameName = socketsInRoom.find(s => 
            s.userName === userName && 
            s.connected && 
            s.id !== socket.id
        );
        
        if (connectedUserWithSameName) {
            socket.emit('error', { message: '이미 사용 중인 닉네임입니다! 다른 닉네임을 사용해주세요.' });
            return;
        }
        
        // 같은 닉네임의 기존 사용자 찾기 (연결이 끊어진 경우)
        const existingUserInSession = session.users.find(u => u.userName === userName && u.id !== socket.id);
        
        // 호스트 닉네임으로 재접속하는 경우도 확인
        const isHostNameReconnect = session.hostName === userName;
        
        // 소켓에 사용자 정보 저장
        socket.userName = userName;
        socket.currentSessionId = sessionId;

        socket.join(sessionId);
        
        let isHost = false;
        
        // 기존 사용자 정보 업데이트 또는 새로 추가
        const existingUserIndex = session.users.findIndex(u => u.id === socket.id);
        
        if (existingUserInSession) {
            // 같은 닉네임으로 재접속하는 경우 - 기존 호스트 권한 복원
            const wasHost = existingUserInSession.isHost;
            
            if (existingUserIndex !== -1) {
                // 같은 socket.id로 재연결
                session.users[existingUserIndex].userName = userName;
                session.users[existingUserIndex].isHost = wasHost;
                isHost = wasHost;
                
                if (wasHost) {
                    // 호스트 권한 복원
                    session.host = socket.id;
                    session.hostName = userName;
                }
            } else {
                // 다른 socket.id로 재접속 (기존 사용자 제거하고 새로 추가)
                session.users = session.users.filter(u => u.id !== existingUserInSession.id);
                session.users.push({ id: socket.id, userName: userName, isHost: wasHost });
                isHost = wasHost;
                
                if (wasHost) {
                    // 호스트 권한 복원
                    session.host = socket.id;
                    session.hostName = userName;
                }
            }
        } else if (isHostNameReconnect) {
            // 호스트 닉네임으로 재접속하는 경우 - 호스트 권한 복원
            if (existingUserIndex !== -1) {
                // 같은 socket.id로 재연결
                session.users[existingUserIndex].userName = userName;
                session.users[existingUserIndex].isHost = true;
                isHost = true;
                session.host = socket.id;
                session.hostName = userName;
            } else {
                // 다른 socket.id로 재접속
                session.users.push({ id: socket.id, userName: userName, isHost: true });
                isHost = true;
                session.host = socket.id;
                session.hostName = userName;
            }
            console.log(`호스트 권한 복원: ${userName} (${sessionId})`);
        } else {
            // 새 참가자 또는 재연결 (같은 socket.id)
            if (existingUserIndex !== -1) {
                // 재연결인 경우
                isHost = session.users[existingUserIndex].isHost;
                session.users[existingUserIndex].userName = userName;
            } else {
                // 새 참가자
                isHost = socket.id === session.host;
                session.users.push({ id: socket.id, userName: userName, isHost: isHost });
            }
        }
        
        socket.emit('session_joined', {
            sessionId,
            isHost,
            userName: userName,
            roomName: session.roomName,
            hostName: session.hostName, // 호스트 닉네임 전송
            users: session.users, // 참가자 목록 전송
            session: {
                players: session.players,
                teamConfig: session.teamConfig,
                restrictions: session.restrictions,
                restrictionGroups: session.restrictionGroups || [],
                result: session.result
            }
        });
        
        // 빈 방이었는데 누가 들어왔으므로 타이머 리셋
        if (session.emptyAt !== null) {
            session.emptyAt = null;
            console.log(`방 ${session.roomName} (${sessionId}) 타이머 리셋 - ${userName} 입장`);
        }
        
        // 모든 참가자에게 업데이트된 사용자 목록 전송
        io.to(sessionId).emit('users_updated', { users: session.users });
        
        // 호스트 권한이 복원된 경우 알림
        if (isHost && existingUserInSession && existingUserInSession.isHost) {
            io.to(sessionId).emit('host_changed', {
                newHostId: socket.id,
                newHostName: userName,
                message: `${userName}님이 호스트 권한을 복원했습니다.`
            });
            io.emit('room_list_updated', getRoomList());
        }

        console.log('방 참가:', sessionId, userName, 'Host:', isHost);
    });

    // 자동 참가: 가장 최근 활성 세션에 자동으로 참가
    socket.on('auto_join', () => {
        if (activeSessionId && sessions.has(activeSessionId)) {
            const session = sessions.get(activeSessionId);
            socket.join(activeSessionId);
            const isHost = socket.id === session.host;
            
            socket.emit('session_joined', {
                sessionId: activeSessionId,
                isHost,
                session: {
                    players: session.players,
                    teamConfig: session.teamConfig,
                    restrictions: session.restrictions,
                    restrictionGroups: session.restrictionGroups || [],
                    result: session.result
                }
            });

            console.log('자동 참가:', activeSessionId, 'Host:', isHost);
        } else {
            // 활성 세션이 없으면 가장 최근에 만든 세션 찾기
            let latestSession = null;
            let latestTime = 0;
            
            for (const [sessionId, session] of sessions.entries()) {
                if (session.createdAt > latestTime) {
                    latestTime = session.createdAt;
                    latestSession = { sessionId, session };
                }
            }
            
            if (latestSession) {
                activeSessionId = latestSession.sessionId;
                const session = latestSession.session;
                socket.join(activeSessionId);
                const isHost = socket.id === session.host;
                
                socket.emit('session_joined', {
                    sessionId: activeSessionId,
                    isHost,
                    session: {
                        players: session.players,
                        teamConfig: session.teamConfig,
                        restrictions: session.restrictions,
                        restrictionGroups: session.restrictionGroups || [],
                        result: session.result
                    }
                });
                
                console.log('자동 참가 (최근 세션):', activeSessionId, 'Host:', isHost);
            } else {
                socket.emit('no_active_session', { message: '활성 세션이 없습니다. Host가 먼저 방을 만들어주세요.' });
            }
        }
    });

    // 세션 참가 (기존 호환성 유지)
    socket.on('join_session', (data) => {
        const { sessionId } = data;
        const session = sessions.get(sessionId);

        if (!session) {
            socket.emit('error', { message: '세션을 찾을 수 없습니다.' });
            return;
        }

        socket.join(sessionId);
        const isHost = socket.id === session.host;
        
        socket.emit('session_joined', {
            sessionId,
            isHost,
            session: {
                players: session.players,
                teamConfig: session.teamConfig,
                restrictions: session.restrictions,
                restrictionGroups: session.restrictionGroups || [],
                result: session.result
            }
        });

        console.log('세션 참가:', sessionId, 'Host:', isHost);
    });

    // 플레이어 설정 업데이트
    socket.on('update_players', (data) => {
        const { sessionId, players } = data;
        const session = sessions.get(sessionId);

        if (!session || session.host !== socket.id) {
            socket.emit('error', { message: '권한이 없습니다.' });
            return;
        }

        session.players = players;
        io.to(sessionId).emit('players_updated', { players });
    });

    // 팀 설정 업데이트
    socket.on('update_team_config', (data) => {
        const { sessionId, teamConfig } = data;
        const session = sessions.get(sessionId);

        if (!session || session.host !== socket.id) {
            socket.emit('error', { message: '권한이 없습니다.' });
            return;
        }

        session.teamConfig = teamConfig;
        io.to(sessionId).emit('team_config_updated', { teamConfig });
    });

    // 제약 조건 업데이트
    socket.on('update_restrictions', (data) => {
        const { sessionId, restrictions, restrictionGroups } = data;
        const session = sessions.get(sessionId);

        if (!session || session.host !== socket.id) {
            socket.emit('error', { message: '권한이 없습니다.' });
            return;
        }

        session.restrictions = restrictions;
        if (restrictionGroups !== undefined) {
            session.restrictionGroups = restrictionGroups;
        }
        io.to(sessionId).emit('restrictions_updated', { 
            restrictions,
            restrictionGroups: session.restrictionGroups 
        });
    });

    // 팀 배정 실행
    socket.on('assign_teams', (data) => {
        const { sessionId } = data;
        const session = sessions.get(sessionId);

        if (!session || session.host !== socket.id) {
            socket.emit('error', { message: '권한이 없습니다.' });
            return;
        }

        const result = assignTeams(session.players, session.teamConfig, session.restrictions);
        session.result = result;

        io.to(sessionId).emit('teams_assigned', { result });
    });

    // 결과 초기화
    socket.on('reset_result', (data) => {
        const { sessionId } = data;
        const session = sessions.get(sessionId);

        if (!session || session.host !== socket.id) {
            socket.emit('error', { message: '권한이 없습니다.' });
            return;
        }

        session.result = null;
        io.to(sessionId).emit('result_reset');
    });

    // 방 삭제
    socket.on('delete_room', (data) => {
        const { sessionId } = data;
        const session = sessions.get(sessionId);

        if (!session) {
            socket.emit('error', { message: '방을 찾을 수 없습니다.' });
            return;
        }

        if (session.host !== socket.id) {
            socket.emit('error', { message: '호스트만 방을 삭제할 수 있습니다.' });
            return;
        }

        // 방에 있는 모든 사용자에게 방 삭제 알림
        io.to(sessionId).emit('room_deleted', { 
            message: '방이 삭제되었습니다.',
            roomName: session.roomName 
        });

        // 방 삭제
        sessions.delete(sessionId);
        
        // 방 목록 업데이트
        io.emit('room_list_updated', getRoomList());
        
        console.log(`방 삭제: ${session.roomName} (${sessionId}) - 호스트가 삭제함`);
    });

    socket.on('disconnect', async () => {
        console.log('연결 해제:', socket.id, socket.userName);
        
        if (socket.currentSessionId) {
            const sessionId = socket.currentSessionId;
            const session = sessions.get(sessionId);
            
            if (session) {
                const wasHost = socket.id === session.host;
                const userName = socket.userName || '알 수 없음';
                
                // 사용자 목록에서 제거
                session.users = session.users.filter(u => u.id !== socket.id);
                
                if (wasHost) {
                    // 호스트가 나가는 경우
                    if (session.users.length > 0) {
                        // 첫 번째 사용자를 새 호스트로 지정
                        const newHost = session.users[0];
                        newHost.isHost = true;
                        
                        // 새 호스트의 소켓 찾기 및 설정
                        const socketsInRoom = await io.in(sessionId).fetchSockets();
                        const newHostSocket = socketsInRoom.find(s => s.id === newHost.id);
                        
                        if (newHostSocket) {
                            session.host = newHost.id;
                            session.hostName = newHost.userName;
                            
                            // 새 호스트에게 권한 알림
                            newHostSocket.emit('host_transferred', {
                                message: '호스트 권한이 전달되었습니다.',
                                roomName: session.roomName
                            });
                        }
                        
                        // 모든 참가자에게 업데이트 전송
                        io.to(sessionId).emit('users_updated', { users: session.users });
                        io.to(sessionId).emit('host_changed', {
                            newHostId: newHost.id,
                            newHostName: newHost.userName,
                            message: `${userName} 호스트가 나갔습니다. ${newHost.userName}님이 새 호스트가 되었습니다.`
                        });
                        
                        // 방 목록 업데이트
                        io.emit('room_list_updated', getRoomList());
                        
                        console.log(`호스트 변경: ${session.roomName} (${sessionId}) - 새 호스트: ${newHost.userName} (${newHost.id})`);
                    } else {
                        // 남은 사용자가 없고 플레이어도 없으면 즉시 삭제
                        if (session.players.length === 0) {
                            sessions.delete(sessionId);
                            io.emit('room_list_updated', getRoomList());
                            console.log(`방 삭제: ${session.roomName} (${sessionId}) - 참여자 없음, 플레이어 없음 (즉시 삭제)`);
                        } else {
                            // 남은 사용자가 없으면 30분 타이머 시작
                            session.emptyAt = Date.now();
                            io.emit('room_list_updated', getRoomList());
                            console.log(`방 ${session.roomName} (${sessionId}) 빈 방 상태 - 30분 후 삭제 예정`);
                        }
                    }
                } else {
                    // 일반 사용자 나감
                    io.to(sessionId).emit('users_updated', { users: session.users });
                    console.log(`${userName}이(가) 방 ${session.roomName} (${sessionId})에서 나감`);
                    
                    // 남은 사용자가 없으면 체크
                    if (session.users.length === 0) {
                        // 플레이어도 없으면 즉시 삭제
                        if (session.players.length === 0) {
                            sessions.delete(sessionId);
                            io.emit('room_list_updated', getRoomList());
                            console.log(`방 삭제: ${session.roomName} (${sessionId}) - 참여자 없음, 플레이어 없음 (즉시 삭제)`);
                        } else {
                            // 플레이어가 있으면 30분 타이머 시작
                            session.emptyAt = Date.now();
                            io.emit('room_list_updated', getRoomList());
                            console.log(`방 ${session.roomName} (${sessionId}) 빈 방 상태 - 30분 후 삭제 예정`);
                        }
                    }
                }
            }
        }
    });
});

// 세션 ID 생성
function generateSessionId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 방 목록 가져오기
function getRoomList() {
    const roomList = [];
    for (const [sessionId, session] of sessions.entries()) {
        // 현재 연결된 클라이언트 수 계산
        const room = io.sockets.adapter.rooms.get(sessionId);
        const participantCount = room ? room.size : 0;
        
        roomList.push({
            sessionId,
            roomName: session.roomName || `방 ${sessionId}`,
            hostName: session.hostName || '알 수 없음',
            participantCount,
            createdAt: session.createdAt,
            isActive: sessionId === activeSessionId
        });
    }
    // 최신순으로 정렬
    return roomList.sort((a, b) => b.createdAt - a.createdAt);
}

// 오래된 세션 정리 (1시간 이상) 및 빈 방 삭제 (30분 이상)
setInterval(() => {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    const THIRTY_MINUTES = 30 * 60 * 1000;

    for (const [sessionId, session] of sessions.entries()) {
        // 참여자가 없고 플레이어도 없고 게임을 한 번도 진행하지 않은 방이면 즉시 삭제 (30분 규칙 무시)
        if (session.users.length === 0 && session.players.length === 0 && session.result === null) {
            sessions.delete(sessionId);
            io.emit('room_list_updated', getRoomList());
            console.log(`방 삭제: ${session.roomName} (${sessionId}) - 참여자 없음, 플레이어 없음, 게임 미진행 (즉시 삭제)`);
        }
        // 빈 방이 30분 이상 지났으면 삭제
        else if (session.emptyAt !== null && session.emptyAt !== undefined && now - session.emptyAt > THIRTY_MINUTES) {
            sessions.delete(sessionId);
            io.emit('room_list_updated', getRoomList());
            console.log(`방 삭제: ${session.roomName} (${sessionId}) - 빈 방 30분 경과`);
        }
        // 방 생성 후 1시간 이상 지났으면 삭제
        else if (now - session.createdAt > ONE_HOUR) {
            sessions.delete(sessionId);
            io.emit('room_list_updated', getRoomList());
            console.log(`방 삭제: ${session.roomName} (${sessionId}) - 생성 후 1시간 경과`);
        }
    }
}, 5 * 60 * 1000); // 5분마다 체크

server.listen(PORT, '0.0.0.0', () => {
    console.log(`서버 실행 중: http://0.0.0.0:${PORT}`);
});
