var net       = require('net'),
    handler   = require('./handler');

var log = function () { };

exports.setLogger = function (logger) {
  log = logger;
  handler.setLogger(logger);
};

exports.createTCPClient = function (port, host, params) {

  var net              = require('net'),
      tcpClientModule    = require('./tcpClient'),
      serialClientModule = require('./serialClient');

  tcpClientModule.setLogger(log);
  serialClientModule.setLogger(log);

  var socket    = net.connect(port, host),
      tcpClient = tcpClientModule.create(socket);

  var callbacks = params;
  if (!callbacks)
    callbacks = {};

  socket.on('error', function (e) {
    if (callbacks.onError)
      callbacks.onError(e);
  });

  socket.on('connect', function () {
    if (callbacks.onOpen)
      callbacks.onOpen();
  });

  socket.on('close', function() {
    if (callbacks.onClose)
      callbacks.onClose();
  });

  var client = serialClientModule.create(
   tcpClient,
   handler.Client.ResponseHandler, params);

  client.reconnect = function () {
    socket.connect(port, host);
  };

  return client;

};


exports.createTCPServer = function (port, host, cb) {

  var net                = require('net'),
      tcpServerModule    = require('./tcpServer'),
      serialServerModule = require('./serialServer');

  tcpServerModule.setLogger(log);
  serialServerModule.setLogger(log);

  var socket = net.createServer().listen(port, host);

  socket.on('error', function (e) { cb(e); });
  socket.on('connection', function (s) {

    var tcpServer = tcpServerModule.create(s);

    var server = serialServerModule.create(
      tcpServer,
      handler.Server.RequestHandler,
      handler.Server.ResponseHandler);

    cb(null, server);

  }); 
};


exports.createRTUClient = function(device, serialSettings, params) {
    var SerialPort       = require('serialport').SerialPort,
      rtuClientModule    = require('./rtuClient'),
      serialClientModule = require('./serialClient');

    rtuClientModule.setLogger(log);
    serialClientModule.setLogger(log);
    
    var serial = new SerialPort(device, serialSettings),
        rtuClient = rtuClientModule.create(serial);

    var callbacks = params;
    var client = serialClientModule.create(
     rtuClient,
     handler.Client.ResponseHandler, params);

    if (!callbacks)
      callbacks = {};

    rtuClient.on('error', function (e) {
      if (callbacks.onError)
        callbacks.onError(e);
    });

    serial.on('open', function () {
      if (callbacks.onOpen)
        callbacks.onOpen();
    });

    serial.on('close', function() {
      if (callbacks.onClose)
        callbacks.onClose();
    });


  client.reconnect = function () {
    serial.open();
  };

  return client;

};
