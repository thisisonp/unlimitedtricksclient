var net = require('net');
var clientList = [];
var clientInRoom = [];
var room1Players = 0;

var room1Started = false;

var timestamp = 0;
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert')
var ObjectId = require('mongodb').ObjectID;
var url = 'mongodb://localhost:27017/psusers';

var openRegister = true;

var server = net.createServer(function(client) { //'connection' listener
	console.log('client connected');
	clientList.push(client);
	clientInRoom.push(null);
	client.on('end', function() {
		console.log('client dropped');
		if (clientInRoom[clientList.indexOf(client)].roomnumber == 1)
			room1Players = room1Players - 1;
		if (room1Players == 0)
			room1Started = false;
		clientInRoom.splice(clientList.indexOf(client), 1);
		clientList.splice(clientList.indexOf(client), 1);
	});
	client.on('error', function() {
		console.log('client error');
		if (clientInRoom[clientList.indexOf(client)].roomnumber == 1)
			room1Players = room1Players - 1;
		if (room1Players == 0)
			room1Started = false;
		clientInRoom.splice(clientList.indexOf(client), 1);
		clientList.splice(clientList.indexOf(client), 1);
	});
	client.on('data', function(data) {
		console.log('receive ' + data.toString());
		var s = data.toString();
		var len = s.length;
		var last = -1;
		var counter = 0;
		for (var i = 0; i < len; i++)
			if (s[i] == '{') counter = counter + 1;
			else if (s[i] == '}') {
				counter = counter - 1;
				if (counter == 0) {
					s1 = s.substring(last + 1, i + 1);
					console.log("process " + s1);
					last = i;
					var jsondata = JSON.parse(s1);
					if (jsondata.type == 'login') {
						if (jsondata.version !== "2") continue;
						flag = false;
						MongoClient.connect(url, function(err, db) {
							assert.equal(null, err);
							db.collection('users').findOne( { "username": jsondata.username }, function(err, user) {
								var flag = 0;
								assert.equal(err, null);
								if (!(!user)) {
									console.log("?");
									console.log(user.password);
									console.log(jsondata.password);
									if (user.password == jsondata.password) {
										var weljson = {'type' : 'ack login', 'fromwho' : '-'};
										client.write(JSON.stringify(weljson));
										timestamp = timestamp + 1;
										var newsjson = {'type' : 'join room', 'roomnumber' : 0, 'nickname' : jsondata.username, 'username' : jsondata.username, 'fromwho' : '-', 'timestamp' : timestamp};
										broadcast(JSON.stringify(newsjson), null);
										flag = true;
									}
									if (!flag) {
										var newsjson = {'type' : 'fail login', 'fromwho' : '-'};
										client.write(JSON.stringify(newsjson));
									}
								} else {
									var newsjson = {'type' : 'fail login', 'fromwho' : '-'};
									client.write(JSON.stringify(newsjson));
								}
								db.close();
							});
						});
					} else if (jsondata.type == 'register') {
						MongoClient.connect(url, function(err, db) {
							assert.equal(null, err);
							db.collection('users').findOne( { "username": jsondata.username }, function(err, user) {
								var exists = !(!user);
								if (exists || !openRegister) {
									var newsjson = {'type' : 'fail register', 'fromwho' : '-'};
									client.write(JSON.stringify(newsjson));
								} else {
									db.collection('users').insertOne(
										{'username' : jsondata.username, 'password' : jsondata.password, 'grade' : 0, 'nickname' : jsondata.username}
									);
									var newsjson = {'type' : 'good register', 'fromwho' : '-'};
									client.write(JSON.stringify(newsjson));
								}
								db.close();
							});
						});
					} else if (jsondata.type == 'ask join room') {
						if (!room1Started) {
							room1Players = room1Players + 1;
							var newsjson = {'type' : 'ack join room', 'fromwho' : '-'};
							client.write(JSON.stringify(newsjson));
							var newsjson2 = {'type' : 'join room', 'username' : jsondata.username, 'nickname' : jsondata.nickname, 'roomnumber' : 1, 'fromwho' : '-', 'timestamp' : timestamp};
							clientInRoom[clientList.indexOf(client)] = newsjson2;
							broadcast(JSON.stringify(newsjson2), null);
						}
					} else if (jsondata.type == 'ask start') {
						if (!room1Started) {
							var newsjson2 = {'type' : 'start room', 'roomnumber' : 1, 'fromwho' : '-'};
							clientInRoom[clientList.indexOf(client)] = newsjson2;
							broadcast(JSON.stringify(newsjson2), null);
							room1Started = true;
						}
					} else {
						jsondata.fromwho = '-';
						if (jsondata.type == 'start game')
							room1Started = true;
						if (jsondata.type == 'over game')
							room1Started = false;
						broadcast(JSON.stringify(jsondata), null);
					}
				}
			}
	});
	client.pipe(client);
	for (var i = 0; i < clientList.length; i++) 
		if (clientList[i] !== client && clientInRoom[i] !== null)
			client.write(JSON.stringify(clientInRoom[i]));
	console.log('we have ' + clientList.length + ' clients');
});

function broadcast(message, client){
	console.log('distribute ' + message);
	var cleanup = [];
	for (var i = 0; i < clientList.length; i++)
		if (clientList[i] !== client) {
			if (clientList[i].writable) {
				clientList[i].write(message);
			} else {
				cleanup.push(clientList[i]);
				clientList[i].destroy()
			}
		}
	for (var i = 0; i < cleanup.length; i++) {
		clientInRoom.splice(clientList.indexOf(cleanup[i]), 1);
		clientList.splice(clientList.indexOf(cleanup[i]), 1);
	};
}

server.listen(8989, function() { //'listening' listener
	console.log('server start');
});
