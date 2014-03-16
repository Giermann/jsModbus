var Util   = require('util'),
    Put    = require('put'),
    EventEmitter = require('events').EventEmitter,
    crc = require('crc');

var crc16table = undefined;
var log = function (msg) { Util.log(msg); }

exports.setLogger = function (logger) {
  log = logger;
};

var PROTOCOL_VERSION = 0;

/**
 *  ModbusRTUClient handles the MBAP that is the
 *  additional header used for modbus tcp protocol.
 *  It get's initialised with a simple socket providing
 *  .on, .emit and .write methods
 */

function ModbusRTUClient(serial) {

  if (!(this instanceof ModbusRTUClient)) {
    return new ModbusRTUClient(serial);
  }

  EventEmitter.call(this);

  // listen for data and connection
  this._socket = serial;
  this._socket.on('data', this._handleData(this));
  this._socket.on('open', this._handleConnection(this));
  this._socket.on('error', this._handleError(this));
  this._socket.on('close', this._handleClose(this));

  // store the requests in this fifo and 
  // flush them later
  this.reqFifo = [];
  this.reqId = 0;
  debugger;
  this.messageTimeout = this._socket;

  // create a modbus rtu packet with pdu
  // and attach the packet to the packet pipe.
  this.write = function (unit_id, pdu) {
    var reqFifo = this.reqFifo;
    var me = this;
    var pkt = Put()
        .word8(unit_id)              // unit id
        .put(pdu);
    var pkt2 = pkt
        .word16le(crc.crcModbusHex(pkt.buffer()))                    // the actual pdu
        .buffer();
    reqFifo.push(pkt2);         // pipe the packet
    me._flush();
  };

  this.flush = this._flush; 
  // end the connection
  this.end = function () {
    this.isConnected = false;
    this._socket.close();
  };

}

Util.inherits(ModbusRTUClient, EventEmitter);

var proto = ModbusRTUClient.prototype;

/**
 *  When a connection is established the 'isConnected'
 *  flag is set and the 'connect' event is emitted to the 
 *  listener. Finally the piped packets get flushed.
 */
proto._handleConnection = function (that) {
  
  return function () {
    that.isConnected = true;
    that.emit('open');
    that._flush();
  };
};

/**
 *  Flush the remaining packets.
 */
proto._flush = function () {
  if (!this.isConnected) {
    return;
  }

  while (this.reqFifo.length > 0) {
    var pkt = this.reqFifo.shift();
    this._socket.write(pkt);
  }
};

proto._handleEnd = function (that) {
  return function () {
    that.emit('end');
  };
};

proto._handleError = function (that) {
  return function () {
    that.isConnected = false;
    that.emit('error');
  };
};

proto._handleClose = function (that) {

  return function () {
    that.emit('close');
  }; 

};

/**
 *  Handle the incoming data, cut out the mbap
 *  packet and send the pdu to the listener
 *  Unfortunately data come in single bytes, so we must know when they end.
 */
function dataReady(that) {
    delete that.timeoutId;
    var data = new Buffer(that.curData);
    delete that.curData;
    var data_wo_crc = data.slice(0, data.length - 2);
    var crc_bytes = data.slice(data.length - 2, data.length);
    var crc_info = crc.crcModbusHex(data_wo_crc);
    var crcMatches = crc_bytes[1] * 256 + crc_bytes[0] == crc_info;
    var pdu = data.slice(1, data.length - 2);
    if (crcMatches)
      that.emit('data', pdu); 
    else
      that.emit('data', null);
}

proto._handleData = function (that) {
    
  return function (data) { 
    if (!that.curData)
      that.curData = [];
    that.curData.
    that.curData = Array.concat(that.curData, data);
    that.lastTime = Date.now();
    if (that.timeoutId)
      clearTimeout(that.timeoutId);
    timeoutId = setTimeout(function() { dataReady(that); }, 120);
  };

};

exports.create = ModbusRTUClient;
