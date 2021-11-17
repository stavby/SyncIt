import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dateformat from 'dateformat';
import localtunnel from 'localtunnel';
import fetch from 'node-fetch';
import fs from 'fs';
const __dirname = path.resolve();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const rooms = {};
const usernames = {};

app.use(express.static('public'));

io.on('connection', (socket) => {
    logClientInformation(socket);

    socket.emit('users', usernames);
    socket.emit('rooms', rooms);

    socket.on('newRoom', ({ roomName, username }) => {
        if (!nameValid(username)) {
            socket.emit('joinFailed', 'Invalid username');
            return;
        }
        if (!nameValid(roomName)) {
            socket.emit('joinFailed', 'Invalid room name');
            return;
        }
        if (rooms[roomName]) {
            socket.emit('joinFailed', 'A room with this name already exists');
            return;
        }
        if (Object.values(usernames).includes(username)) {
            socket.emit('joinFailed', 'A user with this username already exists');
            return;
        }
        if (Object.keys(usernames).includes(socket.id)) {
            socket.emit('joinFailed', "You're already in a room... defuq?");
            return;
        }

        socket.join(roomName);
        rooms[roomName] = {
            video: 'rubpIfLPzvU',
            currentTime: 0,
            isPlaying: false,
            members: [{ id: socket.id, isOwner: true }],
        };
        usernames[socket.id] = username;
        socket.emit('joinedRoom', roomName);
        io.emit('users', usernames);
        io.emit('rooms', rooms);
    });

    socket.on('joinRoom', ({ roomName, username }) => {
        if (!nameValid(username)) {
            socket.emit('joinFailed', 'Invalid username');
            return;
        }
        if (!rooms[roomName]) {
            socket.emit('joinFailed', "Room doesn't exist anymore");
            return;
        }
        if (Object.values(usernames).includes(username)) {
            socket.emit('joinFailed', 'A user with this username already exists');
            return;
        }
        if (Object.keys(usernames).includes(socket.id)) {
            socket.emit('joinFailed', "You're already in a room... defuq?");
            return;
        }

        socket.join(roomName);
        rooms[roomName].members.push({ id: socket.id });
        usernames[socket.id] = username;
        socket.emit('joinedRoom', roomName);
        io.emit('users', usernames);
        io.emit('rooms', rooms);
    });

    socket.on('blip', (blipData) => {
        const room = getRoomOfUser(socket.id);

        if (room && findUserInRoom(socket.id, room).isOwner) {
            socket.broadcast.to(getRoomOfUser(socket.id)).emit('blip', blipData);
        }
    });

    socket.on('leaveRoom', () => leaveRoom(socket));

    socket.on('info', () => {
        socket.emit('users', usernames);
        socket.emit('rooms', rooms);
    });

    socket.on('buffering', () => {
        const user = socket.id;
        const room = getRoomOfUser(user);

        if (room) {
            const userEntry = findUserInRoom(user, room);

            if (userEntry) {
                userEntry.isBuffering = true;
                io.to(room).emit('rooms', rooms);
            }
        }
    });

    socket.on('bufferingEnded', () => {
        const user = socket.id;
        const room = getRoomOfUser(user);

        if (room) {
            const userEntry = findUserInRoom(user, room);

            if (userEntry) {
                delete userEntry.isBuffering;
                io.to(room).emit('rooms', rooms);
            }
        }
    });

    const lastPings = [];
    socket.on('ping', (pingTime) => {
        let ping = Math.round((new Date().valueOf() - pingTime) / 2);
        const room = getRoomOfUser(socket.id);

        if (room && findUserInRoom(socket.id, room).isOwner) {
            lastPings.push(ping);
            if (lastPings.length > 5) {
                lastPings.shift();
            }

            ping = Math.round(average(lastPings));
            rooms[room].ping = ping;
            io.to(room).emit('rooms', rooms);
        }
        socket.emit('pingResult', ping);
    });

    socket.on('disconnect', (reason) => {
        log(
            `[${formatLogDateTime(new Date())}] A user has disconnected:
Socket ID: ${socket.id}
Reason: ${reason}`
        );
        leaveRoom(socket);
    });
});

setInterval(() => io.emit('ping', new Date().valueOf()), 3000);

const leaveRoom = (socket) => {
    const user = socket.id;
    const room = getRoomOfUser(user);
    if (room) {
        if (rooms[room].members.length === 1) {
            delete rooms[room];
        } else {
            const roomEntry = findUserInRoom(user, room);

            if (roomEntry) {
                rooms[room].members.splice(rooms[room].members.indexOf(roomEntry), 1);

                if (roomEntry.isOwner) {
                    rooms[room].members[0].isOwner = true;
                }
            }
        }

        socket.leave(room);
        io.emit('rooms', rooms);
    }
    if (Object.keys(usernames).includes(user)) {
        delete usernames[user];
        io.emit('users', usernames);
    }
};

const findUserInRoom = (socketId, room) => {
    return rooms[room].members.find((member) => member.id === socketId);
};

const findOwnerOfRoom = (room) => {
    return rooms[room].members.find((member) => member.isOwner);
};

const getRoomOfUser = (socketId) => {
    const room = Object.entries(rooms).find((room) => room[1].members.map((member) => member.id).includes(socketId));

    if (!room) {
        return null;
    }
    return room[0];
};

const nameValid = (name) => {
    return name.length <= 20 && /^[א-תA-Za-z0-9 ]*[א-תA-Za-z0-9][א-תA-Za-z0-9 ]*$/.test(name);
};

const formatLogDateTime = (dateTime) => dateformat(dateTime, 'dd/mm/yyyy HH:MM:ss');

const formatFileNameDate = (dateTime) => dateformat(dateTime, 'yyyy-mm-dd');

const average = (arr) => {
    return arr.reduce((a, b) => a + b) / arr.length;
};

const logClientInformation = async (socket) => {
    log(`[${formatLogDateTime(new Date())}] A user has connected:
socket ID: ${socket?.id}`);

    const ip = socket?.client?.request?.headers['x-real-ip'];
    if (!ip) {
        return;
    }
    const locationData = await fetch(`http://ip-api.com/json/${ip}`);
    if (locationData.status !== 200) {
        return;
    }
    const locationDataResult = await locationData.json();
    if (locationDataResult.status !== 'success') {
        return;
    }

    log(`IP: ${ip}
Location: ${locationDataResult.country} - ${locationDataResult.city}`);
};

(async () => {
    const tunnel = await localtunnel({ port: 80, subdomain: 'stav' });

    log(`Tunnel opened at: ${tunnel.url}`);
})();

const log = (content) => {
    const logsFolderName = 'logs';
    const currentDate = formatFileNameDate(new Date());

    console.log(content);

    if (!fs.existsSync(logsFolderName)) {
        fs.mkdirSync(logsFolderName);
    }
    fs.appendFileSync(`${logsFolderName}/${currentDate}.txt`, content + '\n');
};

httpServer.listen('80', () => log('Running ...'));
