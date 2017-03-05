var ws;
var received = {
    "/meta/connect": {
        "callbacks": [],
        "packets": []
    },
    "/meta/disconnect": {
        "callbacks": [],
        "packets": []
    },
    "/meta/handshake": {
        "callbacks": [],
        "packets": []
    },
    "/meta/subscribe": {
        "callbacks": [],
        "packets": []
    }
};
var subscriptions = [
    "/meta/connect",
    "/meta/disconnect",
    "/meta/handshake",
    "/meta/subscribe"
];
var clientId;

function error(str) {
    alert(str);
}

function logpkt(dir, packet) {
    console.log(dir + " " + packet);
}

function send(channel, message) {
    message.channel = channel;
    if (clientId != null) {
        message.clientId = clientId;
    }
    var packet = JSON.stringify([
        message
    ]);
    logpkt(">", packet);
    ws.send(packet);
}

function receive(channel, callback) {
    var channelIndex = subscriptions.indexOf(channel);
    if (channelIndex >= 0) {
        if (received[channel].packets.length > 0) {
            callback(received[channel].packets.shift());
        } else {
            received[channel].callbacks.push(callback);
        }
    } else {
        console.error("Not subscribed");
    }
}

function subscribe(channel, callback) {
    send("/meta/subscribe", {
        "subscription": channel
    });
    receive("/meta/subscribe", function(data) {
        if (data.successful) {
            received[channel] = {
                "callbacks": [],
                "packets": []
            };
            subscriptions.push(channel);
            callback();
        } else {
            console.error("Unsuccessful subscription");
        }
    });
}

function connect() {
    var pin = parseInt($(".connect-pin").val());
    var xhr = $.get("http://localhost/reserve/session/" + pin).done(function(data) {
        if (data == "Not found") {
            error("Invalid pin");
        } else {
            var rawToken = atob(xhr.getResponseHeader("X-Kahoot-Session-Token"));
            $.get("https://crossorigin.me/http://safeval.pw/eval?code=" + encodeURIComponent(data.challenge)).done(function(mask) {
                var token = "";
                for (var i = 0; i < rawToken.length; ++i) {
                    token += String.fromCharCode(rawToken.charCodeAt(i) ^ mask.charCodeAt(i % mask.length));
                }
                console.log(token);
                ws = new WebSocket("wss://kahoot.it/cometd/" + pin + "/" + token);
                ws.onmessage = function(event) {
                    var packet = event.data;
                    logpkt("<", packet);
                    var data = JSON.parse(packet);
                    for (var i = 0; i < data.length; ++i) {
                        var channelIndex = subscriptions.indexOf(data[i].channel);
                        if (channelIndex >= 0) {
                            if (received[data[i].channel].callbacks.length > 0) {
                                received[data[i].channel].callbacks.shift()(data[i]);
                            } else {
                                received[data[i].channel].packets.push(data[i]);
                            }
                        }
                    }
                };
                ws.onopen = function() {
                    send("/meta/handshake", {
                        "version": "1.0",
                        "minimumVersion": "1.0",
                        "supportedConnectionTypes": [
                            "websocket",
                            "long-polling"
                        ],
                        "advice": {
                            "timeout": 60000,
                            "interval": 0
                        }
                    });
                    receive("/meta/handshake", function(pkt) {
                        clientId = pkt.clientId;
                        subscribe("/service/controller", function() {
                            subscribe("/service/player", function() {
                                subscribe("/service/status", function() {
                                    send("/meta/connect", {
                                        "connectionType": "websocket",
                                        "advice": {
                                            "timeout": 0
                                        }
                                    });
                                    receive("/meta/connect", function(pkt) {
                                        if (pkt.successful) {
                                            setInterval(function() {
                                                send("/meta/connect", {
                                                    "connectionType": "websocket"
                                                });
                                            }, 5000);
                                            send("/service/controller", {
                                                "data": {
                                                    "type": "login",
                                                    "gameid": pin,
                                                    "host": "kahoot.it",
                                                    "name": "Test"
                                                }
                                            });
                                            receive("/service/controller", function(pkt) {
                                                function loop2fa(i) {
                                                    var pin2fa = "";
                                                    var chars = [
                                                        "0",
                                                        "1",
                                                        "2",
                                                        "3"
                                                    ];
                                                    for (var c = 4, j = i; c > 0; --c) {
                                                        pin2fa += chars[j % c];
                                                        chars.splice(j % c, 1);
                                                        j = Math.floor(j / c);
                                                    }
                                                    send("/service/controller", {
                                                        "data": {
                                                            "content": "{\"sequence\":\"" + pin2fa + "\"}",
                                                            "gameid": pin,
                                                            "host": "kahoot.it",
                                                            "type": "message"
                                                        }
                                                    });
                                                    receive("/service/controller", function() {
                                                        setTimeout(function() {
                                                            loop2fa(i + 1);
                                                        }, 500);
                                                    });
                                                }
                                                loop2fa(0);
                                            });
                                        } else {
                                            error("Protocol error");
                                        }
                                    });
                                });
                            });
                        });
                    });
                };
            }).fail(function() {
                error("Decoding error");
            });
        }
    }).fail(function() {
        error("Connecting error");
    });
    return false;
}
