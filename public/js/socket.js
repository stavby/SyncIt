const socket = io();
let rooms = {};
let usernames = {};
let myRoom;
let blipInterval;
let isInRoom;

socket.on('joinedRoom', joinedRoom);
socket.on('joinFailed', joinFailed);
socket.on('rooms', roomsData);
socket.on('users', usersData);
socket.on('blip', recieveBlip);
socket.on('ping', onPing);
socket.on('pingResult', onPingResult);
socket.on('reconnect', onReconnect);
socket.on('disconnect', onDisconnect);

socket.emit('info');
