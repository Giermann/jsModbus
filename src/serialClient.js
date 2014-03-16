var util    = require('util'),
    Put     = require('put');

var Handler = require('./handler');

var log = function (msg) { util.log(msg); };

exports.setLogger = function (logger) {
  log = logger;
};

var dummy = function () { },
    modbusProtocolVersion = 0,
    modbusUnitIdentifier = 1;

var ModbusClient = function (socket, resHandler, params) {

  if (!(this instanceof ModbusClient)) {
    return new ModbusClient(socket, resHandler, params);
  }

  var that = this;

  this.state = 'ready'; // ready or waiting (for response)

  this.timeout = params && params.timeout;
  console.log(this.timeout);
  this.resHandler = resHandler;

  this.isConnected = false;
  this.socket = socket;

  var open = function () {
    // release pipe content if there are any yet
    that.isConnected = true;
    that.flush();
  };
  this.socket.on('connect', open);
  this.socket.on('open', open);
  // setup data receiver
  this.socket.on('data', this.handleData(this));
  this.socket.on('close', this.handleClose(this));
  this.socket.on('end', this.handleEnd(this));

  // package and callback queues
  this.pipe = [];
  this.current = null;

  this.identifier = 0;

  /**
   *  Public functions, in general all implementations from 
   *  the function codes
   */

  function readRegister(fc) {
    return function(unit_id, start, quantity, cb) {

      var pdu = that.pduWithTwoParameter(fc, start, quantity);

      that.makeRequest(unit_id, fc, pdu, !cb?dummy:cb);

    };
  }

  var api = {

    readCoils: function (unit_id, start, quantity, cb) {
      var fc  = 1,
	  pdu = that.pduWithTwoParameter(fc, start, quantity);

      that.makeRequest(unit_id, fc, pdu, !cb?dummy:cb);
    },

    readHoldingRegister: readRegister(3),
    readInputRegister: readRegister(4),

    writeSingleCoil: function (unit_id, address, value, cb) {

      var fc = 5,
	  pdu = that.pduWithTwoParameter(fc, address, value?0xff00:0x0000);

      that.makeRequest(unit_id, fc, pdu, !cb?dummy:cb);

    },

    writeSingleRegister: function (unit_id, address, value, cb) {
      var fc = 6,
          pdu = that.pduWithTwoParameter(fc, address, value);

      that.makeRequest(unit_id, fc, pdu, !cb?dummy:cb);
    },

    isConnected: function () {
      return that.isConnected;
    },

    on: function (name, cb) {
      socket.on(name, cb);
    },

    flush: function () {
      that.flush();
    },

    close: function () {
      that.socket.end();
    }
  };

  return api;

};

var proto = ModbusClient.prototype;

/**
 * Pack up the pdu and the handler function
 * and pipes both. Calls flush in the end.
 */
proto.makeRequest = function (unit_id, fc, pdu, cb) {

  var req = { unit_id: unit_id, fc: fc, cb: cb, pdu: pdu };

  this.pipe.push(req);

  if (this.state === 'ready') {
    this.flush();
  }

};

/**
 *  Iterates through the package pipe and 
 *  sends the requests
 */
proto.flush = function () {

    if (!this.isConnected) {
        return;
    }

    if (this.pipe.length > 0 && !this.current) {
        var me = this;
        this.current = this.pipe.shift();
        this.socket.write(this.current.unit_id, this.current.pdu);
        this.state = "waiting";
        if (this.timeout)
          this.timeoutTimer = setTimeout(function() {
            me.handleData(me)('timeout');
          }, this.timeout);
    }

};


/**
 *  Returns the main response handler
 */
proto.handleData = function (that) {

  /**
   *  This is the main response handler. It simply
   *  reads the mbap first and dispatches the 
   *  pdu to the next callback in the pipe (I am not sure
   *  if the requests are handled in sequence but this is 
   *  definitivly a place where errors can occure due to wrong
   *  assigned callbacks, keep that in mind.)
   */
  return function (pdu) {

    if (!that.current) {
        return;
    }
    clearTimeout(that.timeoutTimer); 
    log('received data');

    // 1. check pdu for errors

    log("Checking pdu for errors");
    if (that.handleErrorTimeout(pdu, that.current.cb) || 
        that.handleErrorCRC(pdu, that.current.cb) ||
        that.handleErrorPDU(pdu, that.current.cb)) {
      that.state = "ready";
      that.current = null;
      that.flush();
      return;
    }      

    // 2. handle pdu

    log("Calling Callback with pdu.");
    var handler = that.resHandler[that.current.fc];
    if (!handler) { 
      throw "No handler implemented.";
    }
    handler(pdu, that.current.cb);

    that.current = null;
    that.state = "ready";
    that.flush();
    
  };

};

var ERROR_CRC = 1048576;
var ERROR_TIMEOUT = 1048577;
/**
 *  Check if the given pdu contains fc > 0x84 (error code)
 *  and return false if not, otherwise handle the error,
 *  call cb(null, err) and return true
 */
proto.handleErrorPDU = function (pdu, cb) {
  
  var errorCode = pdu.readUInt8(0);

  // if error code is smaller than 0x80
  // the pdu describes no error
  if (errorCode < 0x80) {
    return false;
  }

  log("PDU describes an error.");
  var exceptionCode = pdu.readUInt8(1);
  var message = Handler.ExceptionMessage[exceptionCode];

  var err = { 
  	errorCode: errorCode, 
  	exceptionCode: exceptionCode, 
  	message: message
  };
  
  // call the desired callback with
  // err parameter set
  cb(null, err);

  return true; 
};

proto.handleErrorTimeout = function(pdu, cb) {
  if (pdu != 'timeout')
    return false;
  cb(null, {
    errorCode: ERROR_TIMEOUT,
    exceptionCode: ERROR_TIMEOUT,
    message: Handler.ExceptionMessage[ERROR_TIMEOUT]
  });
  return true;  
};

proto.handleErrorCRC = function (pdu, cb) {
  if (pdu)
    return false;
  cb(null, {
    errorCode: ERROR_CRC,
    exceptionCode: ERROR_CRC,
    message: Handler.ExceptionMessage[ERROR_CRC]
  });
  return true;
}

/**
 *  Many requests look like this so I made
 *  this an extra function.
 */
proto.pduWithTwoParameter = function (fc, start, quantity) {
  return Put()
	.word8(fc)
	.word16be(start)
	.word16be(quantity)
	.buffer();
};

proto.handleClose = function (that) {
  return function () {
    that.isConnected = false;
  };
};

proto.handleEnd = function (that) {

  return function () {
    that.isConnected = false;
  };

};

exports.create = ModbusClient;


