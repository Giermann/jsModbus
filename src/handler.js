
var Put = require('put');
var util = require('util');

var log = function (msg) {  }

exports.setLogger = function (logger) {
  log = logger;
};

exports.ExceptionMessage = {

  0x01 : 'ILLEGAL FUNCTION',
  0x02 : 'ILLEGAL DATA ADDRESS',
  0x03 : 'ILLEGAL DATA VALE',
  0x04 : 'SLAVE DEVICE FAILURE',
  0x05 : 'ACKNOWLEDGE',
  0x06 : 'SLAVE DEVICE BUSY',
  0x08 : 'MEMORY PARITY ERROR',
  0x0A : 'GATEWAY PATH UNAVAILABLE',
  0x0B : 'GATEWAY TARGET DEVICE FAILED TO RESPOND'

};

exports.FC = {
  readCoils		: 1,
  readInputRegister	: 4
}

exports.Server = { };

/**
 *  Server response handler. Put new function call
 *  responses in here. The parameters for the function
 *  are defined by the handle that has been delivered to 
 *  the server objects addHandler function.
 */

 function server_response_readRegisters(register) {
        var res = Put().word8(4).word8(register.length * 2);
  for (var i = 0; i < register.length; i += 1) {
    res.word16be(register[i]);
  }
      return res.buffer();
 }

function server_response_readCoils (register) {
  var flr = Math.floor(register.length / 8),
  len = register.length % 8 > 0 ? flr + 1 : flr,
  res = Put().word8(1).word8(len);

  var cntr = 0;
  for (var i = 0; i < len; i += 1 ) {
    var cur = 0;
    for (var j = 0; j < 8; j += 1) {
      var h = 1 << j;

      if (register[cntr]) {
        cur += h;
      }

      cntr += 1;
    }
    res.word8(cur);
  }
  return res.buffer();
}

function server_response_writeSingleCoil(outputAddress, outputValue) {
  var res = Put().word8(5).word16be(outputAddress)
    .word16be(outputValue?0xFF00:0x0000);
  return res.buffer();
}

function server_request_readCoils(data) {
    var pdu = data.pdu;
  var fc = pdu.readUInt8(0), // never used, should just be an example
      startAddress = pdu.readUInt16BE(1),
      quantity = pdu.readUInt16BE(3),
            param = [ startAddress, quantity ];
  return { unit_id: data.unit_id, param: param }; 
      }

function server_request_readRegisters (data) {
    var pdu = data.pdu;
        var startAddress = pdu.readUInt16BE(1),
      quantity = pdu.readUInt16BE(3),
      param = [ startAddress, quantity ];

  return { unit_id: data.unit_id, param: param };
      }

function server_request_writeSingleCoil(data) {
          var pdu = data.pdu;
       var outputAddress = pdu.readUInt16BE(1),
     outputValue = pdu.readUInt16BE(3),
           boolValue = outputValue===0xFF00?true:outputValue===0x0000?false:undefined,
       param = [ outputAddress, boolValue ];

  return { unit_id: data.unit_id, param: param };
     }

function client_response_readCoils (pdu, cb) {

    log("handling read coils response.");   

    var fc = pdu.readUInt8(0),
        byteCount = pdu.readUInt8(1),
        bitCount = byteCount * 8;

    var resp = {
      fc: fc,
      byteCount: byteCount,
      coils: [] 
    };

          var cntr = 0;
          for (var i = 0; i < byteCount; i+=1) {
            var h = 1, cur = pdu.readUInt8(2 + i);
      for (var j = 0; j < 8; j+=1) {
        resp.coils[cntr] = (cur & h) > 0 ;
        h = h << 1;
              cntr += 1;
      }     

      }

    cb(resp);

  }

  function client_response_readRegisters(pdu, cb) {
          log("handling read input register response.");

    var fc = pdu.readUInt8(0),
          byteCount = pdu.readUInt8(1);

          var resp = {
            fc: fc,
            byteCount: byteCount,
            register: []
          };

          var registerCount = byteCount / 2;

          for (var i = 0; i < registerCount; i += 1) {
            resp.register.push(pdu.readUInt16BE(2 + (i * 2)));
          }

          cb(resp);
        }

exports.Server.ResponseHandler = {
  // read coils
  1:  server_response_readCoils,
    // read holding registers
  3:  server_response_readRegisters, 
    // read input registers
  4:  server_response_readRegisters,
  // write single register
  5:  server_response_writeSingleCoil
};

/**
 *  The RequestHandler on the server side. The
 *  functions convert the incoming pdu to a 
 *  usable set of parameter that can be handled
 *  from the server objects user handler (see addHandler 
 *  function in the servers api).
 */
exports.Server.RequestHandler = {

  // ReadCoils
  1:  server_request_readCoils,

  // ReadInputRegister
  3:  server_request_readRegisters,
  4:  server_request_readRegisters,
  5:  server_request_writeSingleCoil
}

function client_response_writeSingleCoil(pdu, cb) {
          log("handling write single coil response.");

    var fc = pdu.readUInt8(0),
        outputAddress = pdu.readUInt16BE(1),
        outputValue = pdu.readUInt16BE(3);

    var resp = {
      fc: fc,
      outputAddress: outputAddress,
      outputValue: outputValue === 0x0000?false:outputValue===0xFF00?true:undefined
    };

      cb(resp);
    }

function client_response_writeSingleRegister(pdu, cb) {
            log("handling write single register response.");

            var fc = pdu.readUInt8(0),
    registerAddress = pdu.readUInt16BE(1),
    registerValue = pdu.readUInt16BE(3);

      var resp = {
        fc: fc,
        registerAddress: registerAddress,
              registerValue: registerValue
      };

      cb(resp);
    }


exports.Client = { };

/**
 *  The response handler for the client
 *  converts the pdu's delivered from the server
 *  into parameters for the users callback function.
 */
exports.Client.ResponseHandler = {
    // ReadCoils
    1:	client_response_readCoils,

    // ReadHolding/InputRegister
    3:  client_response_readRegisters,
    4:  client_response_readRegisters,
    5:  client_response_writeSingleCoil,
    6:  client_response_writeSingleRegister
        
};


