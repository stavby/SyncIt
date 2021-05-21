let isRoomBuffering;
let isRoomWaitingToPlay;
let myPing = 0;
const lastPings = [];
const minPlayerSize = { x: 100, y: 100 };

window.onload = () => {
    $('#login-modal').modal({ backdrop: 'static', keyboard: false });
    alertify.set('notifier', 'delay', 2);
};

const createRoom = () => {
    const roomNameBox = $('#room-name');
    const usernameBox = $('#username');
    const roomName = roomNameBox.val();
    const username = usernameBox.val();

    let isUsernameValid = true;
    let isRoomNameValid = true;

    if (!roomName) {
        alertify.error('Fill room name');
        isRoomNameValid = false;
    } else if (!nameValid(roomName)) {
        alertify.error('Invalid room name');
        isRoomNameValid = false;
    } else if (rooms[roomName]) {
        alertify.error('A room with this name already exists');
        isRoomNameValid = false;
    }
    if (!username) {
        alertify.error('Fill username');
        isUsernameValid = false;
    } else if (!nameValid(username)) {
        alertify.error('Invalid username');
        isUsernameValid = false;
    } else if (Object.values(usernames).includes(username)) {
        alertify.error('A user with this username already exists');
        isUsernameValid = false;
    }

    if (!isUsernameValid) {
        usernameBox.addClass('is-invalid');
    }
    if (!isRoomNameValid) {
        roomNameBox.addClass('is-invalid');
    }

    if (isUsernameValid && isRoomNameValid) {
        socket.emit('newRoom', { roomName, username });
    }
};

const leaveRoom = () => {
    if (blipInterval) {
        clearInterval(blipInterval);
    }
    isInRoom = false;
    socket.emit('leaveRoom');
    $('#in-room').css('display', 'none');
    if (player) {
        player.pauseVideo();
    }
    $('#login-modal').modal({ backdrop: 'static', keyboard: false });
};

const joinRoom = roomName => {
    const usernameBox = $('#username');
    const username = usernameBox.val();

    let isRoomValid = true;
    let isUsernameValid = true;

    if (!roomName || !rooms[roomName]) {
        alertify.error('Invalid room');
        isRoomValid = false;
    }
    if (!username) {
        alertify.error('Fill username');
        isUsernameValid = false;
    } else if (!nameValid(username)) {
        alertify.error('Invalid username');
        isUsernameValid = false;
    } else if (Object.values(usernames).includes(username)) {
        alertify.error('A user with this username already exists');
        isUsernameValid = false;
    }

    if (!isUsernameValid) {
        usernameBox.addClass('is-invalid');
    }

    if (isUsernameValid && isRoomValid) {
        socket.emit('joinRoom', { roomName, username });
    }
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
    return (
        name.length <= 20 &&
        /^[א-תA-Za-z0-9 ]*[א-תA-Za-z0-9][א-תA-Za-z0-9 ]*$/.test(name)
    );
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
    alertify.error(message);
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
        alertify.error('Invalid video URL');
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
    alertify.error('You were disconnected');
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

const resizePlayer = dragData => {
    const maxPlayerSize = { x: window.innerWidth, y: window.innerHeight };

    if (dragData.screenX != 0 && dragData.screenY != 0) {
        const playerIframe = $('#player');
        let desiredWidth = playerIframe.width() + dragData.offsetX;
        let desiredHeight = playerIframe.height() + dragData.offsetY;

        desiredWidth = Math.max(desiredWidth, minPlayerSize.x);
        desiredWidth = Math.min(desiredWidth, maxPlayerSize.x);
        desiredHeight = Math.max(desiredHeight, minPlayerSize.y);
        desiredHeight = Math.min(desiredHeight, maxPlayerSize.y);

        playerIframe.width(desiredWidth);
        playerIframe.height(desiredHeight);
    }
};

const removeIsInvalid = event => $(event.target).removeClass('is-invalid');
