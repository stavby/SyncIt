let isRoomBuffering;
let isRoomWaitingToPlay;
let myPing = 0;
const lastPings = [];

window.onload = () => {
    $('#login-modal').modal({ backdrop: 'static', keyboard: false });
};

const createRoom = () => {
    const roomName = $('#room-name')[0].value;
    const username = $('#username')[0].value;

    if (!roomName) {
        alert('Fill room name');
        return;
    }
    if (!username) {
        alert('Fill username');
        return;
    }
    if (!nameValid(username)) {
        alert('Invalid username');
        return;
    }
    if (!nameValid(roomName)) {
        alert('Invalid room name');
        return;
    }
    if (rooms[roomName]) {
        alert('A room with this name already exists');
        return;
    }
    if (Object.values(usernames).includes(username)) {
        alert('A user with this username already exists');
        return;
    }

    socket.emit('newRoom', { roomName, username });
};

const leaveRoom = () => {
    if (blipInterval) {
        clearInterval(blipInterval);
    }
    isInRoom = false;
    socket.emit('leaveRoom');
    $('#in-room').css('display', 'none');
    player.pauseVideo();
    $('#login-modal').modal({ backdrop: 'static', keyboard: false });
};

const joinRoom = roomName => {
    const username = $('#username')[0].value;

    if (!roomName || !rooms[roomName]) {
        alert('Invalid room');
        return;
    }
    if (!username) {
        alert('Fill username');
        return;
    }
    if (!nameValid(username)) {
        alert('Invalid username');
        return;
    }
    if (Object.values(usernames).includes(username)) {
        alert('A user with this username already exists');
        return;
    }

    socket.emit('joinRoom', { roomName, username });
};

const joinedRoom = roomName => {
    myRoom = roomName;
    updateRoomMembers();
    const mainTitle = $('#main-title')[0];

    mainTitle.innerText = 'Your room: ' + myRoom;

    $('#login-modal').modal('hide');
    $('#in-room').css('display', '');

    createYoutubePlayer();
    isInRoom = true;
    blipInterval = setInterval(sendBlip, 500);
};

const nameValid = name => {
    return name.length <= 20 && name.match(/^[A-Za-z0-9 ]+$/);
};

const sendBlip = () => {
    if (player && player.getCurrentTime && isOwner()) {
        socket.emit('blip', {
            video: player.getVideoData().video_id,
            currentTime: player.getCurrentTime(),
            isPlaying: player.getPlayerState() === playerStates.PLAYING,
        });
    }
};

const recieveBlip = blipData => {
    if (isInRoom && player && player.getCurrentTime && !isOwner()) {
        syncVideo(blipData.video);
        syncTime(blipData);

        if (!isBuffering) {
            syncPlayerState(blipData.isPlaying);
        }
    }
};

const syncVideo = video => {
    if (player.getVideoData().video_id !== video) {
        player.loadVideoById(video);
    }
};

const syncPlayerState = isPlaying => {
    if ((player.getPlayerState() === playerStates.PLAYING) !== isPlaying) {
        if (isPlaying) {
            player.playVideo();
        } else {
            player.pauseVideo();
        }
    }
};

const syncTime = blipData => {
    let desiredTime = blipData.currentTime;
    let allowedDelta = 0;

    if (blipData.isPlaying) {
        allowedDelta = 0.8;
        desiredTime += myPing / 1000;
        if (rooms && rooms[myRoom] && rooms[myRoom].ping) {
            desiredTime += rooms[myRoom].ping / 1000;
        }
    }

    if (Math.abs(player.getCurrentTime() - desiredTime) > allowedDelta) {
        player.seekTo(desiredTime);
    }
};

const isOwner = () => {
    if (rooms && myRoom && rooms[myRoom]) {
        const me = rooms[myRoom].members.find(
            member => member.id === socket.id
        );
        if (me) {
            return !!me.isOwner;
        }
    }
};

const updateRoomMembers = () => {
    if (rooms && myRoom && rooms[myRoom]) {
        const roomMembersDisplay = $('#room-members')[0];

        roomMembersDisplay.innerHTML = '<h3>Room members:</h3>';
        for (member of rooms[myRoom].members) {
            if (Object.keys(usernames).includes(member.id)) {
                roomMembersDisplay.innerHTML += `<div>
                    ${member.isOwner ? '<strong>Owner</strong>' : ''} ${
                    usernames[member.id]
                } ${member.id === socket.id ? '(You)' : ''} ${
                    member.isBuffering
                        ? `<a style='color: red'>BUFFERING</a>`
                        : ''
                }
                </div>`;
            }
        }
    }
};

const joinFailed = message => {
    alert(message);
};

const usersData = newUsers => {
    usernames = newUsers;
};

const roomsData = newRooms => {
    rooms = newRooms;

    updateLoginRooms();
    updateRoomMembers();
    updateChangeVideoSection();

    if (isOwner()) {
        const wasRoomBuffering = isRoomBuffering;
        isRoomBuffering = rooms[myRoom].members.some(
            member => member.isBuffering
        );

        if (isRoomBuffering) {
            if (!wasRoomBuffering) {
                isRoomWaitingToPlay =
                    player.getPlayerState() === playerStates.PLAYING;
                player.pauseVideo();
            }
        } else if (isRoomWaitingToPlay) {
            player.playVideo();
            isRoomWaitingToPlay = false;
        }
    }
};

const updateLoginRooms = () => {
    const roomsHTML = $('#rooms')[0];
    roomsHTML.innerHTML = '';

    for (room of Object.entries(rooms)) {
        roomsHTML.innerHTML += `<div class='my-2'>
            <strong>${room[0]}</strong> (${room[1].members.length} people) 
            <button
                type="button"
                class="btn btn-primary"
                onClick="joinRoom('${room[0]}')"
            >
                Join
            </button>
        </div>`;
    }
};

const changeVideo = () => {
    const url = $('#change-video-url')[0].value;
    const urlPreset = 'youtube.com/watch?v=';

    if (!url.includes(urlPreset)) {
        alert('Invalid video URL');
        return;
    }

    player.loadVideoById(
        url.substr(url.indexOf(urlPreset) + urlPreset.length, 11)
    );
    player.seekTo(0);
};

const updateChangeVideoSection = () => {
    $('#change-video').css('display', isOwner() ? '' : 'none');
};

const onDisconnect = () => {
    leaveRoom();
    rooms = {};
    usernames = {};
    myRoom = undefined;
    updateLoginRooms();
    alert('You were disconnected');
};

const onReconnect = () => {
    socket.emit('info');
};

const onPing = pingTime => {
    socket.emit('ping', pingTime);
};

const onPingResult = pingResult => {
    lastPings.push(pingResult);
    if (lastPings.length > 5) {
        lastPings.shift();
    }

    myPing = average(lastPings);
    $('#ping-display-number').text(Math.round(myPing) + 'ms');
};

const average = arr => {
    return arr.reduce((a, b) => a + b) / arr.length;
};