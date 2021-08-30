let player;
let video = 'rubpIfLPzvU';
let isBuffering = false;
let bufferTimeout;

const createYoutubePlayer = newVideo => {
    const tag = document.createElement('script');
    tag.id = 'youtube-script';
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    if (newVideo) {
        video = newVideo;
    }
};

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '390',
        width: '640',
        videoId: video,
        events: {
            onStateChange: onPlayerStateChange,
        },
    });
}

const onPlayerStateChange = event => {
    if (isOwner()) {
        if (isPlayingOrBuffering(event.data) && isRoomBuffering) {
            player.pauseVideo();
            isRoomWaitingToPlay = true;
        }
    } else {
        if (event.data === playerStates.BUFFERING) {
            bufferTimeout = setTimeout(() => {
                if (player.getPlayerState() === playerStates.BUFFERING) {
                    socket.emit('buffering');
                    isBuffering = true;
                }
            }, 300);
        } else if (isBuffering) {
            socket.emit('bufferingEnded');
            isBuffering = false;
        }
    }
};

const playerStates = {
    BUFFERING: 3,
    CUED: 5,
    ENDED: 0,
    PAUSED: 2,
    PLAYING: 1,
    UNSTARTED: -1,
};

const isPlayingOrBuffering = state =>
    [playerStates.PLAYING, playerStates.BUFFERING].includes(state);
