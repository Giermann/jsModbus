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

  // create a modbus rtu packet with pdu
  // and attach the packet to the packet pipe.
  this.write = function (unit_id, pdu) {
    var reqFifo = this.reqFifo;
    var me = this;
    setTimeout(function() { //rtu requires break
          var pkt = Put()
            .word8(unit_id)              // unit id
            .put(pdu);
          var pkt2 = pkt
            .word16le(crc.crcModbusHex(pkt.buffer()))                    // the actual pdu
            .buffer();
        reqFifo.push(pkt2);         // pipe the packet
        me._flush();
    }, 20);
  };

  this.flush = this._flush; 
  // end the connection
  this.end = function () {
    this._socket.end();
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
 *  Flush the remainig packets.
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
    that.emit("end");
  };

};

proto._handleError = function (that) {

  return function () {
//    that.emit("error");
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
    if (!that.curData || Date.now() - that.lastTime < 50)
      return;
    var data = that.curData;
    var pdu = data.slice(1, 0 + data.length - 2);
    log('PDU extracted');
    var crc = data.slice(data.length - 2, data.length);
    // TODO: think about handling crc faults
    // emit data event and let the 
    // listener handle the pdu
    that.curData = undefined;

    that.emit('data', pdu); 
}

proto._handleData = function (that) {

  return function (data) {
    if (!that.curData)
      that.curData = new Buffer(data);
    that.curData = Buffer.concat([that.curData, new Buffer(data)]);
    that.lastTime = Date.now();
    setTimeout(function() { dataReady(that); }, 60);
  };

};

exports.create = ModbusRTUClient;
